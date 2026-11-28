# Ivan & Ana: save the date and invitation

The card (a save the date and an invitation), plus a small backend for the guest list: who is in which group, who is
named first on the card, who has RSVP'd to the tea ceremony and to the reception, and who has been sent the save
the date and the invitation.

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
| `make dev` | Runs on this machine. Edits in `frontend/public/` and `backend/app/` show up without rebuilding, and open pages reload themselves when a frontend file changes (CSS-only edits apply without a reload). Ctrl-C stops it. |
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
  - set each guest's RSVP to the tea ceremony and to the reception: attending, not attending or no response
  - mark the **save the date** and the **invitation** as sent, for a whole group at once or one guest at a time
  - choose which letters guests see and in what order (the **Letters** view; see below)
  - choose the envelope's look, keep versions of it, and pick the one guests see (the **Letter style** view;
    see below)
  - lay out and reword the card's cover ("Dear …") and the save the date, keep versions of it, and pick the one
    guests see (the **Card layout** view; see below)
  
  The totals at the top and the filter (e.g. "Save the date not sent") show who is left.
- **link** sees each group and who is in it, with a **Copy link** button, and nothing else.

A device stays signed in for `SESSION_HOURS` (72 by default), and tapping 囍 five times again goes
straight in. After 10 wrong passwords from one address within 15 minutes, that address has to wait.
If there have been 100 wrong passwords from all addresses together in that time, each address gets
one wrong try instead of 10, but an address that hasn't been guessing can always sign in.

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
- **rsvp** (optional) accepts values like yes or no, and answers for both the tea ceremony and the reception.
  For different answers, use **tea ceremony rsvp** (or **tea rsvp**) and **reception rsvp** (or
  **reception**). An event's own column wins over **rsvp**, even where it's blank.
- **guest category** (optional, or just **category**) is a wider grouping, like "Bride's family" or
  "Work friends". The Guests view can filter and sort by it, and you can edit it there.
  Re-importing a file with this column fills in the category for guests already on the list.
- **guest location** (optional, or just **location** or **city**) is where a guest is coming from,
  like "Singapore". The Categories view breaks each category down by location, and it can be
  filtered and edited in the Guests view. Re-importing fills it in the same way as the category.
- Guests are added to existing groups with the same name, and anyone already in that group is
  skipped. Importing the same file twice is safe.
- **To start over**, click **Clear list** (root admin, next to Import CSV) and type `delete`, then
  import the new file. It removes every guest and group but keeps the admin passwords. Links you have
  already sent stop working, and re-imported groups get new links, so only do this before sending.
  Run `make export-db` first if you want a copy.
- From Excel, save as **CSV UTF-8** so accents in names survive. The import refuses files that
  aren't UTF-8.
- The card has room for 10 names. The admin warns you about bigger groups.

## Letters

The card has four letters. They all use the same envelope, cover and paper; only the printed side differs.

- The **save the date**.
- The **invitation**.
- The **RSVP card**, where guests reply: each guest on the link picks attending or not for the tea ceremony
  and for the reception, with any dietary requirements, and the admin sees it straight away. A guest can answer
  one event now and the other later. The invitation's "Kindly RSVP by …" button brings
  it forward. Only a group's own link can reply, so other links (`?to=Name`) never show it, and the
  invitation's RSVP line is then just words.
- The **details**: questions and answers (dress code, parking and so on).

In the admin's **Letters** view, each one is **Active** or **Off**, has a **rank**, and one of them
**Opens first**:

- Rank 1 is the earliest letter; give the newest one the highest rank. Picking a rank another letter
  has swaps the two.
- A guest's card opens on the letter marked **Opens first**, which needn't be the newest (for example
  the invitation, with the RSVP card and the details after it). Marking a letter that's off switches it
  on. The other active letters sit in a row beneath the card, earliest on the left, and tapping one
  brings it forward.
- At least one letter stays active, and the one that opens first can't be switched off until another
  opens first. A new database starts with only the save the date active, and letters added to the card
  later start off.
- **Preview** opens the card on that letter, even while it's off (`?letter=invitation` on any link
  does the same). A preview of the RSVP card shows the names on the link but can't send.

All their wording is in `frontend/public/index.html`, in all three languages: `TEXT` (including the
reply line), `EVENTS` (each day's event, time, venue and address, plus an optional map link that the
address opens, and `reply`: which of the guest's two answers, `tea_rsvp` or `reception_rsvp`, the RSVP card
asks for under that event's name) and `FAQS` (the details' questions and answers, which can be added to, removed or
reordered). Before switching the details on, fill in the `[bracketed]` answers. After changing any
wording, run `make fonts`, so any new Chinese or Vietnamese characters get the card's typefaces.

## Letter style

The admin's **Letter style** view sets the envelope's look: a copy of the envelope on the left (click it to
open the flap and see the liner), the choices on the right.

- **Starting points**: ready-made looks, from the original cinnabar lacquer to several in moss green.
- **Colour**: a few shades of moss, then hue, richness and lightness sliders, or any colour by hex or the
  picker. It sets the flap's lacquer; the pocket, liner, shadows and foil all follow it.
- **Pattern**: the original peony vines, plain, blossom in the top right corner (or two corners),
  scattered blossom, a window lattice, clouds or waves. Each can be tone on tone (a lighter shade of the
  lacquer) or gold, at any strength.
- **Along the creases**: a trim along the flap's edge and the bottom flap's: a gold line, a double rule,
  stitching, pearls or a laurel.
- **Seal**: red, gold, or matching the envelope, and its size (60% to 150% of the original).

Trying a look changes nothing for guests. It shows on this screen only (and on the card behind the panel:
**See it on the card** closes the panel, so you can pick a language and watch it arrive) until the page is
reloaded. **Copy a preview link** gives a link to the card in that look, to send to each other; it saves
nothing.

**Versions.** As with the card's layout, each look is a version, kept in the database, and guests see the one
marked **Live**. **Save** keeps the changes in the version shown (on the live version guests then see them
from their next visit, so it asks first); **Discard changes** goes back to it as saved. **Save as new version**
keeps what's on screen as a version of its own; **+ New version** starts one from the original cinnabar
envelope. **Make live** switches guests to the version shown (saving it first, if it has changes); **Rename**
and **Delete** do what they say, though the live version can't be deleted. A database from before versions
starts with its saved look as the live "Version 1".

A link with `?look=…` (as the preview link makes) draws the envelope in that look instead of the saved one.
The printed cards inside keep their cinnabar ink whatever the envelope.

## Card layout

The admin's **Card layout** view sets where each piece of text sits, how big it is and what it says, on both
sides guests see first: **Dear guest** (the cover, which greets them by name) and **Save the date**. Switch
between them at the top of the view, beside the language (English, Tiếng Việt, 中文) the preview is in.

- **Pieces**: on the cover, the 囍, "Dear" and the guests' names; on the save the date, the title, "for the
  wedding of", the names, the date, the place and "Invitation to follow". Click one (on the card or in the list)
  to pick it, then drag it. Dragging near the middle snaps it onto the centre line; hold Alt (Option) to drag
  past it freely. The arrow keys nudge it (Shift for bigger steps), and `+` / `-` resize it. The **Across**,
  **Up / down** and **Font size** sliders do the same; **A−** / **A+** change the font size a pixel at a time
  (shown in pixels as on a computer screen; phones draw the same card smaller). **B** and **I** (or ⌘B / ⌘I,
  Ctrl+B / Ctrl+I) set it in bold or italics. A dot marks pieces that have been changed.
- **Words**: double-click a piece (or press Enter on it) and type, or use **Words** beside it. Enter finishes,
  Shift+Enter starts a new line (up to 4), Escape puts the words back. Words are per language: changing the
  English leaves the Vietnamese and Chinese as they were, except the couple's names, which are the same in
  every language. Delete all the words to leave a piece off the card; **Use the card's own words** brings
  them back. The guests' names on the cover come from each link, so they can be moved but not reworded;
  **Try with** shows the preview with other names (only the preview). Words the card's typefaces don't have
  (the names' script has only the letters in "Ivan Sam & Ana Nguyen", and Chinese only the characters already
  in `index.html`) show in another face, and the view says which.
- **Seeing it clean**: click the card away from the text, press Esc or **Deselect**, and nothing is outlined.
- **Put it back** restores the picked piece (place, size and words); **Original layout** restores the whole
  side.

**Versions.** Each layout is a version, kept in the database. Guests see the one marked **Live**. Changes are
only on this screen (and on the card behind the panel: **See it on the card**) until **Save**. Saving the live
version changes what guests see from their next visit, so it asks first. **Save as new version** keeps what's
on screen as a version of its own; **+ New version** starts one from the original layout. **Make live**
switches guests to the version shown (saving it first, if it has changes); **Rename** and **Delete** do what
they say, though the live version can't be deleted. **Compare versions** shows every version side by side, each
card at its real size (scroll sideways, or **Fit to screen**), in any language, with **Edit** and **Make live**
on each.

The preview is drawn the way the card draws itself, at its real size when the screen has room (it says so
beneath it), so the text sits and sizes exactly as guests see it. Positions are in card units, so a layout
looks the same on every screen size. A database from before versions starts with its saved layout as the live
"Version 1".

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
- Guests reply on the RSVP card; admins can also set or change anyone's RSVPs and dietary requirements.
- Each guest has two RSVPs, one for the tea ceremony and one for the reception. A database from before
  then is upgraded on start: a guest's one earlier answer becomes their answer to both, since it was a
  reply to an invitation listing both events.
