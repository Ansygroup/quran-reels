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
    focus() { this.focused = true; }, click() { this.clicked = true; if (this.events.click) this.events.click(); },
    classList: { add() {}, remove() {}, toggle() {} } };
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
// Exercise the real selection and synchronization paths with a minimal player/renderer.
ctx.AyahPlayer = { stop() {}, prepareSilent() {}, totalDuration: () => 0 };
creator.renderer = { setConfig() {} };
creator._updateTransForRenderer = creator._updateDots = creator._setPlayIcon = creator._dirty = () => {};
vm.runInContext('Selection.save = () => {}', ctx);
const originalSetSelection = creator.setSelection;
let selected;
creator.setSelection = function (...args) { selected = args; return originalSetSelection.apply(this, args); };
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
// Loading/restoring and manual adjustments must not leave an old quick-message preview.
vm.runInContext('Selection.surah = 2; Selection.from = 5; Selection.to = 10', ctx);
creator._syncVerses();
assert.strictEqual($('#msgVerse').innerHTML, `<div class="inline-ayah">${quran.ayah(2, 5)}</div>\n      <div class="hint center">${ref(2, 5, 10)}</div>`);
$('#selSurah').events.change({target: {value: '48'}});
assert($('#msgVerse').innerHTML.includes(quran.ayah(48, 1)));
assert($('#msgVerse').innerHTML.includes(ref(48, 1, 29)));
$('#txtFrom').value = '4'; $('#txtTo').value = '5';
$('#txtFrom').events.change();
assert($('#msgVerse').innerHTML.includes(quran.ayah(48, 4)));
assert($('#msgVerse').innerHTML.includes(ref(48, 4, 5)));
const textTab = $('.step-tab[data-pane="text"]');
textTab.addEventListener('click', () => { select.parentVisible = true; });
select.focus = function () { assert(this.parentVisible, 'text tab must be opened before focusing its select'); this.focused = true; };
const previous = selected;
creator._quickPick('all');
assert(textTab.clicked);
assert(select.focused);
assert.strictEqual(selected, previous, 'opening the list must not change the selected range');
console.log(`Quick verse choices PASS: ${options.length} references, generated labels, menu and category selections`);
