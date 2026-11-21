# Ivan & Ana: save the date

The save-the-date card, plus a small backend for the guest list: who is in which group, who is
named first on the card, who has RSVP'd, and who has been sent the save the date and the invitation.

```
guest ─► Cloudflare ─► cloudflared ─► web (nginx) ─┬─► the card        frontend/public/
                                                   └─► /api/ ─► api (FastAPI) ─► SQLite (Docker volume)
```

| Path | What it is |
|---|---|
| `frontend/public/index.html` | The card. A group's link looks like `https://yourdomain.com/k3m9xq2p`; the page asks the API for that group's names and puts them after "Dear". |
| `frontend/public/admin.js`, `admin.css` | The guest list. Only downloaded when someone taps 囍 five times. |
| `frontend/nginx.conf` | Serves the card and passes `/api/` to the backend. |
| `backend/app/` | FastAPI + SQLite: guests, groups, sign-in, CSV import. |
| `guests.example.csv` | The import format. |

## First run

1. `make dev`. The first time, it creates `.env` and stops.
2. In `.env`, set `ROOT_ADMIN_PASSWORD` and `LINK_ADMIN_PASSWORD` (they must be different).
3. `make dev` again, then open http://localhost:8080.
4. On the language screen, tap 囍 five times and enter the root password.
5. Import a CSV, or add groups by hand.

## Commands

| Command | Does |
|---|---|
| `make dev` | Runs on this machine. Edits in `frontend/public/` and `backend/app/` show up without rebuilding. Ctrl-C stops it. |
| `make up` | Runs in the background and comes back after a reboot (once Docker starts). Also runs cloudflared if `CLOUDFLARE_TUNNEL_TOKEN` is set. |
| `make down`, `make logs`, `make ps` | Stop, follow the logs, show status. |
| `make export-db` | Saves a copy of the database to `exports/wedding-<date>-<time>.db`. It's a normal SQLite file, so DB Browser for SQLite or similar can open it. |
| `make restore-db FILE=exports/….db` | Replaces the guest list with a saved copy (asks first). |
| `make set-password ROLE=root` | Changes a password without keeping it in `.env`. Use `ROLE=link` for the other one. |
| `make test` | Backend tests, in Docker. |

`make dev` and `make up` share one database. It lives in the Docker volume `wedding_wedding-data`, so it
survives restarts and rebuilds. `make down` keeps it; only `docker compose down -v` deletes it.

## Going live with Cloudflare Tunnel

1. Cloudflare dashboard → Zero Trust → Networks → Tunnels → create a tunnel (type cloudflared), and
   copy the token from the Docker install command it shows.
2. In `.env`, set `CLOUDFLARE_TUNNEL_TOKEN=<token>` and `PUBLIC_URL=https://yourdomain.com`.
3. On the tunnel's Public Hostname tab, add your domain with service type **HTTP** and URL **web:80**.
4. `make up`.

If cloudflared already runs on this machine outside Docker, leave the token blank and point that
tunnel at `http://localhost:8080` instead.

## Admin mode

Tap 囍 five times on the language screen, then enter a password. The password decides the level:

- **root** can do everything:
  - add, rename and delete groups and guests
  - import a CSV
  - move a guest to another group, or to a new one
  - set the order names appear on the card (↑ ↓)
  - set each guest's RSVP: attending, not attending or no response
  - mark the **save the date** and the **invitation** as sent, for a whole group at once or one guest at a time
  
  The totals at the top and the filter (e.g. "Save the date not sent") show who is left.
- **link** sees each group and who is in it, with a **Copy link** button, and nothing else.

A device stays signed in for `SESSION_HOURS` (72 by default), and tapping 囍 five times again goes
straight in. After 10 wrong passwords from one address within 15 minutes, that address has to wait.

Passwords are stored hashed (scrypt) in the database. Each time the site starts, a password set in
`.env` replaces the stored one and signs out devices using the old one. A blank one keeps whatever was
last set with `make set-password`.

## Guest list CSV

```
group,name,rank
The Lees,Grandma Lee,1
The Lees,Uncle David,2
,Sarah Jones,
```

- **name** (required) is printed exactly as written after "Dear".
- **group**: guests with the same group share one link and are greeted together. Leave it blank to
  give a guest a group of their own.
- **rank** (optional) sets the order within a group, lowest first. Without it, the file's order is used.
- **rsvp** (optional) accepts values like yes or no.
- Guests are added to existing groups with the same name, and anyone already in that group is
  skipped. Importing the same file twice is safe.
- **To start over**, click **Clear list** (root admin, next to Import CSV) and type `delete`, then
  import the new file. It removes every guest and group but keeps the admin passwords. Links you have
  already sent stop working, and re-imported groups get new links, so only do this before sending.
  Run `make export-db` first if you want a copy.
- From Excel, save as **CSV UTF-8** so accents in names survive. The import refuses files that
  aren't UTF-8.
- The card has room for 10 names. The admin warns you about bigger groups.

## Links

- `https://yourdomain.com/<id>` greets that group. Add `?lang=en`, `?lang=vi` or `?lang=zh` to skip
  the language choice.
- `?to=Name&to=Name` links made before the guest list existed still work.
- A link with an unknown id shows the card with no names on it.
- Search engines are asked not to index the site (`robots.txt` and a `noindex` tag).

## Notes

- Admin sign-in uses a secure cookie. With `make up`, use it over https (your domain) or
  http://localhost in Chrome or Firefox; Safari won't keep you signed in over plain http.
  `make dev` relaxes this.
- To try the site on a phone on the same Wi-Fi, set `WEB_BIND=0.0.0.0` in `.env`, run `make dev`,
  and open `http://<this computer's IP>:8080`.
- Guests can't RSVP themselves yet. The card is a save the date, so admins record RSVPs.
