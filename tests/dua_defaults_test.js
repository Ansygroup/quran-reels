/* Defaults must resolve to real adhkar categories and render without changing their text. */
'use strict';
const assert = require('assert');
const fs = require('fs');
const vm = require('vm');
const source = fs.readFileSync('public/js/tools-a.js', 'utf8');
const categories = JSON.parse(fs.readFileSync('public/data/adhkar.json', 'utf8'));
const match = source.match(/const FAV = \[([\s\S]*?)\];/);
assert(match, 'default category list exists');
const fav = vm.runInNewContext(`[${match[1]}]`);
const byName = new Map(categories.map(c => [c.category.trim(), c]));
assert.strictEqual(new Set(fav).size, fav.length, 'no duplicate categories');
for (const name of fav) assert(byName.has(name), `missing default category: ${name}`);
for (const name of ['ما يقول ويفعل من أذنب ذنبا', 'الدعاء حينما يقع ما لا يرضاه أو ُ غلب على أمره', 'الدعاء قبل الطعام', 'الدعاء لمن قال بارك الله فيك']) assert(fav.includes(name), name);
assert(!fav.includes('رب اشرح لي صدرية'));
const tools = {};
let search;
const grid = { children: [], _html: '', set innerHTML(s) { this._html = s; this.children = []; }, get innerHTML() { return this._html; }, appendChild(c) { this.children.push(c); } };
const input = {};
const shell = { querySelector(s) { return s === '[data-grid]' ? grid : input; } };
const context = vm.createContext({
  registerTool(id, def) { tools[id] = def; },
  toolShell() { return shell; },
  el(tag) { return {tag, innerHTML: ''}; },
  esc: s => String(s), toAr: String, normAr: s => s,
  fetch: async () => ({json: async () => categories}),
  attachSearch(_el, _map, paint) { search = paint; }, wireCommon() {},
});
vm.runInContext(source, context, {filename: 'public/js/tools-a.js'});
(async () => {
  const root = {appendChild(c) { assert.strictEqual(c, shell); }};
  await tools.dua.render(root);
  assert.strictEqual(grid.children.length, fav.length);
  fav.forEach((name, i) => {
    const card = grid.children[i].innerHTML;
    assert(card.includes(`<div class="m-title">${name}</div>`));
    for (const item of byName.get(name).array.slice(0, 4)) assert(card.includes(item.text), `${name}: content unchanged`);
  });
  search('الدعاء قبل الطعام');
  assert(grid.children.some(c => c.innerHTML.includes('<div class="m-title">الدعاء قبل الطعام</div>')));
  search('');
  assert.strictEqual(grid.children.length, fav.length, 'clearing search restores defaults');
  assert(fs.readFileSync('public/js/app.js', 'utf8').includes('js/tools-a.js?v=4'));
  assert(fs.readFileSync('public/index.html', 'utf8').includes('js/app.js?v=7'));
  const sw = fs.readFileSync('public/sw.js', 'utf8');
  assert(sw.includes('/js/tools-a.js?v=4') && sw.includes('/js/app.js?v=7'));
  console.log(`Dua defaults PASS: ${fav.length} real categories, unchanged texts, search and cache versions`);
})().catch(e => { console.error(e); process.exitCode = 1; });
