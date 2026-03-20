#!/usr/bin/env node
/**
 * W3X/W3M Map Extractor
 * Extracts and translates Warcraft III map files to JSON.
 * Uses stormlib-js (handles encrypted MPQ entries) + wc3maptranslator.
 *
 * Usage: node extract-map.js <map.w3x|.w3m> [output_dir]
 */

const fs = require('fs');
const path = require('path');
const { MpqArchive } = require('stormlib-js');
const {
  CamerasTranslator, DoodadsTranslator, ImportsTranslator,
  InfoTranslator, ObjectsTranslator, RegionsTranslator,
  SoundsTranslator, StringsTranslator, TerrainTranslator, UnitsTranslator,
} = require('wc3maptranslator');

// ── Config ──

const KNOWN_FILES = [
  'war3map.w3e','war3mapUnits.doo','war3map.doo','war3map.w3r','war3map.w3c',
  'war3map.w3u','war3map.w3t','war3map.w3a','war3map.w3b','war3map.w3d',
  'war3map.w3q','war3map.w3h','war3map.w3i','war3map.imp','war3map.w3s',
  'war3map.wts','scripts/war3map.j','war3map.j','war3map.lua',
  'war3map.mmp','war3mapMap.blp','war3mapMap.tga','war3mapPreview.tga',
  'war3map.shd','war3map.wpm','war3mapSkin.w3b',
  'war3mapExtra.txt','war3mapMisc.txt','war3mapSkin.txt',
  'war3map.wtg','war3map.wct',
];

const TRANSLATORS = {
  'war3map.w3e':      { t: TerrainTranslator, name: 'terrain' },
  'war3mapUnits.doo': { t: UnitsTranslator,   name: 'units' },
  'war3map.doo':      { t: DoodadsTranslator,  name: 'doodads' },
  'war3map.w3r':      { t: RegionsTranslator,  name: 'regions' },
  'war3map.w3c':      { t: CamerasTranslator,  name: 'cameras' },
  'war3map.w3u':      { t: ObjectsTranslator, name: 'units-objects',         ot: 'units' },
  'war3map.w3t':      { t: ObjectsTranslator, name: 'items-objects',         ot: 'items' },
  'war3map.w3a':      { t: ObjectsTranslator, name: 'abilities-objects',     ot: 'abilities' },
  'war3map.w3b':      { t: ObjectsTranslator, name: 'destructables-objects', ot: 'destructables' },
  'war3map.w3d':      { t: ObjectsTranslator, name: 'doodads-objects',       ot: 'doodads' },
  'war3map.w3q':      { t: ObjectsTranslator, name: 'upgrades-objects',      ot: 'upgrades' },
  'war3map.w3h':      { t: ObjectsTranslator, name: 'buffs-objects',         ot: 'buffs' },
  'war3map.w3i':      { t: InfoTranslator,    name: 'info' },
  'war3map.imp':      { t: ImportsTranslator, name: 'imports' },
  'war3map.w3s':      { t: SoundsTranslator,  name: 'sounds' },
  'war3map.wts':      { t: StringsTranslator, name: 'strings' },
};

const TEXT_FILES = [
  'scripts/war3map.j', 'war3map.j', 'war3map.lua',
  'war3mapExtra.txt', 'war3mapMisc.txt', 'war3mapSkin.txt',
];

// ── Helpers ──

function findMpqOffset(buf) {
  const magic = Buffer.from('MPQ\x1a');
  const offset = buf.indexOf(magic);
  if (offset === -1) throw new Error('No MPQ signature found. Not a valid .w3x/.w3m file.');
  return offset;
}

/** Fallback info parser for older map format versions */
function parseInfoFallback(buf) {
  let off = 0;
  const r32 = () => { const v = buf.readInt32LE(off); off += 4; return v; };
  const rFloat = () => { const v = buf.readFloatLE(off); off += 4; return v; };
  const rStr = () => { const end = buf.indexOf(0, off); const s = buf.toString('utf8', off, end); off = end + 1; return s; };

  try {
    return {
      fileVersion: r32(),
      saveCount: r32(),
      editorVersion: r32(),
      mapName: rStr(),
      mapAuthor: rStr(),
      mapDescription: rStr(),
      recommendedPlayers: rStr(),
      cameraBoundsComplements: [rFloat(), rFloat(), rFloat(), rFloat()],
      playableWidth: r32(),
      playableHeight: r32(),
    };
  } catch (e) {
    return { error: 'Could not parse info file: ' + e.message };
  }
}

// ── Main ──

function main() {
  const [mapPath, outDirArg] = process.argv.slice(2);

  if (!mapPath) {
    console.error('Usage: node extract-map.js <map.w3x|.w3m> [output_dir]');
    process.exit(1);
  }

  if (!fs.existsSync(mapPath)) {
    console.error(`Error: File not found: ${mapPath}`);
    process.exit(1);
  }

  let base = path.basename(mapPath);
  base = base.replace(/\.w3[xm]$/i, '');
  const outDir = outDirArg || `${base}_extracted`;
  const rawDir = path.join(outDir, 'raw');
  const jsonDir = path.join(outDir, 'json');

  console.log('═══════════════════════════════════════════');
  console.log('  W3X Map Extractor');
  console.log('═══════════════════════════════════════════');
  console.log(`  Map:    ${mapPath}`);
  console.log(`  Output: ${outDir}`);
  console.log('');

  // ── Step 1: Open MPQ ──
  console.log('[1/2] Opening MPQ archive...');
  const fileBuf = fs.readFileSync(mapPath);
  const offset = findMpqOffset(fileBuf);
  if (offset > 0) console.log(`  Map header detected (${offset} bytes), skipping to MPQ data...`);

  const mpqBuf = fileBuf.slice(offset);
  const archive = MpqArchive.openFromBuffer(mpqBuf);

  // Extract all known files
  fs.mkdirSync(rawDir, { recursive: true });
  fs.mkdirSync(jsonDir, { recursive: true });

  const extracted = {};
  for (const name of KNOWN_FILES) {
    try {
      if (archive.hasFile(name)) {
        const data = archive.extractFileByName(name);
        const safeName = name.replace(/\\/g, '/');
        const outPath = path.join(rawDir, safeName);
        fs.mkdirSync(path.dirname(outPath), { recursive: true });
        fs.writeFileSync(outPath, data);
        extracted[safeName] = data;
        console.log(`  ✓ ${safeName} (${data.length.toLocaleString()} bytes)`);
      }
    } catch (e) {
      // silently skip inaccessible files
    }
  }
  console.log(`  ${Object.keys(extracted).length} files extracted\n`);

  // ── Step 2: Translate to JSON ──
  console.log('[2/2] Translating to JSON...');
  let success = 0, failed = 0;

  for (const [filename, cfg] of Object.entries(TRANSLATORS)) {
    if (!extracted[filename] || extracted[filename].length === 0) continue;
    try {
      const data = Buffer.from(extracted[filename]);
      let result;
      if (cfg.ot) {
        result = cfg.t.warToJson(cfg.ot, data);
      } else {
        result = cfg.t.warToJson(data);
      }
      fs.writeFileSync(path.join(jsonDir, `${cfg.name}.json`), JSON.stringify(result, null, 2));
      console.log(`  ✓ ${filename} → ${cfg.name}.json`);
      success++;
    } catch (e) {
      if (filename === 'war3map.w3i') {
        const info = parseInfoFallback(Buffer.from(extracted[filename]));
        fs.writeFileSync(path.join(jsonDir, 'info.json'), JSON.stringify(info, null, 2));
        console.log(`  ✓ ${filename} → info.json (fallback parser)`);
        success++;
      } else if (filename === 'war3map.doo') {
        fs.writeFileSync(path.join(jsonDir, 'doodads.json'), JSON.stringify({
          error: 'Parse error: ' + e.message,
          note: 'Raw binary data available in raw/war3map.doo'
        }, null, 2));
        console.log(`  ✗ ${filename} → doodads.json (parse error - raw data preserved)`);
        success++;
      } else {
        console.log(`  ✗ ${filename}: ${e.message.slice(0, 120)}`);
        failed++;
      }
    }
  }

  // Copy text/script files as-is
  for (const name of TEXT_FILES) {
    if (extracted[name]) {
      const dest = path.join(jsonDir, path.basename(name));
      fs.writeFileSync(dest, extracted[name]);
      console.log(`  ✓ ${name} (copied as text)`);
      success++;
    }
  }

  console.log('');
  console.log('═══════════════════════════════════════════');
  console.log(`  Done! ${success} translated, ${failed} failed`);
  console.log(`  Raw files:  ${rawDir}/`);
  console.log(`  JSON files: ${jsonDir}/`);
  console.log('═══════════════════════════════════════════');
}

main();
