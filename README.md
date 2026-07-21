# Duke Nukem Port � Project Guide

> **README sync:** This file is the public mirror of [DukeNukem3DJs/PROJECT.md](./DukeNukem3DJs/PROJECT.md).
> **Agents:** whenever you change PROJECT.md, copy the full contents into DukeNukem3DJs/README.md and this root README.md in the same change � keep them identical aside from this notice block.

Canonical instructions for building and maintaining this port. **Read this file before making structural changes.** Update it when architecture, conventions, or port status change.

### README sync (mandatory)

`PROJECT.md` is the **source of truth**. After any edit to this file, **immediately** copy the full contents into:

1. `README.md` (this folder)
2. `../README.md` (repo root)

Keep both READMEs identical to this file except for a short sync-notice banner at the top of each README. Do this in the **same** change set — never leave PROJECT.md and README out of sync.

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

### Always check with vanilla (mandatory)

Before changing render / clip / sector math:

1. **Open the matching C function first** in `../duke_nukem_3d-master/BuildEngine/src/` or `../duke_nukem_3d-master/source/` (usually `ENGINE.C`).
2. **Diff call order, globals, and edge cases** — not just the “idea” of the algorithm. Half-ports of Build math (wrong globals, missing tables like `reciptable`/`krecipasm`, wrong clip paths) often look plausible and then break the view.
3. **Prefer a smaller, verified subset** over a speculative “more vanilla” rewrite. If the full C path cannot be matched yet, leave the known-good approx and document the gap in **§12**.
4. **Do not invent fixes** (recompute endpoints, flip signs, change near-clip) without citing the C lines you are matching.
5. After a fidelity change, bump `BUILD_TAG` and ask for a hard-refresh smoke test on E1L1 before stacking more changes.

If vanilla and the port disagree, **vanilla wins** — fix the port, do not “improve” on Build.

---

## Quick start for agents (context recovery)

If you are picking up this project with no chat history:

1. Read **§12 Port status** — what works vs what vanilla still has.
2. Read **Always check with vanilla** (under Source of truth) — open C before changing render/clip math.
3. Read **§13 Priority roadmap** — suggested order of work.
4. Use **§14 Key file map** to jump to the right module.
5. Respect **§2–3** (SOLID + layers) before editing.
6. After completing work, update **§12**, **§7**, and **§15 Changelog**, then **sync both READMEs** (see **README sync** above).

**Current maturity (2026-07-21):** Loads `DUKE3D.GRP` + ART + palette; **`loadboard(E1L1.MAP)`** + Build-style **bunch `drawrooms`**. Face/wall/floor **`drawmasks`** + maskwalls. **`clipmove`**. Duke play tic + **pistol** + **doors** (9/20–25/27) + **transporters (SE 7)** + **SEENINE/fan break** + **touch pickups** + **status bar / inventory** + switches. 4:3 presentation.

### Remaining tasks (priority order)

| Priority | Task | Status |
|----------|------|--------|
| **P0** | Canvas shell + software primitives | Done |
| **P1** | GRP / ART / palette | Done |
| **P1** | `loadboard` (E1L1) | Done |
| **P2** | `drawrooms` walls + portals | Partial — bunch/`scansector`/`drawalls` port; wallmost approx |
| **P2** | Textured floors/ceilings (`ceilscan`/`florscan`) | Partial (flat + wall-align + grouscan + distance fog) |
| **P2** | Parallax sky (`parascan`) | Partial — LA psky + radarang2 + parallaxyscale V |
| **P2** | `drawmasks` sprites | Partial — face/wall/floor (ceilsprite) + maskwalls |
| **P2** | Player movement + `clipmove` | Partial — walls + sprite clips + getzrange/pushmove |
| **P3** | Duke play loop | Partial — gravity/jump/crouch + pistol + doors/bridges/switches/pickups/HUD; no actors/CON |

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
│   │   ├── FlatPlane.js        # flat ceilscan/florscan UV (legacy/fallback)
│   │   ├── FlatScan.js         # flat horizlookup floors
│   │   ├── Grouscan.js         # ENGINE.C grouscan slopes
│   │   ├── DrawRooms.js        # portal drawrooms subset
│   │   ├── DrawMasks.js        # drawmasks sprites / maskwalls
│   │   ├── ParallaxSky.js      # parascan sky
│   │   ├── Palookup.js         # shade tables
│   │   └── DemoRoomRenderer.js # TEMP scaffolding only — not Build drawrooms
│   ├── audio/                  # SFX / music (later)
│   ├── ui/                     # Menus (later)
│   └── platform/               # CanvasVideoOutput, Keyboard, …
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
2. **Read the full vanilla path** (callers, globals, tables) before writing JS — see **Always check with vanilla**
3. Identify data ownership (globals → instance fields)
4. Design JS class/interface that preserves Build/Duke call shapes where practical (`setview`, `drawrooms`, `clipmove`, …)
5. Port one vertical slice — line-faithful where math must match; leave documented approx only when blocked
6. Verify against vanilla behaviour on a known map (e.g. `E1L1.MAP` from a legal GRP)
7. Update **§7** checklist and **§12** port status in this file

Do **not** bulk-translate entire `.c` files. One subsystem per change.  
Do **not** copy DoomJS modules and “adapt” them — re-derive from the Duke/Build source.  
Do **not** ship a “vanilla-inspired” rewrite without the C open beside it.

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
- [x] `BoardLoader` — `loadboard` sector/wall/sprite arrays (map v7)
- [x] Sector / wall / sprite types matching `BUILD.H`
- [x] `updatesector` / `inside` (`SectorQuery.js`)
- [x] `clipmove` / `getzrange` (walls + sprites) / `pushmove`

### Phase 3 — Render (Build software)
- [x] `ViewBuffer` / `VlineDrawer` / `HlineDrawer` / `Palookup`
- [x] Real palette + ART columns
- [x] `DrawRooms` portal subset — solid + step walls, umost/dmost (E1L1)
- [x] Flat `ceilscan`/`florscan` UV subset (`FlatPlane.js` / `FlatScan.js`)
- [x] 4:3 CRT-aspect present (`CanvasVideoOutput`)
- [ ] Full bunch/`scansector` parity with `ENGINE.C`
- [x] Sloped floors/ceilings (`Grouscan.js` · ENGINE.C `grouscan` + `getpalookup` fog)
- [ ] Parallax skies (`parascan`) full parity
- [x] `drawmasks` face/wall/floor (`ceilsprite`) + maskwalls

### Phase 4 — Play simulation
- [x] Player spawn from board (APLAYER / map header)
- [x] WASD + turn look
- [x] `clipmove` / `getzrange` / movement
- [~] Weapons, inventory, damage (Duke game) — pistol + touch pickups + inventory strip
- [ ] Actors (`ACTORS.C`), sector effects (`SECTOR.C`)
- [ ] CON interpreter (`GAMEDEF.C`) as needed

### Phase 5 — UI / meta
- [ ] Menus (`MENUES.C`)
- [~] HUD / status — BOTTOMSTATUSBAR + digital nums + inventory icons
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
GRP / ART / palette █████████░   ~90%
Board load          ████████░░   ~85%   E1L1 + updatesector/inside
Build drawrooms     ████████░░   ~80%   bunch scansector/drawalls; wallmost approx
Player / clipmove   ████████░░   ~80%   walls+sprites clipmove/getzrange/pushmove
drawmasks sprites   ███████░░░   ~70%   face/wall/floor ceilsprite + maskwalls
Duke play loop      ███████░░░   ~72%   pistol + doors + pickups + status bar; no actors/CON
```

### 12.2 Done well

| Area | Key files | Notes |
|------|-----------|-------|
| GRP/ART/palette | `grp/*` | From `DUKE3D.GRP` |
| Map load | `engine/BoardLoader.js`, `SectorQuery.js` | Map v7 `E1L1.MAP`, APLAYER spawn, `getzsofslope` |
| drawrooms | `render/DrawRooms.js`, `FlatScan.js`, `Grouscan.js`, `ParallaxSky.js` | Portals, flats, grouscan+fog, LA parascan sky |
| drawmasks | `render/DrawMasks.js` | Face + wall + floor (`ceilsprite`) + maskwalls |
| clipmove | `engine/ClipMove.js` | Wall + sprite clips, raytrace slide, pushmove, getzrange |
| hitscan | `engine/Hitscan.js` | Walls/floors/sprites CLIPMASK1 |
| Play tic | `game/Player.js`, `GetInput.js`, `ProcessInput.js` | Gravity, Space jump, Z/C crouch, friction + clipmove |
| Pistol | `game/Weapons.js`, `render/WeaponHud.js` | Kickback, shoot spark, bulletholes, FIRSTGUN HUD |
| Doors | `game/Operate.js`, `Animate.js`, `Effectors.js`, `engine/NearTag.js` | USE (E), lotag 9/20–23/25/27 + SE 11/15/20 |
| Transporters | `game/Transporters.js` | SE lotag 7 (E1L1 roof → street) |
| Pickups | `game/Pickups.js`, `SpawnSetup.js` | Weapons/ammo/health/inv; floor snap; access-card pal; hide SE markers |
| Status bar | `render/StatusBar.js`, `WeaponHud.js` | BOTTOMSTATUSBAR + ammo/HP/armor + inventory `[`/`]` |
| SEENINE / fan | `game/Seenines.js` | E1L1 roof explosives + FANSPRITE break + SE 13 |
| Switches | `game/Switches.js` | `checkhitswitch` + `operateactivators` subset |
| Look around | `platform/input/Keyboard.js` | WASD + turn + pointer-lock mouse look + LMB fire |

### 12.3 Missing / next

Actors / CON; elevators 15–19; other weapons; water/jetpack; sounds.

---

## 13. Priority roadmap

Goal: **visible Build map render** before deep Duke gameplay.

| Priority | Task | Why | Primary files / C ref |
|----------|------|-----|------------------------|
| P0 | Canvas + vline primitives | Done | `ViewBuffer`, `VlineDrawer` |
| P1 | GRP + ART + palette | Done | `grp/` · `CACHE1D.C`, `ENGINE.C` loadpics/loadpalette |
| P1 | `loadboard` | Done | `engine/BoardLoader.js` · `ENGINE.C` |
| P2 | `drawrooms` walls/floors | Partial | `DrawRooms.js`, `Grouscan.js`, `FlatScan.js` · `ENGINE.C` |
| P2 | `clipmove` + player | Partial — walls + sprites + getzrange/pushmove | `ClipMove.js` · `ENGINE.C` |
| P2 | Sprites / masks | Partial — face/wall/floor ceilsprite | `DrawMasks.js` · `ENGINE.C` `drawmasks` |
| P3 | Duke play loop | Partial — processinput + pistol + doors/bridges/switches/pickups | `game/ProcessInput.js`, `Weapons.js`, `Operate.js`, `Effectors.js`, `Pickups.js` |
| P3 | Duke weapons / actors | Partial — pistol only; no CON actors | `ACTORS.C`, `PLAYER.C` |

---

## 14. Key file map

| If you need to… | Start here |
|-----------------|------------|
| Change tic rate / frame hooks | `app/GameLoop.js` |
| Blit indexed pixels to the page | `platform/video/CanvasVideoOutput.js` |
| Keyboard look / move | `platform/input/Keyboard.js`, `game/GetInput.js` |
| Duke play tic (jump/crouch/gravity) | `game/ProcessInput.js`, `game/Player.js`, `app/Game.js` |
| Pistol / hitscan | `game/Weapons.js`, `engine/Hitscan.js`, `render/WeaponHud.js` |
| Doors / USE / switches | `game/Operate.js`, `Animate.js`, `Effectors.js`, `Switches.js`, `Premap.js`, `engine/NearTag.js`, `WallGeom.js` |
| Touch pickups | `game/Pickups.js`, `SpawnSetup.js` · GAME.CON / GAME.C spawn |
| Status bar / inventory | `render/StatusBar.js` · GAME.C displayrest |
| SEENINE / fan break | `game/Seenines.js` · ACTORS.C / SECTOR.C |
| Wire startup | `main.js` |
| Screen size constants | `core/renderConstants.js` |
| Timer / tic constants | `core/gameConstants.js` |
| Frameplace / setview / clearview | `render/ViewBuffer.js` |
| Draw a textured wall column | `render/VlineDrawer.js` |
| Flat floor/ceiling UV | `render/FlatScan.js`, `FlatPlane.js` |
| Sloped floor/ceiling UV | `render/Grouscan.js` · `ENGINE.C` grouscan |
| Portal drawrooms | `render/DrawRooms.js` |
| Wall clipmove | `engine/ClipMove.js` |
| Face sprites / drawmasks | `render/DrawMasks.js` |
| Renderer facade | `render/SoftwareRenderer.js` |
| Load DUKE3D.GRP | `grp/GrpFile.js`, `main.js` |
| ART tiles / columns | `grp/ArtTiles.js` |
| palette.dat | `grp/BuildPalette.js` |
| Spawn / inside / updatesector | `engine/SectorQuery.js` |
| Load a `.map` | `engine/BoardLoader.js` · `E1L1.MAP` in GRP |
| Demo spinning room (temp) | `render/DemoRoomRenderer.js` |

---

## 8. Agent instructions

When working on DukeNukem3DJs:

1. Read this file — especially **Source of truth**, **Always check with vanilla**, **§12**, and **§13**
2. Implement from **Duke `source/`** and **Build `BuildEngine/src/`** — not from DoomJS code
3. **Before every fidelity / render / clip change:** open the matching C function and match it; do not invent math
4. Respect SOLID and the layer model (process borrowed from DoomJS; behaviour from Duke/Build)
5. Keep `index.html` thin; logic in `src/`
6. Minimize scope — one subsystem per task
7. Prefer Build/Duke names and call shapes (`setview`, `drawrooms`, `drawmasks`, `clipmove`, `loadboard`, …)
8. Do **not** modify `duke_nukem_3d-master/`
9. Do **not** add npm/webpack unless the user requests it
10. Update **§7**, **§12**, and **§15** when completing port milestones
11. **Sync READMEs** whenever this file changes (`README.md` + `../README.md`)

When unsure where code belongs: *Which Build/Duke module owns this data, and which interface should the rest of the engine use?*

When unsure how something should work: open the C file in `BuildEngine/src/` or `source/` first. If you cannot match vanilla yet, leave the prior known-good behaviour and document the gap.

---

## 9. Local development

```powershell
cd "DukeNukem3DJs"
python -m http.server 8080
# → http://localhost:8080
# Controls: WASD move · ←→ or Q turn · mouse look (click canvas) · R/F or PgUp/PgDn look · Home center · E use/open · Space jump · Z/C crouch · Ctrl or LMB fire
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
| 2026-07-20 | `loadboard(E1L1.MAP)` + portal `DrawRooms` (walls/portals/umost-dmost) |
| 2026-07-20 | Wallscan V shift + 4:3 present; APLAYER spawn + debug overlay |
| 2026-07-20 | Flat textured floors/ceilings (`FlatPlane`); WASD/turn look; `updatesector` |
| 2026-07-20 | Floor/ceil UV: world-space intersection (fixes rotate pinch) |
| 2026-07-20 | Raised-crate floor bounds (exterior farthest-wall); face `drawmasks` subset |
| 2026-07-20 | Wall-aligned floors (`stat&64`); `getzsofslope`; parallax LA sky (`parascan` subset) |
| 2026-07-20 | Build portal para/void rules (no sky-tall abyss walls); wall-sprite fences; less shade bias |
| 2026-07-20 | Sky fill no longer blacks outdoors; deferred sprites; slope step V + screen-space portal tests |
| 2026-07-20 | Slope floors: closed-form ray∩plane; gable V uses base floorz (no apex warp); near-plane wall clip |
| 2026-07-20 | Fix slope black “shadow” clip: no floor umost/dmost seal; sky fills full column; skip slope misses |
| 2026-07-20 | Next phase: `clipmove` wall collision + BFS portal flood (more of E1L1 visible) |
| 2026-07-20 | Revert BFS portal flood (infinite re-queue froze on move); keep clipmove + DFS stack |
| 2026-07-20 | Build portal dmost=min(dplc,uwall) for raised floors — stops slope painting black over courtyard |
| 2026-07-20 | Defer portal recurse until all wall strips done (Build drawalls order); hide system sprites (SECTOREFFECTOR/MUSICANDSFX/…) |
| 2026-07-20 | Portal column masks (no bbox gap paint); gotsector sibling pre-claim; drop near-plane vertex pull (Build rejects yb<256) |
| 2026-07-20 | **Next phase:** replace DFS portals with Build bunch `scansector`/`drawalls` front-to-back (`DrawRooms.js` rewrite) |
| 2026-07-20 | Fidelity audit: EYEHEIGHT 40<<8 spawn, walldist 164, setaspect/viewingrange, neighbor updatesector; not CRT scale |
| 2026-07-20 | **Always check with vanilla** rule added to PROJECT.md; revert broken wallmost view-ray half-port |
| 2026-07-20 | Wall sprites: perspective `lwall` U (ENGINE.C 3339) — fixes FOV-edge horizontal squash |
| 2026-07-20 | Fix `krecipasm` to ENGINE.C reciptable/float path (was 2^32/n → wrong wall-sprite U scale) |
| 2026-07-20 | Parallax sky: parascan subset (`radarang2`, psky LA, parallaxyscale, wallscan V) |
| 2026-07-20 | clipmove v2: raytrace slide, wall pushmove, getzrange; `movePlayer` order |
| 2026-07-20 | Maskwalls + floor sprites (affine subset); mvline skip 255; drawmasks interleave |
| 2026-07-20 | True `grouscan` slopes (`Grouscan.js` + JFBuild-style `slopevlin`); replace FlatPlane slope approx |
| 2026-07-20 | Sprite clips in `clipmove`/`getzrange` (face/wall/floor; CLIPMASK0); pass ART for tilesiz/picanm |
| 2026-07-21 | Floor sprites: ENGINE.C `ceilsprite`/`ceilspritehline` (frustum clip + horizlookup UV); replace affine tris |
| 2026-07-21 | Slope distance fog: `getpalookup`/`globvis` in `grouscan` (ENGINE.C slopalookup shade math) |
| 2026-07-21 | Duke play tic subset: `Player` + `getinput`/`processinput` (gravity, Space jump, Ctrl crouch, friction walk + clipmove) |
| 2026-07-21 | Pistol subset: ENGINE.C `hitscan`, shoot spark + bulletholes, FIRSTGUN HUD (`Weapons.js` / `WeaponHud.js`); fire = Ctrl/LMB, crouch = Z/C |
| 2026-07-21 | Gun HUD: `gun_pos` + `weapon_sway` rest bob (PLAYER.C displayweapon) |
| 2026-07-21 | Doors: `neartag` + `operatesectors` lotag 20/21/22 + `doanimations`; USE = E |
| 2026-07-21 | Sliding doors (lotag 9) + switches: wall x/y anim, `checkhitswitch` / `operateactivators` |
| 2026-07-21 | Gun sway: `bobcounter` → `weapon_sway` + horizontal `weapon_xoffset` |
| 2026-07-21 | Swing doors (lotag 23 / SE 11): `rotatepoint`/`dragpoint`, `msx`/`msy`, `moveSwingDoors` |
| 2026-07-21 | Subway slides (25/SE15) + bridges (27/SE20); PREMAP `GPSPEED` → `sector.extra` |
| 2026-07-21 | Transporters (SE 7): E1L1 cinema-roof shaft warp to street |
| 2026-07-21 | Touch pickups (AMMO/weapons) + SP pal≠0 cull; E1L1 roof exit is shaft fall not barrels |
| 2026-07-21 | SEENINE explosives + FANSPRITE break (E1L1 roof); pickup foot-z dist + sprite setup |
| 2026-07-21 | Fix hard-landing look (return_to_center); pointer-lock mouse look + R/F pitch |
| 2026-07-21 | Spawn setup: hide system markers, fix item/maskwall sprites; expand health/inv pickups |
| 2026-07-21 | Status bar + inventory HUD; pickup floor snap; start ammo 48; `[`/`]` inventory cycle |

---

## Appendix A — Reference map (vanilla)

Authoritative Build behaviour lives in `BuildEngine/src/ENGINE.C`. Authoritative Duke game behaviour lives in `source/GAME.C`, `PLAYER.C`, `ACTORS.C`, `SECTOR.C`. Prefer those over third-party ports when resolving fidelity questions.
