import { CanvasVideoOutput } from './platform/video/CanvasVideoOutput.js';
import { SoftwareRenderer } from './render/SoftwareRenderer.js';
import { GameLoop } from './app/GameLoop.js';
import { Game } from './app/Game.js';
import { GrpFile } from './grp/GrpFile.js';
import { GroupFileSystem } from './grp/GroupFileSystem.js';
import { ArtTiles } from './grp/ArtTiles.js';
import { BuildPalette } from './grp/BuildPalette.js';

const BUILD_TAG = '2026-07-20-art-renderer';
const GRP_PATHS = ['./assets/DUKE3D.GRP', './DUKE3D.GRP'];

/** Loose ART overrides / World Tour extras next to index.html (kopen4load disk-first). */
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
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }
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
      console.info(`[DukeNukem3DJs] loose ART: ${name}`);
    } catch {
      // optional
    }
  }
}

async function start() {
  console.info(`[DukeNukem3DJs] ${BUILD_TAG} — loading GRP…`);

  const grpBuffer = await fetchFirst(GRP_PATHS);
  const grp = GrpFile.fromBuffer(grpBuffer);
  const fs = new GroupFileSystem(grp);
  await loadLooseArtFiles(fs);

  const palette = BuildPalette.load(fs);
  output.setPalette(palette.rgb888);

  const art = new ArtTiles(fs);
  art.loadpics('tiles000.art');

  renderer.setBuildPalette(palette);
  renderer.setArt(art);

  console.info(
    `[DukeNukem3DJs] GRP ${grp.fileCount} files, ART files=${art.numtilefiles}, ` +
      `palookups=${palette.numpalookups}, wallTile=${renderer.demoRoom.wallTile}`,
  );

  game = new Game({ renderer, output });
  gameLoop = new GameLoop({
    onTick: () => game.tick(),
    onFrame: () => game.frame(),
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
    `<pre style="color:#f66;padding:1rem;font:14px monospace;position:fixed;inset:0;background:#000">` +
      `DukeNukem3DJs failed to load assets:\n${error && error.message ? error.message : error}\n` +
      `Place DUKE3D.GRP in ./assets/</pre>`,
  );
});
