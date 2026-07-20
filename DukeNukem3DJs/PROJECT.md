# DukeNukem3DJs — Project Guide

Canonical instructions for building and maintaining this port. **Read this file before making structural changes.** Update it when architecture, conventions, or port status change.

**Reference sources (read-only — never edit):**

| Tree | Role |
|------|------|
| `../duke_nukem_3d-master/source/` | **Primary** — Duke Nukem 3D game (`GAME.C`, `PLAYER.C`, `ACTORS.C`, …) |
| `../duke_nukem_3d-master/BuildEngine/src/` | **Primary** — Ken Silverman Build engine (`ENGINE.C`, `CACHE1D.C`, `BUILD.H`) |
| `../duke_nukem_3d-master/testdata/` | Sample CON scripts |

### Source of truth (mandatory)

| Question | Answer |
|----------|--------|
| Game behaviour, data formats, APIs, timing, render math | **Duke + Build C only** (`source/`, `BuildEngine/src/`) |
| Step order, SOLID layers, `PROJECT.md` style, thin `index.html` | DoomJS port was a **process template only** |

**Do not** port Doom algorithms (BSP, `R_DrawColumn`, WAD lumps, 35 Hz Doom tics, etc.) into this codebase. When DoomJS and Duke/Build disagree, **Duke/Build wins**. The temporary `DemoRoomRenderer` (ray-box) is scaffolding to exercise `vline` / `setview` — it is **not** the architecture for 3D; replace it with Build `drawrooms` / `drawmasks` from `ENGINE.C`.

---

## Quick start for agents (context recovery)

If you are picking up this project with no chat history:

1. Read **§12 Port status** — what works vs what vanilla still has.
2. Read **§13 Priority roadmap** — suggested order of work.
3. Use **§14 Key file map** to jump to the right module.
4. Respect **§2–3** (SOLID + layers) before editing.
5. After completing work, update **§12**, **§7**, and **§15 Changelog**.

**Current maturity (2026-07-20):** GRP + ART + palette loading wired; software vline path draws a **demo room using real ART tiles** and `palette.dat` / palookup. Still **no** Build `drawrooms` / board load / gameplay.

### Remaining tasks (priority order)

| Priority | Task | Status |
|----------|------|--------|
| **P0** | Canvas shell + `GameLoop` + `CanvasVideoOutput` | Done |
| **P0** | Software renderer primitives | Done |
| **P1** | `GrpFile` / `GroupFileSystem` | Done |
| **P1** | ART `loadpics` / `loadtile` + `palette.dat` | Done |
| **P1** | Board (`.map`) load — sectors / walls / sprites | Not started |
| **P2** | Build `drawrooms` / `drawmasks` | Not started |
| **P2** | Player movement + `clipmove` | Not started |
| **P3** | Duke game loop / actors / CON | Not started |

---

## 1. Mission

Port Duke Nukem 3D (Build engine + game) to JavaScript so it runs in a browser via `index.html`.

| Goal | Detail |
|------|--------|
| Fidelity | Preserve original game logic and data flow; behaviour should match the C source where practical |
| Structure | Sound OOP / SOLID — not a line-by-line transliteration of C globals |
| Runtime | Plain ES modules; no build step for local dev (static serve + `index.html`) |
| Display | Full-viewport canvas; internal **320×200** (classic VGA) scaled to viewport |
| Reference | `duke_nukem_3d-master/` is **read-only** — never edit it |

Duke is two layers in C:

1. **Build engine** — map format, tiles, `drawrooms` / `drawmasks`, `clipmove`, `getzrange`
2. **Duke game** — player, actors, sector effects, CON scripts, menus, sounds

Port both; keep engine APIs behind clear classes so game code does not touch the canvas.

---

## 2. SOLID Rules (Mandatory)

### Single Responsibility (SRP)
One class/module = one reason to change. Example: `GrpFile` reads archives; `ArtTiles` owns tile pixels; `BuildRenderer` draws — not one god object.

### Open/Closed (OCP)
Extend via new implementations. Example: sound drivers implement a shared interface without changing `GameLoop`.

### Liskov Substitution (LSP)
Subtypes honour interface contracts. Example: any video output must support the same present contract.

### Interface Segregation (ISP)
Small interfaces. Example: keyboard polling is separate from ticcmd / input FIFO building.

### Dependency Inversion (DIP)
Game / engine code depends on abstractions, not browser APIs. `Game` receives sound/input/video via wiring in `main.js`.

---

## 3. Layer model (dependencies flow downward only)

```
index.html / main.js          ← bootstrap, wiring
        ↓
app/                          ← Game, GameLoop, play session, scenes
        ↓
game/ render/ audio/ ui/ grp/ ← Duke subsystems + Build renderer
        ↓
engine/ math/ core/           ← Build world types, fixed math, constants
        ↓
platform/                     ← canvas, input, sound drivers
        ↓
Browser APIs
```

**Rule:** `src/game/`, `src/engine/`, and `src/render/` must not import `document`/`window` directly.

### C source → DukeNukem3DJs mapping

| C area / files | DukeNukem3DJs |
|----------------|---------------|
| Build `ENGINE.C`, `CACHE1D.C`, `BUILD.H` | `src/engine/`, `src/render/` |
| `i_*`-style DOS / platform (timer, video, kbd) | `src/platform/` |
| GRP / `kopen4load` / cache | `src/grp/` |
| ART `tiles###.art`, palette | `src/grp/`, `src/render/` |
| `.map` board load (`loadboard`) | `src/engine/BoardLoader.js` |
| `GAME.C`, `GLOBAL.C`, `PREMAP.C` | `src/app/`, `src/game/` |
| `PLAYER.C`, `ACTORS.C`, `SECTOR.C` | `src/game/` |
| `MENUES.C` | `src/ui/` |
| `SOUNDS.C`, AudioLib | `src/audio/` |
| `GAMEDEF.C` / CON | `src/game/con/` (later) |
| `DUKE3D.H`, `NAMES.H`, `TYPES.H` | `src/core/` |

When porting a C function, identify which **class owns the data** it mutates.

---

## 4. Directory layout (target)

```
DukeNukem3DJs/
├── index.html
├── PROJECT.md
├── src/
│   ├── main.js                 # Composition root
│   ├── app/
│   │   ├── Game.js             # Mode / state machine (MODE_MENU, MODE_GAME, …)
│   │   └── GameLoop.js         # Fixed-rate tic accumulator
│   ├── core/                   # Constants (TICRATE, limits from BUILD.H / DUKE3D.H)
│   ├── math/                   # Fixed-point, trig tables (Build angles)
│   ├── grp/                    # GrpFile, GroupFileSystem, ArtTiles, BuildPalette
│   ├── engine/                 # Board, sectors/walls/sprites, clipmove (later)
│   ├── game/                   # Player, actors, sector logic (later)
│   ├── render/                 # Software Build renderer
│   │   ├── SoftwareRenderer.js # Facade
│   │   ├── ViewBuffer.js       # frameplace / ylookup / setview
│   │   ├── VlineDrawer.js      # vlineasm1
│   │   ├── HlineDrawer.js      # solid spans
│   │   ├── Palookup.js         # shade tables
│   │   └── DemoRoomRenderer.js # TEMP scaffolding only — not Build drawrooms
│   ├── audio/                  # SFX / music (later)
│   ├── ui/                     # Menus (later)
│   └── platform/               # CanvasVideoOutput, keyboard, mouse
└── assets/                     # Optional GRP (often gitignored; user-supplied)
```

Phase 0 only creates the shell folders and platform/app/core stubs.

---

## 5. Coding conventions

- ES modules; `camelCase` methods, `PascalCase` classes, `UPPER_SNAKE` for C-macro-style constants
- JSDoc on public APIs
- **Keep:** Build fixed-point coords, 2048-angle circle, GRP/ART/map layouts, deterministic play where vanilla is
- **Modernize:** manual memory → GC; function pointers → method dispatch; `char*` buffers → `Uint8Array`
- Native render buffer: **320×200** indexed (classic); scale via `CanvasVideoOutput`
- Fail fast on missing GRP/ART/map during development

### Timing (from `DUKE3D.H`)

| Constant | Value | Notes |
|----------|-------|-------|
| `TICRATE` | 120 | Build / control timer rate |
| `TICSPERFRAME` | `TICRATE/26` (~4) | Clocks advanced per displayed frame in vanilla |
| Effective sim | ~26 Hz | Prefer a **26 Hz** game-tick loop for Phase 0+ unless matching FIFO sync later |

---

## 6. Porting workflow

1. Locate the function in **Duke** `source/` or **Build** `BuildEngine/src/` (not in DoomJS)
2. Identify data ownership (globals → instance fields)
3. Design JS class/interface that preserves Build/Duke call shapes where practical (`setview`, `drawrooms`, `clipmove`, …)
4. Port one vertical slice
5. Verify against vanilla behaviour on a known map (e.g. `E1L1.MAP` from a legal GRP)
6. Update **§7** checklist and **§12** port status in this file

Do **not** bulk-translate entire `.c` files. One subsystem per change.  
Do **not** copy DoomJS modules and “adapt” them — re-derive from the Duke/Build source.

---

## 7. Implementation phases

Legend: `[x]` done · `[~]` partial · `[ ]` not started

### Phase 0 — Shell
- [x] Full-viewport canvas, ES module bootstrap
- [x] `GameLoop` with fixed tic accumulator (~26 Hz)
- [x] `CanvasVideoOutput` — 320×200 indexed buffer + scale-to-fit
- [x] Demo clear / test pattern (replaced by demo room)

### Phase 1 — Data
- [x] `GrpFile` — GRP directory and entry I/O (`CACHE1D.C`)
- [x] `GroupFileSystem` — disk-first then GRP (`kopen4load` order)
- [x] ART loader `loadpics` / `loadtile` (`ENGINE.C`)
- [x] `palette.dat` → RGB + palookup (`loadpalette`)
- [ ] User GRP file picker when fetch fails
- [ ] CON stubs optional later

### Phase 2 — Map / engine world
- [ ] `BoardLoader` — `loadboard` sector/wall/sprite arrays
- [ ] Sector / wall / sprite types matching `BUILD.H`
- [ ] `updatesector`, basic spatial queries

### Phase 3 — Render (Build software)
- [x] `ViewBuffer` — frameplace, ylookup, setview, clearview
- [x] `VlineDrawer` — textured vertical columns (vlineasm1)
- [x] `HlineDrawer` — solid spans / ceiling-floor fill
- [x] `Palookup` — from `palette.dat` (32 shades)
- [x] Demo box room using **real ART** columns (scaffold only)
- [x] Framebuffer wired to real game palette from ART/GRP
- [ ] `drawrooms` wall/floor/ceiling columns
- [ ] `drawmasks` sprites / masked walls
- [ ] Sky / parallax floors (later)

### Phase 4 — Play simulation
- [ ] Player spawn from board
- [ ] `clipmove` / `getzrange` / movement
- [ ] Weapons, inventory, damage (Duke game)
- [ ] Actors (`ACTORS.C`), sector effects (`SECTOR.C`)
- [ ] CON interpreter (`GAMEDEF.C`) as needed

### Phase 5 — UI / meta
- [ ] Menus (`MENUES.C`)
- [ ] HUD / status
- [ ] Level load flow (`PREMAP.C`)

### Phase 6 — Audio
- [ ] SFX + music via Web Audio (AudioLib behaviour later)

### Phase 7 — Persistence & progression
- [ ] Save/load (JSON subset first)
- [ ] Episode / level progression

---

## 12. Port status vs vanilla Duke / Build

Last audited: **2026-07-20**. Re-audit after major features.

### 12.1 Subsystem maturity

```
Shell / canvas      ██████████  100%
Pixel path          ████████░░   ~80%   vline/hline/setview
GRP / ART / palette █████████░   ~90%   loadpics+loadtile+palette.dat
Board load          ░░░░░░░░░░    0%
Build drawrooms     ██░░░░░░░░   ~20%   primitives + ART demo only
Player / clipmove   ░░░░░░░░░░    0%
Actors / CON        ░░░░░░░░░░    0%
Audio               ░░░░░░░░░░    0%
UI / menus          ░░░░░░░░░░    0%
```

### 12.2 Done well

| Area | Key files | Notes |
|------|-----------|-------|
| Bootstrap | `index.html`, `main.js` | Loads `assets/DUKE3D.GRP` |
| GRP | `grp/GrpFile.js`, `GroupFileSystem.js` | KenSilverman archive + disk-first |
| ART | `grp/ArtTiles.js` | `loadpics` / `loadtile`, column-major |
| Palette | `grp/BuildPalette.js` | VGA→RGB888, palookup×32 |
| View buffer | `ViewBuffer.js` | ylookup, setview, clearview |
| Columns | `VlineDrawer.js` | Textured vline + real palookup |
| Demo | `DemoRoomRenderer.js` | Scaffold with real ART (not drawrooms) |

### 12.3 Missing / next

Real `drawrooms` / `drawmasks` from `ENGINE.C`, GRP/ART, board load, Duke play loop, AudioLib, menus.

---

## 13. Priority roadmap

Goal: **visible Build map render** before deep Duke gameplay.

| Priority | Task | Why | Primary files / C ref |
|----------|------|-----|------------------------|
| P0 | Canvas + vline primitives | Done | `ViewBuffer`, `VlineDrawer` |
| P1 | GRP + ART + palette | Done | `grp/` · `CACHE1D.C`, `ENGINE.C` loadpics/loadpalette |
| P1 | `loadboard` | World for drawrooms | `engine/BoardLoader.js` · `ENGINE.C` |
| P2 | `drawrooms` walls/floors | Real Build view | `render/` · `ENGINE.C` |
| P2 | Sprites / masks | `drawmasks` | `ENGINE.C` |
| P2 | `clipmove` + player | Walk maps | `ENGINE.C`, `PLAYER.C` |
| P3 | Duke weapons / actors | Game feel | `ACTORS.C`, `PLAYER.C` |

---

## 14. Key file map

| If you need to… | Start here |
|-----------------|------------|
| Change tic rate / frame hooks | `app/GameLoop.js` |
| Blit indexed pixels to the page | `platform/video/CanvasVideoOutput.js` |
| Wire startup | `main.js` |
| Screen size constants | `core/renderConstants.js` |
| Timer / tic constants | `core/gameConstants.js` |
| Frameplace / setview / clearview | `render/ViewBuffer.js` |
| Draw a textured wall column | `render/VlineDrawer.js` |
| Demo spinning room | `render/DemoRoomRenderer.js` |
| Renderer facade | `render/SoftwareRenderer.js` |
| Load DUKE3D.GRP | `grp/GrpFile.js`, `main.js` |
| ART tiles / columns | `grp/ArtTiles.js` |
| palette.dat | `grp/BuildPalette.js` |
| Demo spinning room (temp) | `render/DemoRoomRenderer.js` |
| (Next) Real Build 3D frame | `drawrooms` from `ENGINE.C` |
| (Next) Load a `.map` | `engine/BoardLoader.js` · `E1L1.MAP` in GRP |

---

## 8. Agent instructions

When working on DukeNukem3DJs:

1. Read this file — especially **Source of truth**, **§12**, and **§13**
2. Implement from **Duke `source/`** and **Build `BuildEngine/src/`** — not from DoomJS code
3. Respect SOLID and the layer model (process borrowed from DoomJS; behaviour from Duke/Build)
4. Keep `index.html` thin; logic in `src/`
5. Minimize scope — one subsystem per task
6. Prefer Build/Duke names and call shapes (`setview`, `drawrooms`, `drawmasks`, `clipmove`, `loadboard`, …)
7. Do **not** modify `duke_nukem_3d-master/`
8. Do **not** add npm/webpack unless the user requests it
9. Update **§7**, **§12**, and **§15** when completing port milestones

When unsure where code belongs: *Which Build/Duke module owns this data, and which interface should the rest of the engine use?*

When unsure how something should work: open the C file in `BuildEngine/src/` or `source/` first.

---

## 9. Local development

```powershell
cd "DukeNukem3DJs"
python -m http.server 8080
# → http://localhost:8080
```

User supplies a legally obtained GRP (e.g. `DUKE3D.GRP`) when asset loading is implemented. Do not commit commercial game data.

---

## 10. Non-goals (unless requested)

- TypeScript migration
- Bundling commercial GRP/ART into the repo
- EDuke32 / JFDuke feature parity beyond classic 1.5 Atomic behaviour (unless requested)
- Non-faithful gameplay tweaks
- npm/webpack toolchain (plain static ES modules)

---

## 15. Changelog

| Date | Change |
|------|--------|
| 2026-07-20 | Initial project guide; Phase 0 canvas shell (`GameLoop`, `CanvasVideoOutput`, demo pattern) |
| 2026-07-20 | Software renderer: `ViewBuffer`, `VlineDrawer`, `HlineDrawer`, `Palookup`, demo box room |
| 2026-07-20 | Clarified source of truth: Duke/Build C for behaviour; DoomJS process-only |
| 2026-07-20 | GRP/ART/palette load; demo room uses real tiles + palookup |

---

## Appendix A — Reference map (vanilla)

Authoritative Build behaviour lives in `BuildEngine/src/ENGINE.C`. Authoritative Duke game behaviour lives in `source/GAME.C`, `PLAYER.C`, `ACTORS.C`, `SECTOR.C`. Prefer those over third-party ports when resolving fidelity questions.
