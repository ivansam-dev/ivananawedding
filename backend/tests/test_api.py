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
    assert r.json() == {"names": ["Linh Tran", "Minh Tran", "Baby Tran"]}
    assert client.get(f"/api/invite/{g['public_id'].upper()}").status_code == 200


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

    g = client.patch(f"/api/admin/guests/{b}", json={"save_the_date_sent": False, "rsvp": "attending"}).json()
    assert [bool(x["save_the_date_sent_at"]) for x in g["guests"]] == [True, False]
    assert [x["rsvp"] for x in g["guests"]] == ["no_response", "attending"]

    assert client.patch(f"/api/admin/guests/{a}", json={"rsvp": "maybe"}).status_code == 422
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
    assert r.json() == {"groups_created": 3, "guests_added": 6, "guests_skipped": 0, "rows_ignored": 1}

    groups = {g["name"]: g for g in client.get("/api/admin/groups").json()}
    assert list(groups) == ["Sarah Jones", "The Lees", "Tran household"]  # alphabetical
    assert [x["name"] for x in groups["The Lees"]["guests"]] == ["Grandma Lee", "Uncle David", "Aunt Mei"]
    assert [x["name"] for x in groups["Tran household"]["guests"]] == ["Linh Tran", "Minh Tran"]
    assert [x["rsvp"] for x in groups["The Lees"]["guests"]] == ["attending", "no_response", "no_response"]
    assert groups["Tran household"]["guests"][1]["rsvp"] == "not_attending"

    again = client.post("/api/admin/import", json={"csv": CSV}).json()
    assert again == {"groups_created": 0, "guests_added": 0, "guests_skipped": 6, "rows_ignored": 1}


def test_import_adds_to_an_existing_group_after_its_guests(client):
    sign_in(client, ROOT_PW)
    new_group(client, "The Lees", ["Grandpa Lee"])
    client.post("/api/admin/import", json={"csv": "group;name\nThe Lees;Grandma Lee\n"})
    (lees,) = client.get("/api/admin/groups").json()
    assert [(x["name"], x["rank"]) for x in lees["guests"]] == [("Grandpa Lee", 0), ("Grandma Lee", 1)]


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
