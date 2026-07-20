import { CanvasVideoOutput } from './platform/video/CanvasVideoOutput.js';
import { SoftwareRenderer } from './render/SoftwareRenderer.js';
import { GameLoop } from './app/GameLoop.js';
import { Game } from './app/Game.js';
import { GrpFile } from './grp/GrpFile.js';
import { GroupFileSystem } from './grp/GroupFileSystem.js';
import { ArtTiles } from './grp/ArtTiles.js';
import { BuildPalette } from './grp/BuildPalette.js';
import { loadboardFromFs } from './engine/BoardLoader.js';
import { Keyboard } from './platform/input/Keyboard.js';
import { buildTables } from './math/BuildTables.js';

const BUILD_TAG = '2026-07-21-playloop';
const GRP_PATHS = ['./assets/DUKE3D.GRP', './DUKE3D.GRP'];
const MAP_NAME = 'E1L1.MAP';

const LOOSE_ART_PATHS = [
  './TILES009.ART',
  './TILES020.ART',
  './TILES021.ART',
  './TILES022.ART',
];

const canvas = document.getElementById('screen');
if (!(canvas instanceof HTMLCanvasElement)) {
  throw new Error('Missing #screen canvas');
}

const output = new CanvasVideoOutput(canvas);
const renderer = new SoftwareRenderer();
renderer.setview(0, 0, renderer.screenWidth - 1, renderer.screenHeight - 1);
renderer.setKeyboard(new Keyboard());

const debugEl = document.createElement('pre');
debugEl.id = 'debug';
debugEl.style.cssText =
  'position:fixed;left:8px;top:8px;margin:0;padding:6px 8px;background:rgba(0,0,0,.65);' +
  'color:#9f9;font:12px/1.35 monospace;z-index:10;pointer-events:none;white-space:pre';
document.body.appendChild(debugEl);

/** @type {Game|null} */
let game = null;
/** @type {GameLoop|null} */
let gameLoop = null;

/**
 * @param {string[]} paths
 * @returns {Promise<ArrayBuffer>}
 */
async function fetchFirst(paths) {
  let lastError = null;
  for (const path of paths) {
    try {
      const response = await fetch(path);
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      return await response.arrayBuffer();
    } catch (error) {
      lastError = error;
    }
  }
  throw lastError ?? new Error('fetchFirst: no paths');
}

/**
 * @param {GroupFileSystem} fs
 */
async function loadLooseArtFiles(fs) {
  for (const path of LOOSE_ART_PATHS) {
    try {
      const response = await fetch(path);
      if (!response.ok) continue;
      const name = path.split('/').pop();
      if (!name) continue;
      fs.addLooseFile(name, new Uint8Array(await response.arrayBuffer()));
    } catch {
      // optional
    }
  }
}

async function start() {
  console.info(`[DukeNukem3DJs] ${BUILD_TAG} — loading GRP + ${MAP_NAME}…`);

  const grpBuffer = await fetchFirst(GRP_PATHS);
  const grp = GrpFile.fromBuffer(grpBuffer);
  const fs = new GroupFileSystem(grp);
  await loadLooseArtFiles(fs);

  const palette = BuildPalette.load(fs);
  output.setPalette(palette.rgb888);

  buildTables.load(fs);
  console.info(`[DukeNukem3DJs] tables: ${buildTables.source}`);

  const art = new ArtTiles(fs);
  art.loadpics('tiles000.art');

  const board = loadboardFromFs(fs, MAP_NAME);

  renderer.setBuildPalette(palette);
  renderer.setWorld(art, board);

  const status = renderer.drawRooms?.getDebugStatus?.() ?? '';
  debugEl.textContent = status;
  // Full scan/bunch stats only exist after drawrooms — logged once post-first-frame.

  let loggedFirstFrame = false;
  game = new Game({ renderer, output });
  game.bindPlayerFromWorld();
  gameLoop = new GameLoop({
    onTick: () => {
      game.tick();
    },
    onFrame: () => {
      game.frame();
      if (renderer.drawRooms) {
        const s = renderer.drawRooms.getDebugStatus();
        debugEl.textContent = s;
        if (!loggedFirstFrame) {
          loggedFirstFrame = true;
          console.info(`[DukeNukem3DJs] frame1 ${s.replace(/\n/g, ' | ')}`);
        }
      }
    },
  });
  gameLoop.start();
}

window.addEventListener('resize', () => {
  output.resize(window.innerWidth, window.innerHeight);
});

start().catch((error) => {
  console.error('[DukeNukem3DJs] startup failed', error);
  document.body.insertAdjacentHTML(
    'beforeend',
    `<pre style="color:#f66;padding:1rem;font:14px monospace;position:fixed;inset:0;background:#000;overflow:auto">` +
      `DukeNukem3DJs failed:\n${error && error.stack ? error.stack : error}</pre>`,
  );
});
