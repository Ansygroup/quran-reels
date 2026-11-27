/* Licensed full-chapter reciter (Aaqib Azeez): catalog, player mode, UI lock. */
const assert = require('node:assert/strict');
const fs = require('node:fs');
const data = fs.readFileSync('public/js/data.js', 'utf8');
const reel = fs.readFileSync('public/js/reel.js', 'utf8');
const creator = fs.readFileSync('public/js/creator.js', 'utf8');
const log = fs.readFileSync('docs/audio-license-log.tsv', 'utf8');

// catalog: chapter reciter registered with base URL and per-chapter licenses
assert.match(data, /const CHAPTER_RECITERS = \{[\s\S]*?"aaqib-azeez-murattal"/);
assert.match(data, /const AAQIB_BASE_CC0 = "https:\/\/archive\.org\/download\/quran-murattal-aaqib-azeez-cc0\/"/);
assert.match(data, /const AAQIB_BASE_BYSA = "https:\/\/archive\.org\/download\/quran-murattal-aaqib-azeez-by-sa\/"/);
const licBlock = data.match(/const AAQIB_CHAPTER_LICENSE = \{([\s\S]*?)\};/)[1];
const entries = [...licBlock.matchAll(/"(\d+)": "(CC0|CC BY-SA 4\.0)"/g)];
assert.equal(entries.length, 113, 'one license entry per available chapter');
assert(!entries.some(e => e[1] === '28'), 'chapter 28 has no murattal recording yet');
assert(entries.filter(e => e[2] === 'CC0').length > entries.filter(e => e[2] !== 'CC0').length);
assert.match(data, /RECITERS\.push\(\{ id: "aaqib-azeez-murattal"/);

// player: chapter mode fetches one file per surah and never silence-cuts audio
assert.match(reel, /CHAPTER_RECITERS\[reciter\]/);
assert.match(reel, /padStart\(3, "0"\)/);
assert.match(reel, /_playChapter\(/);
assert.match(reel, /urlFor \? ch\.info\.urlFor\(num\)/);

// urlFor routes each chapter to the item carrying its license tier
const vm = require('node:vm');
const { CHAPTER_RECITERS } = vm.runInNewContext(data + ';({CHAPTER_RECITERS})');
const reciter = CHAPTER_RECITERS['aaqib-azeez-murattal'];
assert.equal(reciter.urlFor('001'), 'https://archive.org/download/quran-murattal-aaqib-azeez-cc0/001.mp3');
assert.equal(reciter.urlFor('052'), 'https://archive.org/download/quran-murattal-aaqib-azeez-by-sa/052.mp3');
for (const m of entries) {
  const u = reciter.urlFor(m[1].padStart(3, '0'));
  assert(u.includes(m[2] === 'CC0' ? '-cc0/' : '-by-sa/'), 'tier host matches license: ' + m[1]);
  assert(u.endsWith('.mp3'), 'mp3 url: ' + m[1]);
}

// UI: range locked to full surah, notices switch to licensed wording
assert.match(creator, /_applyChapterReciterLock\(\)/);
assert.match(creator, /هذه التلاوة مرخّصة للنشر وتحقيق الربح/);

// license log: one row per shipped file, licenses match the map
const rows = log.trim().split('\n').slice(1);
assert.equal(rows.length, 113, 'license log row per file');
for (const r of rows) {
  const [file, lic, credit, size, page, url] = r.split('\t');
  assert(/^CC0$|^CC BY-SA 4\.0$/.test(lic), 'known license: ' + file);
  assert(Number(size) > 100000, 'real file size: ' + file);
  assert(page.startsWith('https://commons.wikimedia.org/wiki/File:'), 'source page: ' + file);
  assert(url.startsWith('https://upload.wikimedia.org/'), 'download URL: ' + file);
}
console.log('ALL OK: licensed chapter reciter catalog, player mode, UI lock, license log');
