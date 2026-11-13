'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const nodes = new Map();
function $(name) {
  if (!nodes.has(name)) nodes.set(name, { hidden: false, style: {}, width: 100, height: 200, textContent: '' });
  return nodes.get(name);
}
let calls = 0, silentCalls = 0, resizeCalls = 0, dialogResolve;
const player = { playing: false, silent: false, stop() {}, totalDuration: () => 2,
  prepareSilent() { silentCalls++; },
  prepare(_reciter, _verses, _progress, signal) {
    return new Promise((resolve, reject) => signal.addEventListener('abort', () => reject(new Error('aborted')), { once: true }));
  } };
const selection = { ratio: '9:16', quality: 720, reciter: 'test', count: () => 1, list: () => [{s: 48, a: 4}] };
const env = vm.createContext({ $, $$: () => [], document: { getElementById: () => null }, window: {},
  AyahPlayer: player, Selection: selection, Quran: { load: async () => {} }, AbortController,
  ReelRecorder: { record: async () => { calls++; return { blob: {}, mime: 'video/webm' }; } },
  confirmDialog: () => new Promise(resolve => { dialogResolve = resolve; }),
  toast: () => {}, toAr: String, console: { error() {} } });
vm.runInContext(fs.readFileSync('public/js/creator.js', 'utf8'), env);
const creator = vm.runInContext('Creator', env);
creator.renderer = { _lineCache: {}, state: {} }; creator._dirty = () => {}; creator._setPlayIcon = () => {};
creator._resizeCanvas = () => { resizeCalls++; }; creator._onExportDone = () => { throw Error('Unexpected result'); };
(async () => {
  let exporting = creator.startExport(); await new Promise(resolve => setImmediate(resolve));
  assert(creator.exporting); assert(!$('#exportOverlay').hidden); creator.cancelExport(); await exporting;
  assert(!creator.exporting); assert($('#exportOverlay').hidden); assert.equal(creator.lastAbortReason, 'aborted');
  assert.equal(calls, 0); assert.equal(silentCalls, 0); assert.equal(resizeCalls, 1); assert.equal(creator.prepared, false);
  // Cancellation after preparation while confirmation is open must not start the recorder.
  player.prepare = async () => ({ ok: 1, failed: 0 }); player.totalDuration = () => 301;
  exporting = creator.startExport(); await new Promise(resolve => setImmediate(resolve));
  assert.equal(typeof dialogResolve, 'function'); creator.cancelExport(); dialogResolve(true); await exporting;
  assert(!creator.exporting); assert.equal(creator.lastAbortReason, 'aborted'); assert.equal(calls, 0); assert.equal(silentCalls, 0);
  console.log('Creator export abort PASS: pending preparation, cleanup and no recording after confirmation');
})().catch(error => { console.error(error); process.exitCode = 1; });
