'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const { execFileSync } = require('node:child_process');
const actual = execFileSync(process.execPath, ['scripts/inventory_recitation_sources.js'], { encoding: 'utf8' });
assert.equal(actual, fs.readFileSync('docs/recitation-source-inventory.json', 'utf8'), 'regenerate inventory after reciter changes');
const rows = JSON.parse(actual).reciters;
const auto = require('../lib/reel_catalog.json').reciters;
assert(rows.length > 0);
// Chapter-mode reciters (e.g. the licensed Aaqib Azeez set) are served from our
// own storage, not everyayah folders, and are manual-only until the automation
// pipeline supports chapter audio; they are excluded from the folder parity check.
const folders = rows.filter(r => !r.chapter);
assert.equal(new Set(folders.map(r => r.folder)).size, folders.length, 'recording folders must be distinct');
assert.deepEqual([...folders.map(r => r.folder)].sort(), [...auto.map(r => r.id)].sort(), 'manual and automation folders differ; update inventory and investigate');
for (const r of rows.filter(r => r.chapter)) assert(!auto.some(a => a.id === r.folder), 'chapter reciter must not enter automation yet: ' + r.id);
assert.equal(rows.find(r => r.id === 'SaadAlGhamadi').folder, 'Ghamadi_40kbps');
console.log('ALL OK: read-only source inventory matches configured manual and automation folders; no rights validated');
