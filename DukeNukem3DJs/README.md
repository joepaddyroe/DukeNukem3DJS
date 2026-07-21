# DukeNukem3DJs

Browser port of **Duke Nukem 3D** (Build engine + game) in plain JavaScript ES modules. Runs from a static `index.html` ? no bundler required.

Internal render is classic **320×200** VGA, scaled to the viewport at 4:3.

> **Docs:** Day-to-day port status, roadmap, and agent rules live in [`PROJECT.md`](./PROJECT.md). Update that file as the port evolves. Only change this README when something user-facing or structural changes drastically.

---

## Requirements

- A modern browser
- A legally obtained `DUKE3D.GRP` (do not commit commercial game data)
- A local static file server (browsers block ES module `fetch` from `file://`)

Place the GRP at either:

- `assets/DUKE3D.GRP`, or
- `DUKE3D.GRP` next to `index.html`

---

## How to run

```powershell
cd "DukeNukem3DJs"
python -m http.server 8080
```

Open [http://localhost:8080](http://localhost:8080). Hard-refresh after code changes (`BUILD_TAG` is logged in the console).

### Controls

| Input | Action |
|-------|--------|
| WASD | Move |
| ? ? or Q | Turn |
| Mouse (click canvas) | Look (pointer lock) |
| R / F or PgUp / PgDn | Look up / down |
| Home | Center view |
| E | Use / open |
| Space | Jump |
| Z / C | Crouch |
| Ctrl or LMB | Fire |
| `[` / `]` | Cycle inventory |

---

## What it is

Two layers, matching the original C split:

1. **Build engine** ? maps, ART tiles, `drawrooms` / `drawmasks`, `clipmove`, sector queries
2. **Duke game** ? player, weapons, doors, pickups, HUD, enemies (subset; no full CON yet)

Vanilla C under `../duke_nukem_3d-master/` is **read-only** reference. Behaviour comes from Duke/Build, not from Doom-style ports.

---

## Project structure

```
DukeNukem3DJs/
??? index.html              # Thin page shell
??? PROJECT.md              # Living port guide (status, roadmap, conventions)
??? README.md               # This file ? overview & usage
??? assets/                 # Optional local GRP (usually gitignored)
??? src/
    ??? main.js             # Bootstrap / wiring
    ??? app/                # Game loop, session
    ??? core/               # Constants (limits, tic rate, names)
    ??? math/               # Fixed-point, Build trig tables
    ??? grp/                # GRP, ART, palette
    ??? engine/             # Board, clipmove, hitscan, sector queries
    ??? game/               # Player, weapons, actors, doors, pickups
    ??? render/             # Software Build renderer
    ??? audio/              # SFX / music (later)
    ??? ui/                 # Menus (later)
    ??? platform/           # Canvas present, keyboard / mouse
```

Dependencies flow downward: `app` ? game/render ? engine/math ? platform ? browser APIs. Game and engine code should not touch `document` / `window` directly.

---

## Non-goals

- TypeScript / npm / webpack (unless you ask for them)
- Shipping commercial GRP/ART in the repo
- EDuke32 feature parity beyond classic Atomic-era behaviour
- Non-faithful gameplay ?improvements?

---

## Contributing / continuing the port

See **[`PROJECT.md`](./PROJECT.md)** for:

- Vanilla-first fidelity rules
- SOLID / layer conventions
- Phase checklist and maturity
- Key file map and changelog
