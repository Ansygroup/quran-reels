/* Preview and export must not mistake missing recitation for a completed preparation. */
'use strict';
const assert = require('assert');
const fs = require('fs');
const vm = require('vm');
const nodes = new Map();
function $(selector) {
  if (!nodes.has(selector)) nodes.set(selector, { textContent: '', innerHTML: '', disabled: false, style: {} });
  return nodes.get(selector);
}
const alerts = [];
const player = {
  playing: false, paused: false, silent: false, index: 0,
  stop() { this.playing = this.paused = false; },
  pause() { this.paused = true; },
  resume() { this.paused = false; },
  prepareSilent() { this.silent = true; },
  play() { this.playing = true; this.paused = false; },
};
const ctx = vm.createContext({ $, $$: () => [], document: { getElementById: () => null },
  window: {}, AyahPlayer: player, toast: msg => alerts.push(msg),
  toAr: String, Selection: { reciter: 'test', list: () => [{s: 48, a: 4}, {s: 48, a: 5}] }, console });
vm.runInContext(fs.readFileSync('public/js/creator.js', 'utf8'), ctx);
const creator = vm.runInContext('Creator', ctx);
creator._wirePlayerEvents = () => {};
let calls = 0;
player.prepare = async () => { calls++; return { ok: 0, failed: 2 }; };
(async () => {
  await creator._togglePlay();
  assert(player.silent && player.playing);
  assert.strictEqual(creator.prepared, false);
  assert($('#previewNote').textContent.includes('بدون صوت'));
  await creator._togglePlay();
  assert(player.paused);
  player.prepare = async () => { calls++; player.silent = false; return { ok: 2, failed: 0 }; };
  await creator._togglePlay();
  assert.strictEqual(calls, 2, 'retry on resume after failed preparation');
  assert(creator.prepared && !player.silent);
  assert(!$('#previewNote').textContent.includes('بدون صوت'));
  player.stop(); creator.prepared = false;
  player.prepare = async () => ({ ok: 1, failed: 1 });
  await creator._togglePlay();
  assert.strictEqual(creator.prepared, false);
  assert($('#previewNote').textContent.includes('تخطّيها'));
  player.stop();
  await creator._prepareForExport();
  assert.strictEqual(creator.prepared, false);
  assert($('#expSub').textContent.includes('لا يحتوي على كل التلاوة'));
  player.prepare = async () => { throw new Error('network'); };
  await creator._prepareForExport();
  assert.strictEqual(creator.prepared, false);
  assert($('#expSub').textContent.includes('بدون صوت'));
  ctx.URL = { createObjectURL: () => 'blob:test' };
  creator.renderer = { state: {} };
  creator._dirty = () => {};
  await creator._onExportDone({ blob: { size: 100 }, mime: 'video/webm' });
  assert($('#resultMeta').textContent.includes('بدون صوت'), 'warning remains visible in result');
  player.prepare = async () => ({ ok: 2, failed: 0 });
  await creator._prepareForExport();
  assert(creator.prepared);
  assert.strictEqual(creator._audioIssue, '');
  assert(alerts.length >= 3);
  console.log('Creator audio retry PASS: silent, partial, retry, export warnings and recovery');
})().catch(e => { console.error(e); process.exitCode = 1; });
