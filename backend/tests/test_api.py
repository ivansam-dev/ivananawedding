from __future__ import annotations

import sqlite3
from dataclasses import replace

import pytest
from fastapi.testclient import TestClient

from app.cli import cmd_backup, cmd_restore
from app.config import Settings
from app.main import create_app

ROOT_PW, LINK_PW = "root-secret", "link-secret"


@pytest.fixture
def settings(tmp_path) -> Settings:
    return Settings(
        database_path=str(tmp_path / "wedding.db"),
        root_password=ROOT_PW,
        link_password=LINK_PW,
        public_url="https://wedding.example",
        cookie_secure=False,
        session_hours=24,
        enable_docs=False,
    )


@pytest.fixture
def client(settings):
    with TestClient(create_app(settings)) as c:
        yield c


def sign_in(client: TestClient, password: str) -> dict:
    r = client.post("/api/auth/login", json={"password": password})
    assert r.status_code == 200, r.text
    return r.json()


def new_group(client: TestClient, name: str, guests: list[str]) -> dict:
    r = client.post("/api/admin/groups", json={"name": name, "guests": guests})
    assert r.status_code == 201, r.text
    return r.json()


# ---------------------------------------------------------------- signing in

def test_password_decides_the_role(client):
    assert client.post("/api/auth/login", json={"password": "nope"}).status_code == 401
    assert client.get("/api/auth/me").status_code == 401

    assert sign_in(client, ROOT_PW) == {"role": "root", "base_url": "https://wedding.example"}
    assert client.get("/api/auth/me").json()["role"] == "root"

    assert client.post("/api/auth/logout").status_code == 204
    assert client.get("/api/auth/me").status_code == 401

    assert sign_in(client, LINK_PW)["role"] == "link"


def test_cookie_is_locked_down(client):
    r = client.post("/api/auth/login", json={"password": ROOT_PW})
    cookie = r.headers["set-cookie"].lower()
    assert "httponly" in cookie and "samesite=strict" in cookie and "path=/api" in cookie


def test_admin_api_needs_a_session(client):
    for method, path in [("get", "/api/admin/links"), ("get", "/api/admin/groups"),
                         ("post", "/api/admin/import")]:
        assert getattr(client, method)(path).status_code == 401


def test_link_admin_can_only_list_links(client):
    sign_in(client, ROOT_PW)
    group = new_group(client, "The Lees", ["Grandma Lee", "Uncle David"])
    client.post("/api/auth/logout")

    sign_in(client, LINK_PW)
    r = client.get("/api/admin/links")
    assert r.status_code == 200
    assert r.json() == [{"id": group["id"], "public_id": group["public_id"], "name": "The Lees",
                         "guests": ["Grandma Lee", "Uncle David"]}]
    assert client.get("/api/admin/groups").status_code == 403
    assert client.post("/api/admin/groups", json={"name": "x"}).status_code == 403
    assert client.post(f"/api/admin/groups/{group['id']}/sent",
                       json={"kind": "invitation", "sent": True}).status_code == 403
    assert client.post("/api/admin/import", json={"csv": "name\nA"}).status_code == 403


def test_repeated_wrong_passwords_are_blocked(client):
    for _ in range(10):
        assert client.post("/api/auth/login", json={"password": "guess"}).status_code == 401
    # even the right password is refused until the window passes
    assert client.post("/api/auth/login", json={"password": ROOT_PW}).status_code == 429


def login_from(client: TestClient, ip: str, password: str) -> int:
    return client.post("/api/auth/login", json={"password": password},
                       headers={"x-real-ip": ip}).status_code


def test_guessing_from_many_addresses_cannot_lock_the_admins_out(client):
    for i in range(100):                                   # 10 addresses, 10 wrong guesses each
        assert login_from(client, f"10.0.0.{i // 10}", "guess") == 401
    # an address that hasn't been guessing can still sign in
    assert login_from(client, "192.168.1.5", ROOT_PW) == 200
    # but while that many guesses are recent, every address gets just one wrong try
    assert login_from(client, "10.9.9.9", "guess") == 401
    assert login_from(client, "10.9.9.9", "guess") == 429


def test_link_sign_in_does_not_reset_failed_guesses(client):
    ip = "10.1.1.1"
    for _ in range(9):
        assert login_from(client, ip, "guess") == 401
    assert login_from(client, ip, LINK_PW) == 200          # knowing the link password...
    assert login_from(client, ip, "guess") == 401          # ...doesn't buy more root guesses
    assert login_from(client, ip, "guess") == 429


def test_root_sign_in_resets_failed_guesses(client):
    ip = "10.2.2.2"
    for _ in range(9):
        assert login_from(client, ip, "typo") == 401
    assert login_from(client, ip, ROOT_PW) == 200
    for _ in range(9):
        assert login_from(client, ip, "typo") == 401       # a fresh allowance after signing in


def test_changing_the_password_signs_people_out(settings):
    with TestClient(create_app(settings)) as c:
        sign_in(c, ROOT_PW)
        token = c.cookies.get("wedding_admin")
    with TestClient(create_app(replace(settings, root_password="new-root"))) as c:
        headers = {"Cookie": f"wedding_admin={token}"}
        assert c.get("/api/auth/me", headers=headers).status_code == 401
        assert c.post("/api/auth/login", json={"password": ROOT_PW}).status_code == 401
        sign_in(c, "new-root")


def test_blank_env_password_keeps_the_stored_one(settings):
    with TestClient(create_app(settings)):
        pass
    with TestClient(create_app(replace(settings, root_password=""))) as c:
        sign_in(c, ROOT_PW)


def test_passwords_must_differ(settings):
    with pytest.raises(RuntimeError):
        with TestClient(create_app(replace(settings, link_password=ROOT_PW))):
            pass


# ---------------------------------------------------------------- the guest's link

def test_invite_lists_names_in_rank_order(client):
    sign_in(client, ROOT_PW)
    g = new_group(client, "Tran household", ["Minh Tran", "Linh Tran"])
    g = client.post(f"/api/admin/groups/{g['id']}/guests", json={"name": "  Baby   Tran "}).json()
    ids = {x["name"]: x["id"] for x in g["guests"]}
    assert list(ids) == ["Minh Tran", "Linh Tran", "Baby Tran"]

    order = [ids["Linh Tran"], ids["Minh Tran"], ids["Baby Tran"]]
    r = client.put(f"/api/admin/groups/{g['id']}/order", json={"guest_ids": order})
    assert [x["rank"] for x in r.json()["guests"]] == [0, 1, 2]

    client.post("/api/auth/logout")  # guests aren't signed in
    r = client.get(f"/api/invite/{g['public_id']}")
    assert r.json()["names"] == ["Linh Tran", "Minh Tran", "Baby Tran"]
    assert r.json()["letters"] == ["save_the_date"]
    assert [(x["id"], x["name"], x["tea_rsvp"], x["reception_rsvp"], x["dietary"]) for x in r.json()["guests"]] == [
        (ids["Linh Tran"], "Linh Tran", "no_response", "no_response", ""),
        (ids["Minh Tran"], "Minh Tran", "no_response", "no_response", ""),
        (ids["Baby Tran"], "Baby Tran", "no_response", "no_response", ""),
    ]
    assert client.get(f"/api/invite/{g['public_id'].upper()}").status_code == 200


def test_guests_reply_from_their_link(client):
    sign_in(client, ROOT_PW)
    g = new_group(client, "Tran household", ["Minh Tran", "Linh Tran", "Baby Tran"])
    other = new_group(client, "Nguyen household", ["Hoa Nguyen"])
    minh, linh, baby = (x["id"] for x in g["guests"])
    client.post("/api/auth/logout")  # guests aren't signed in

    url = f"/api/invite/{g['public_id']}/rsvp"
    answers = lambda r: [(x["tea_rsvp"], x["reception_rsvp"], x["dietary"]) for x in r.json()["guests"]]  # noqa: E731
    r = client.post(url, json={"replies": [
        {"guest_id": minh, "tea_rsvp": "attending", "reception_rsvp": "attending", "dietary": "  no   peanuts "},
        {"guest_id": linh, "tea_rsvp": "not_attending", "reception_rsvp": "attending", "dietary": "Halal"},
    ]})
    assert r.status_code == 200, r.text
    assert answers(r) == [
        ("attending", "attending", "no peanuts"), ("not_attending", "attending", "Halal"),
        ("no_response", "no_response", "")]

    # a guest can change their mind; anyone left out, and any event left out, keeps their answer
    r = client.post(url, json={"replies": [{"guest_id": minh, "reception_rsvp": "not_attending", "dietary": "no peanuts"}]})
    assert answers(r)[0] == ("attending", "not_attending", "no peanuts")  # still coming to the tea ceremony
    r = client.post(url, json={"replies": [{"guest_id": minh, "tea_rsvp": "not_attending", "dietary": "ignored"}]})
    assert answers(r)[0] == ("not_attending", "not_attending", "")  # dietary only kept for someone coming
    assert answers(r)[1] == ("not_attending", "attending", "Halal")

    # only this link's guests, only real answers, at least one of them, and the admin sees it
    assert client.post(url, json={"replies": [{"guest_id": other["guests"][0]["id"], "tea_rsvp": "attending"}]}).status_code == 422
    assert client.post(url, json={"replies": [{"guest_id": baby, "tea_rsvp": "no_response"}]}).status_code == 422
    assert client.post(url, json={"replies": [{"guest_id": baby, "dietary": "Vegetarian"}]}).status_code == 422
    assert client.post(url, json={"replies": [{"guest_id": baby, "rsvp": "attending"}]}).status_code == 422  # the old shape
    assert client.post(url, json={"replies": [{"guest_id": baby, "reception_rsvp": "attending", "dietary": "x" * 301}]}).status_code == 422
    assert client.post(url, json={"replies": []}).status_code == 422
    assert client.post("/api/invite/zzzzzzzz/rsvp", json={"replies": [{"guest_id": baby, "tea_rsvp": "attending"}]}).status_code == 404

    client.post(url, json={"replies": [{"guest_id": baby, "reception_rsvp": "attending", "dietary": "Vegetarian"}]})
    sign_in(client, ROOT_PW)
    group = next(x for x in client.get("/api/admin/groups").json() if x["id"] == g["id"])
    baby_now = group["guests"][2]
    assert (baby_now["tea_rsvp"], baby_now["reception_rsvp"], baby_now["dietary"]) == ("no_response", "attending", "Vegetarian")
    r = client.patch(f"/api/admin/guests/{baby}", json={"dietary": "Vegan"})
    assert r.json()["guests"][2]["dietary"] == "Vegan"


def test_unknown_or_malformed_links_are_404(client):
    assert client.get("/api/invite/zzzzzzzz").status_code == 404
    assert client.get("/api/invite/a.b").status_code == 404


def test_reorder_must_list_everyone(client):
    sign_in(client, ROOT_PW)
    g = new_group(client, "A", ["One", "Two"])
    r = client.put(f"/api/admin/groups/{g['id']}/order", json={"guest_ids": [g["guests"][0]["id"]]})
    assert r.status_code == 422


# ---------------------------------------------------------------- RSVP, sent, moving

def test_rsvp_and_sent_tracking(client):
    sign_in(client, ROOT_PW)
    g = new_group(client, "Family", ["A", "B"])
    a, b = (x["id"] for x in g["guests"])

    g = client.post(f"/api/admin/groups/{g['id']}/sent", json={"kind": "save_the_date", "sent": True}).json()
    assert all(x["save_the_date_sent_at"] for x in g["guests"])
    assert all(x["invitation_sent_at"] is None for x in g["guests"])
    assert g["guests"][0]["save_the_date_sent_at"].endswith("+00:00")

    g = client.patch(f"/api/admin/guests/{b}", json={"save_the_date_sent": False, "reception_rsvp": "attending"}).json()
    assert [bool(x["save_the_date_sent_at"]) for x in g["guests"]] == [True, False]
    assert [(x["tea_rsvp"], x["reception_rsvp"]) for x in g["guests"]] == [("no_response", "no_response"), ("no_response", "attending")]
    g = client.patch(f"/api/admin/guests/{b}", json={"tea_rsvp": "not_attending"}).json()
    assert (g["guests"][1]["tea_rsvp"], g["guests"][1]["reception_rsvp"]) == ("not_attending", "attending")

    assert client.patch(f"/api/admin/guests/{a}", json={"tea_rsvp": "maybe"}).status_code == 422
    assert client.patch(f"/api/admin/guests/{a}", json={"reception_rsvp": "maybe"}).status_code == 422
    assert client.patch(f"/api/admin/guests/{a}", json={"name": "   "}).status_code == 422


def test_moving_a_guest_renumbers_both_groups(client):
    sign_in(client, ROOT_PW)
    one = new_group(client, "One", ["A", "B", "C"])
    two = new_group(client, "Two", ["D"])
    a = one["guests"][0]["id"]

    moved = client.patch(f"/api/admin/guests/{a}", json={"group_id": two["id"]}).json()
    assert moved["id"] == two["id"]
    assert [(x["name"], x["rank"]) for x in moved["guests"]] == [("D", 0), ("A", 1)]

    groups = {g["name"]: g for g in client.get("/api/admin/groups").json()}
    assert [(x["name"], x["rank"]) for x in groups["One"]["guests"]] == [("B", 0), ("C", 1)]

    assert client.patch(f"/api/admin/guests/{a}", json={"group_id": 9999}).status_code == 404


def test_deleting(client):
    sign_in(client, ROOT_PW)
    g = new_group(client, "Family", ["A", "B", "C"])
    after = client.delete(f"/api/admin/guests/{g['guests'][0]['id']}").json()
    assert [(x["name"], x["rank"]) for x in after["guests"]] == [("B", 0), ("C", 1)]

    assert client.delete(f"/api/admin/groups/{g['id']}").status_code == 204
    assert client.get("/api/admin/groups").json() == []
    assert client.get(f"/api/invite/{g['public_id']}").status_code == 404


# ---------------------------------------------------------------- CSV import

CSV = """﻿Group,Name,Rank,RSVP
The Lees,Uncle David,2,
The Lees,Grandma Lee,1,yes
Tran household,Linh Tran,,
Tran household,Minh Tran,,no
,Sarah Jones,,
the lees,Aunt Mei,,
The Lees,,,
"""


def test_import_groups_ranks_and_is_repeatable(client):
    sign_in(client, ROOT_PW)
    r = client.post("/api/admin/import", json={"csv": CSV})
    assert r.json() == {"groups_created": 3, "guests_added": 6, "guests_skipped": 0, "guests_updated": 0, "rows_ignored": 1}

    groups = {g["name"]: g for g in client.get("/api/admin/groups").json()}
    assert list(groups) == ["Sarah Jones", "The Lees", "Tran household"]  # alphabetical
    assert [x["name"] for x in groups["The Lees"]["guests"]] == ["Grandma Lee", "Uncle David", "Aunt Mei"]
    assert [x["name"] for x in groups["Tran household"]["guests"]] == ["Linh Tran", "Minh Tran"]
    # one RSVP column answers for both events
    assert [x["tea_rsvp"] for x in groups["The Lees"]["guests"]] == ["attending", "no_response", "no_response"]
    assert [x["reception_rsvp"] for x in groups["The Lees"]["guests"]] == ["attending", "no_response", "no_response"]
    assert groups["Tran household"]["guests"][1]["tea_rsvp"] == "not_attending"
    assert groups["Tran household"]["guests"][1]["reception_rsvp"] == "not_attending"

    again = client.post("/api/admin/import", json={"csv": CSV}).json()
    assert again == {"groups_created": 0, "guests_added": 0, "guests_skipped": 6, "guests_updated": 0, "rows_ignored": 1}


def test_import_reads_an_rsvp_for_each_event(client):
    sign_in(client, ROOT_PW)
    client.post("/api/admin/import", json={"csv": (
        "Group,Name,Tea Ceremony RSVP,Reception,RSVP\n"
        "The Lees,Grandma Lee,yes,no,no\n"
        "The Lees,Uncle David,,yes,yes\n")})
    (lees,) = client.get("/api/admin/groups").json()
    # an event's own column wins over the one for both, even when it's blank
    assert [(x["tea_rsvp"], x["reception_rsvp"]) for x in lees["guests"]] == [
        ("attending", "not_attending"), ("no_response", "attending")]

    client.post("/api/admin/import", json={"csv": "group,name,tea_rsvp\nWork,Sam Park,declined\n"})
    work = next(g for g in client.get("/api/admin/groups").json() if g["name"] == "Work")
    assert (work["guests"][0]["tea_rsvp"], work["guests"][0]["reception_rsvp"]) == ("not_attending", "no_response")


def test_import_adds_to_an_existing_group_after_its_guests(client):
    sign_in(client, ROOT_PW)
    new_group(client, "The Lees", ["Grandpa Lee"])
    client.post("/api/admin/import", json={"csv": "group;name\nThe Lees;Grandma Lee\n"})
    (lees,) = client.get("/api/admin/groups").json()
    assert [(x["name"], x["rank"]) for x in lees["guests"]] == [("Grandpa Lee", 0), ("Grandma Lee", 1)]


def test_import_reads_guest_category_and_fills_it_in_on_reimport(client):
    sign_in(client, ROOT_PW)
    client.post("/api/admin/import", json={"csv": "group,name\nThe Lees,Grandma Lee\nThe Lees,Uncle David\n"})
    r = client.post("/api/admin/import", json={"csv": (
        "Group,Name,Guest Category\n"
        "The Lees,Grandma Lee,  Bride's   family \n"
        "The Lees,Uncle David,\n"
        "Work,Sam Park,Friends\n")})
    assert r.json() == {"groups_created": 1, "guests_added": 1, "guests_skipped": 1,
                        "guests_updated": 1, "rows_ignored": 0}
    groups = {g["name"]: g for g in client.get("/api/admin/groups").json()}
    assert [x["category"] for x in groups["The Lees"]["guests"]] == ["Bride's family", ""]
    assert groups["Work"]["guests"][0]["category"] == "Friends"

    guest_id = groups["The Lees"]["guests"][1]["id"]
    r = client.patch(f"/api/admin/guests/{guest_id}", json={"category": " Groom's family "})
    assert r.json()["guests"][1]["category"] == "Groom's family"
    r = client.patch(f"/api/admin/guests/{guest_id}", json={"category": ""})
    assert r.json()["guests"][1]["category"] == ""
    assert client.patch(f"/api/admin/guests/{guest_id}", json={"category": "x" * 61}).status_code == 422


def test_import_reads_guest_location_and_fills_it_in_on_reimport(client):
    sign_in(client, ROOT_PW)
    client.post("/api/admin/import", json={"csv": "group,name,guest category\nThe Lees,Grandma Lee,Family\n"})
    r = client.post("/api/admin/import", json={"csv": (
        "Group,Name,Guest Location\n"
        "The Lees,Grandma Lee,  Kuala   Lumpur \n"
        "Work,Sam Park,Singapore\n")})
    assert r.json() == {"groups_created": 1, "guests_added": 1, "guests_skipped": 0,
                        "guests_updated": 1, "rows_ignored": 0}
    groups = {g["name"]: g for g in client.get("/api/admin/groups").json()}
    lee = groups["The Lees"]["guests"][0]
    assert (lee["category"], lee["location"]) == ("Family", "Kuala Lumpur")  # category kept
    assert groups["Work"]["guests"][0]["location"] == "Singapore"

    r = client.patch(f"/api/admin/guests/{lee['id']}", json={"location": ""})
    assert r.json()["guests"][0]["location"] == ""
    assert client.patch(f"/api/admin/guests/{lee['id']}", json={"location": "x" * 61}).status_code == 422


def test_upgrade_adds_category_to_an_older_database(settings):
    con = sqlite3.connect(settings.database_path)
    con.executescript("""
        CREATE TABLE groups (id INTEGER PRIMARY KEY, public_id VARCHAR(32) UNIQUE, name VARCHAR(120),
                             created_at DATETIME);
        CREATE TABLE guests (id INTEGER PRIMARY KEY, group_id INTEGER REFERENCES groups(id) ON DELETE CASCADE,
                             name VARCHAR(60), rank INTEGER, rsvp VARCHAR(16), save_the_date_sent_at DATETIME,
                             invitation_sent_at DATETIME, created_at DATETIME, updated_at DATETIME);
        INSERT INTO groups VALUES (1, 'abc', 'Old', '2026-01-01');
        INSERT INTO guests VALUES (1, 1, 'Ana', 0, 'attending', NULL, NULL, '2026-01-01', '2026-01-01');
        INSERT INTO guests VALUES (2, 1, 'Bo', 1, 'not_attending', NULL, NULL, '2026-01-01', '2026-01-01');
        INSERT INTO guests VALUES (3, 1, 'Cy', 2, 'no_response', NULL, NULL, '2026-01-01', '2026-01-01');
    """)
    con.commit()
    con.close()
    with TestClient(create_app(settings)) as c:
        sign_in(c, ROOT_PW)
        (group,) = c.get("/api/admin/groups").json()
        assert group["guests"][0]["category"] == ""
        assert group["guests"][0]["location"] == ""
        assert c.get("/api/letters").json()["letters"] == ["save_the_date"]  # from before the letters
        # the one answer from before the tea ceremony had its own holds for both events
        assert [(x["tea_rsvp"], x["reception_rsvp"]) for x in group["guests"]] == [
            ("attending", "attending"), ("not_attending", "not_attending"), ("no_response", "no_response")]
        g = c.post(f"/api/admin/groups/{group['id']}/guests", json={"name": "Di"}).json()
        assert (g["guests"][3]["tea_rsvp"], g["guests"][3]["reception_rsvp"]) == ("no_response", "no_response")

    with TestClient(create_app(settings)) as c:  # upgrading again changes nothing
        sign_in(c, ROOT_PW)
        (group,) = c.get("/api/admin/groups").json()
        assert [x["tea_rsvp"] for x in group["guests"]] == ["attending", "not_attending", "no_response", "no_response"]


def test_import_needs_a_name_heading(client):
    sign_in(client, ROOT_PW)
    r = client.post("/api/admin/import", json={"csv": "Ivan,Ana\nBob,Sue\n"})
    assert r.status_code == 422 and "name" in r.json()["detail"]
    assert client.post("/api/admin/import", json={"csv": "  \n"}).status_code == 422


def test_clear_list_then_import_fresh(client):
    sign_in(client, ROOT_PW)
    old = new_group(client, "Old list", ["A", "B"])
    new_group(client, "Another", ["C"])

    assert client.post("/api/admin/clear", json={}).status_code == 422
    assert client.post("/api/admin/clear", json={"confirm": "yes"}).status_code == 422
    assert len(client.get("/api/admin/groups").json()) == 2  # nothing was touched

    r = client.post("/api/admin/clear", json={"confirm": "delete"})
    assert r.json() == {"groups_deleted": 2, "guests_deleted": 3}
    assert client.get("/api/admin/groups").json() == []
    assert client.get(f"/api/invite/{old['public_id']}").status_code == 404

    client.post("/api/admin/import", json={"csv": "group,name\nOld list,A\n"})
    (again,) = client.get("/api/admin/groups").json()
    assert again["public_id"] != old["public_id"]  # a re-imported group gets a new link

    client.post("/api/auth/logout")
    sign_in(client, ROOT_PW)  # the admin passwords survive a clear


def test_link_admin_cannot_clear(client):
    sign_in(client, LINK_PW)
    assert client.post("/api/admin/clear", json={"confirm": "delete"}).status_code == 403


# ---------------------------------------------------------------- letters (save the date, invitation, RSVP, details)

def letters(client: TestClient) -> list[tuple[str, bool, int]]:
    r = client.get("/api/admin/letters")
    assert r.status_code == 200, r.text
    return [(x["kind"], x["active"], x["rank"]) for x in r.json()]


def opener(client: TestClient) -> str:
    (kind,) = [x["kind"] for x in client.get("/api/admin/letters").json() if x["opens_first"]]
    return kind


def test_only_the_save_the_date_is_active_at_first(client):
    sign_in(client, ROOT_PW)
    group = new_group(client, "The Lees", ["Grandma Lee"])
    assert letters(client) == [("save_the_date", True, 1), ("invitation", False, 2), ("rsvp", False, 3), ("details", False, 4)]
    assert opener(client) == "save_the_date"
    client.post("/api/auth/logout")  # guests aren't signed in
    r = client.get(f"/api/invite/{group['public_id']}").json()
    assert (r["letters"], r["opens"]) == (["save_the_date"], "save_the_date")
    assert client.get("/api/letters").json() == {"letters": ["save_the_date"], "opens": "save_the_date"}


def test_active_letters_come_earliest_first(client):
    sign_in(client, ROOT_PW)
    group = new_group(client, "The Lees", ["Grandma Lee"])

    def shown() -> list[str]:
        return client.get(f"/api/invite/{group['public_id']}").json()["letters"]

    r = client.patch("/api/admin/letters/invitation", json={"active": True})
    assert r.status_code == 200, r.text
    assert shown() == ["save_the_date", "invitation"]

    # rank 2 is the invitation's, so the two swap
    r = client.patch("/api/admin/letters/save_the_date", json={"rank": 2})
    assert [(x["kind"], x["rank"]) for x in r.json()] == [("invitation", 1), ("save_the_date", 2), ("rsvp", 3), ("details", 4)]
    assert shown() == ["invitation", "save_the_date"]
    assert client.get("/api/letters").json()["letters"] == ["invitation", "save_the_date"]


def test_the_admin_picks_the_letter_cards_open_on(client):
    sign_in(client, ROOT_PW)
    group = new_group(client, "The Lees", ["Grandma Lee"])

    def card() -> tuple[list[str], str]:
        r = client.get(f"/api/invite/{group['public_id']}").json()
        return r["letters"], r["opens"]

    # switching letters on leaves the card opening where it did
    for kind in ("invitation", "rsvp", "details"):
        assert client.patch(f"/api/admin/letters/{kind}", json={"active": True}).status_code == 200
    assert card() == (["save_the_date", "invitation", "rsvp", "details"], "save_the_date")

    # the invitation, though it isn't the newest
    r = client.patch("/api/admin/letters/invitation", json={"opens_first": True})
    assert r.status_code == 200, r.text
    assert [x["kind"] for x in r.json() if x["opens_first"]] == ["invitation"]
    assert card() == (["save_the_date", "invitation", "rsvp", "details"], "invitation")

    # the letter cards open on can't be switched off until another opens first
    r = client.patch("/api/admin/letters/invitation", json={"active": False})
    assert r.status_code == 422 and "open" in r.json()["detail"]
    assert client.patch("/api/admin/letters/save_the_date", json={"active": False}).status_code == 200
    assert card() == (["invitation", "rsvp", "details"], "invitation")

    # picking a letter that is off switches it on
    r = client.patch("/api/admin/letters/save_the_date", json={"opens_first": True})
    assert r.status_code == 200, r.text
    assert card() == (["save_the_date", "invitation", "rsvp", "details"], "save_the_date")
    assert client.patch("/api/admin/letters/invitation", json={"active": False}).status_code == 200

    # it can't be unpicked, only replaced, and can't be picked while switching it off
    assert client.patch("/api/admin/letters/rsvp", json={"opens_first": False}).status_code == 422
    assert client.patch("/api/admin/letters/rsvp", json={"opens_first": True, "active": False}).status_code == 422
    assert opener(client) == "save_the_date"


def test_one_letter_must_stay_active(client):
    sign_in(client, ROOT_PW)
    r = client.patch("/api/admin/letters/save_the_date", json={"active": False})
    assert r.status_code == 422 and "active" in r.json()["detail"]
    # switching off a letter that is already off is fine
    assert client.patch("/api/admin/letters/invitation", json={"active": False}).status_code == 200
    assert client.get("/api/letters").json()["letters"] == ["save_the_date"]


def test_letter_ranks_and_kinds_are_checked(client):
    sign_in(client, ROOT_PW)
    for body in ({"rank": 0}, {"rank": 5}, {"rank": "x"}, {"active": "maybe"}):
        assert client.patch("/api/admin/letters/invitation", json=body).status_code == 422, body
    assert client.patch("/api/admin/letters/thank_you", json={"active": True}).status_code == 422
    # a refused change leaves everything as it was, even the parts that were fine
    assert client.patch("/api/admin/letters/save_the_date", json={"rank": 2, "active": False}).status_code == 422
    assert letters(client) == [("save_the_date", True, 1), ("invitation", False, 2), ("rsvp", False, 3), ("details", False, 4)]


def test_only_root_can_change_letters(client):
    assert client.get("/api/admin/letters").status_code == 401
    assert client.patch("/api/admin/letters/invitation", json={"active": True}).status_code == 401
    sign_in(client, LINK_PW)
    assert client.get("/api/admin/letters").status_code == 403
    assert client.patch("/api/admin/letters/invitation", json={"active": True}).status_code == 403


def test_upgrade_adds_missing_letters_and_closes_rank_gaps(settings):
    with TestClient(create_app(settings)):
        pass
    con = sqlite3.connect(settings.database_path)
    # as if the card had only the save the date and the invitation, with the invitation switched on,
    # from before the admin could pick the letter cards open on
    con.execute("DELETE FROM letters WHERE kind IN ('rsvp', 'details')")
    con.execute("UPDATE letters SET rank = 5, active = 1 WHERE kind = 'invitation'")
    con.execute("UPDATE letters SET opens_first = 0")
    con.commit()
    con.close()
    with TestClient(create_app(settings)) as c:
        sign_in(c, ROOT_PW)
        # the new letters arrive switched off, ranked above the others as the newest; nothing guests see changes
        assert letters(c) == [("save_the_date", True, 1), ("invitation", True, 2), ("rsvp", False, 3), ("details", False, 4)]
        assert c.get("/api/letters").json() == {"letters": ["save_the_date", "invitation"], "opens": "invitation"}


# ---------------------------------------------------------------- backups

def test_backup_and_restore(client, settings, tmp_path):
    sign_in(client, ROOT_PW)
    new_group(client, "Kept", ["A"])
    backup = tmp_path / "backup.db"
    cmd_backup(settings, str(backup))
    assert sqlite3.connect(backup).execute("pragma journal_mode").fetchone()[0] == "delete"

    new_group(client, "Added later", ["B"])
    cmd_restore(settings, str(backup))
    assert [g["name"] for g in client.get("/api/admin/groups").json()] == ["Kept"]


def test_restore_keeps_the_env_passwords(settings, tmp_path):
    with TestClient(create_app(settings)):
        pass
    backup = tmp_path / "old.db"
    cmd_backup(settings, str(backup))  # holds the old root password

    changed = replace(settings, root_password="new-root")
    with TestClient(create_app(changed)) as c:
        cmd_restore(changed, str(backup))
        assert c.post("/api/auth/login", json={"password": ROOT_PW}).status_code == 401
        sign_in(c, "new-root")
