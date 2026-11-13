/* لا تتصل هذه الاختبارات بالصوت أو قاعدة البيانات أو منصات النشر. */
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const { assertCompleteAudio } = require('../lib/autopilot').__test;

function pageWith(verses, keys, reciter = 'reciter') {
  const context = { AyahPlayer: { reciter, cache: new Map(keys.map(key => [key, {}])) }, Selection: { list: () => verses } };
  return { evaluate: async fn => vm.runInNewContext(`(${fn})()`, context) };
}

(async () => {
  const verses = [{ s: 48, a: 4 }, { s: 48, a: 5 }];
  const keys = ['reciter/48:4', 'reciter/48:5'];
  const complete = await assertCompleteAudio(pageWith(verses, keys));
  assert.equal(complete.total, 2);
  assert.equal(complete.missing.length, 0);
  await assert.rejects(assertCompleteAudio(pageWith(verses, [keys[0]])), /تعذّر تحميل تلاوة 1 آية/);
  await assert.rejects(assertCompleteAudio(pageWith(verses, [])), /تعذّر تحميل تلاوة 2 آية/);
  await assert.rejects(assertCompleteAudio(pageWith(verses, keys, 'other')), /تعذّر تحميل تلاوة 2 آية/);
  await assert.rejects(assertCompleteAudio(pageWith([], [])), /تعذّر التأكد/);
  await assert.rejects(assertCompleteAudio({ evaluate: async () => { throw Error('page closed'); } }), /تعذّر التأكد/);
  // تحقق من أن حارس الرندر نفسه غير مشروط بنوع المحتوى ويقع قبل تنزيل الملف.
  const source = fs.readFileSync('lib/autopilot.js', 'utf8');
  const render = source.slice(source.indexOf('async function renderRecipe('), source.indexOf('/* أعمدة المقالات'));
  assert.match(render, /\n\s*diag\.complete_audio = await assertCompleteAudio\(page\);/);
  assert(render.indexOf('diag.complete_audio = await assertCompleteAudio(page);') < render.indexOf('page.waitForEvent("download"'));
  console.log('ALL OK: automated renders require all selected verse audio before download, regardless of selection mode');
})().catch(error => { console.error(error); process.exitCode = 1; });
