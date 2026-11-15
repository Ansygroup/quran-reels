'use strict';
/* Regression test for specific unsafe claims, not a legal review of all content. */
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const banned = [
  'يحمي المقطع من دعاوى إعادة النشر',
  'هذا السطر الرباعي يحمي المقطع',
  'قطع قصير مُنسب للمصدر أسلم',
  'القطع القصير المُشارَك بروابط أسلم',
  'لا موسيقى تعني لا خلاف على تراخيص ولا مفاجآت حقوق',
  'تحرير المقاطع القصيرة أسهل وأسلم في الحقوق',
  'الأصوات بلا حقوق',
  'اسأل قبل النشر أو التقط التلاوة من مصدر رسمي',
];
function walk(dir) {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap(e => {
    const p = path.join(dir, e.name);
    return e.isDirectory() ? walk(p) : e.isFile() && p.endsWith('.html') ? [p] : [];
  });
}
const files = [...walk('public'), ...['library.js', 'index.js', 'index_b.js', 'index_c.js', 'gen_data_reciters.js'].map(f => path.join('posts', f))];
for (const file of files) {
  const text = fs.readFileSync(file, 'utf8');
  for (const phrase of banned) assert(!text.includes(phrase), `${file} repeats unsafe claim: ${phrase}`);
}
for (const file of ['reciter-voice-rights', 'minshawi-rare-recitations', 'ethical-quran-content', 'caption-audio-credits']) {
  const html = fs.readFileSync(`public/articles/${file}/index.html`, 'utf8');
  const schemas = [...html.matchAll(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/g)].map(m => JSON.parse(m[1]));
  const faq = schemas.find(s => s['@type'] === 'FAQPage');
  assert(faq, `${file}: FAQ schema missing`);
  for (const q of faq.mainEntity) {
    assert(html.includes(`<h3>${q.name}</h3><p>${q.acceptedAnswer.text}</p>`), `${file}: FAQ schema/visible copy mismatch for ${q.name}`);
  }
}
const library = fs.readFileSync('posts/library.js', 'utf8');
assert(library.includes('التنويه وحده ليس إذنًا ولا يضمن تجنّب مطالبات الحقوق'));
const rightsPage = fs.readFileSync('public/articles/reciter-voice-rights/index.html', 'utf8');
assert(rightsPage.includes('التنويه وحده لا يمنح الحق'));
console.log(`ALL OK: specific misleading rights claims absent in ${files.length} HTML/source files; selected visible FAQ matches schema (not a legal audit)`);
