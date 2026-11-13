/* Quick choices must display text from the very same Quran range they select. */
'use strict';
const assert = require('assert');
const fs = require('fs');
const vm = require('vm');

const nodes = new Map();
function node(tag = 'div', attrs = {}, text = '') {
  return { tag, attrs, text, children: [], events: {}, innerHTML: '', value: '',
    appendChild(child) { this.children.push(child); },
    addEventListener(type, fn) { this.events[type] = fn; },
    focus() { this.focused = true; }, classList: { add() {}, remove() {}, toggle() {} } };
}
function $(id) { if (!nodes.has(id)) nodes.set(id, node()); return nodes.get(id); }
const source = JSON.parse(fs.readFileSync('public/data/quran-uthmani.json', 'utf8')).data;
const notifications = [];
const ctx = vm.createContext({ window: {}, document: { addEventListener() {}, getElementById() { return null; } }, $, $$: () => [],
  el: node, toAr: String, esc: s => s, toast: text => notifications.push(text), source });
for (const p of ['public/js/data.js', 'public/js/quran.js', 'public/js/creator.js'])
  vm.runInContext(fs.readFileSync(p, 'utf8'), ctx, { filename: p });
vm.runInContext(`Quran.data = source; Quran.surahs = source.surahs.map(s => ({ n: s.number, name: s.name, count: s.ayahs.length, ayat: s.ayahs }));`, ctx);
const { groups, creator, quran, ref } = vm.runInContext('({groups: FAMOUS, creator: Creator, quran: Quran, ref: ayahRef})', ctx);
const refs = new Set();
for (const group of groups) {
  assert(group.i.length, group.tag);
  for (const entry of group.i) {
    assert.strictEqual(entry.length, 3, 'references only; no independently typed verse text');
    const [s, a, b] = entry;
    assert(Number.isInteger(s) && Number.isInteger(a) && Number.isInteger(b));
    assert(s >= 1 && s <= 114 && a >= 1 && b >= a && b <= quran.ayahCount(s), entry.join(':'));
    const text = quran.ayah(s, a).trim();
    assert(text);
    const words = text.split(/\s+/);
    const expected = `${ref(s, a, b)} — ${words.slice(0, 8).join(' ')}${words.length > 8 ? '…' : ''}`;
    assert.strictEqual(creator._famousLabel(s, a, b), expected);
    refs.add(entry.join(':'));
  }
}
assert(refs.has('48:4:4')); // السكينة في قلوب المؤمنين
assert(refs.has('16:127:127')); // واصبر وما صبرك إلا بالله
assert(refs.has('24:31:31')); // وتوبوا إلى الله جميعًا
assert(refs.has('20:25:26')); // رب اشرح لي صدري
assert(refs.has('7:31:31')); // المرجع فقط، دون النسبة الخاطئة السابقة
assert(refs.size >= 290);
creator._populateFamous();
const select = $('#selFamous');
const options = select.children.flatMap(g => g.children);
assert.strictEqual(options.length, groups.reduce((n, g) => n + g.i.length, 0));
for (const opt of options) {
  const [s, a, b] = opt.attrs.value.split(':').map(Number);
  assert.strictEqual(opt.text, creator._famousLabel(s, a, b));
}
let selected;
creator.setSelection = (...args) => { selected = args; };
creator._bind();
for (const opt of options) {
  select.events.change({target: {value: opt.attrs.value}});
  assert.strictEqual(selected.slice(0, 3).join(':'), opt.attrs.value);
  assert.strictEqual(selected[3], true);
}
for (const group of groups.filter(g => g.tag !== 'other')) {
  creator._quickPick(group.tag);
  assert(group.i.some(x => x.join(':') === selected.slice(0, 3).join(':')));
  assert($('#msgVerse').innerHTML.includes(quran.ayah(selected[0], selected[1])));
}
for (let i = 0; i < 50; i++) {
  $('#msgVerse').innerHTML = 'stale preview';
  creator._quickPick('me');
  const [s, a, b] = selected;
  assert(groups.filter(g => g.tag !== 'other').some(g => g.i.some(x => x.join(':') === selected.slice(0, 3).join(':'))));
  assert.strictEqual($('#msgVerse').innerHTML, `<div class="inline-ayah">${quran.ayah(s, a)}</div>\n      <div class="hint center">${ref(s, a, b)}</div>`);
  assert(notifications.at(-1).includes(creator._famousLabel(s, a, b)));
}
creator._quickPick('all');
assert(select.focused);
console.log(`Quick verse choices PASS: ${options.length} references, generated labels, menu and category selections`);
