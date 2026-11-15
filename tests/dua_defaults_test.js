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
    const items = byName.get(name).array;
    assert.strictEqual((card.match(/data-copy=/g) || []).length, items.length, `${name}: every item can be copied`);
    for (const item of items) assert(card.includes(item.text), `${name}: content unchanged`);
  });
  // Search by both category and an item after the old four-item cutoff.
  const prayer = byName.get('الأذكار بعد السلام من الصلاة');
  assert(prayer.array.length > 4);
  search(prayer.array[prayer.array.length - 1].text);
  const prayerCard = grid.children.find(c => c.innerHTML.includes(`<div class="m-title">${prayer.category}</div>`));
  assert(prayerCard && prayerCard.innerHTML.includes(prayer.array[prayer.array.length - 1].text));
  for (const category of categories.filter(c => c.array.length > 4)) {
    search(category.category);
    const card = grid.children.find(c => c.innerHTML.includes(`<div class="m-title">${category.category}</div>`));
    assert(card, `search category: ${category.category}`);
    assert.strictEqual((card.innerHTML.match(/data-copy=/g) || []).length, category.array.length);
    for (const item of category.array) assert(card.innerHTML.includes(item.text), `${category.category}: missing item`);
  }
  search('الدعاء قبل الطعام');
  assert(grid.children.some(c => c.innerHTML.includes('<div class="m-title">الدعاء قبل الطعام</div>')));
  search('');
  assert.strictEqual(grid.children.length, fav.length, 'clearing search restores defaults');
  assert(fs.readFileSync('public/js/app.js', 'utf8').includes('js/tools-a.js?v=5'));
  assert(fs.readFileSync('public/index.html', 'utf8').includes('js/app.js?v=9'));
  const sw = fs.readFileSync('public/sw.js', 'utf8');
  assert(sw.includes('/js/tools-a.js?v=5') && sw.includes('/js/app.js?v=9'));
  console.log(`Dua defaults PASS: ${fav.length} real categories, unchanged texts, search and cache versions`);
})().catch(e => { console.error(e); process.exitCode = 1; });
