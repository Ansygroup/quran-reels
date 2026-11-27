/* نافذة الرفع إلى يوتيوب: بلا window.prompt، الخصوصية الافتراضية خاص، حد 15 دقيقة، إلغاء بـ Esc. */
const assert = require('node:assert/strict'), fs = require('node:fs'), { JSDOM } = require('jsdom');
const src = fs.readFileSync('public/js/publish.js', 'utf8');
assert(!/window\.prompt\s*\(/.test(src), 'no window.prompt calls');
const dom = new JSDOM('<body></body>', { url: 'https://app.test/', runScripts: 'outside-only', pretendToBeVisual: true });
const w = dom.window; let prompts = 0; w.prompt = () => { prompts++; return null; };
w.eval(src);
const P = w.QRPublish; assert.equal(typeof P.uploadDialog, 'function');
const $ = k => w.document.querySelector(`#ytUploadDlg [data-yt="${k}"]`);
const tick = () => new Promise(r => setTimeout(r, 0));
(async () => {
  let p = P.uploadDialog({ name: 'clip.webm', channel: 'قناتي' }); await tick();
  const dlg = w.document.getElementById('ytUploadDlg');
  assert(dlg && dlg.getAttribute('role') === 'dialog' && dlg.getAttribute('aria-modal') === 'true');
  assert.match($('channel').textContent, /قناتي/); assert.equal($('privacy').value, 'private'); assert.match($('title').value, /clip/);
  assert.equal(w.document.activeElement, $('title'));
  // موعد قريب جدًا مرفوض
  const soon = new Date(Date.now() + 5 * 60e3 - new Date().getTimezoneOffset() * 0).toISOString().slice(0, 16);
  $('when').value = soon; $('ok').click(); await tick();
  assert.match($('err').textContent, /15 دقيقة/); assert(w.document.getElementById('ytUploadDlg'));
  // موعد صالح
  const later = new Date(Date.now() + 3 * 3600e3); const pad = n => String(n).padStart(2, '0');
  $('when').value = `${later.getFullYear()}-${pad(later.getMonth() + 1)}-${pad(later.getDate())}T${pad(later.getHours())}:${pad(later.getMinutes())}`;
  $('title').value = '  عنوان  '; $('ok').click(); let r = await p;
  assert.equal(r.title, 'عنوان'); assert.equal(r.privacy, 'private'); assert(Math.abs(new Date(r.publishAt) - later) < 120e3);
  assert.equal(w.document.getElementById('ytUploadDlg'), null);
  // علني: لا موعد
  p = P.uploadDialog({ name: 'a.webm' }); await tick(); $('privacy').value = 'public'; $('privacy').dispatchEvent(new w.Event('change')); assert.equal($('whenwrap').style.display, 'none'); $('ok').click(); r = await p;
  assert.equal(r.privacy, 'public'); assert.equal(r.publishAt, '');
  // عنوان فارغ مرفوض ثم إلغاء بـ Esc
  p = P.uploadDialog({ name: 'a.webm' }); await tick(); $('title').value = ' '; $('ok').click(); assert.match($('err').textContent, /عنوانًا/);
  w.document.dispatchEvent(new w.KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true })); assert.equal(await p, null);
  assert.equal(w.document.getElementById('ytUploadDlg'), null);
  // زر الإلغاء
  p = P.uploadDialog({}); await tick(); $('cancel').click(); assert.equal(await p, null); assert.equal(prompts, 0);
  console.log('ALL OK: upload dialog (default private, 15-min rule, cancel/Esc, a11y attrs, no window.prompt)');
})().catch(e => { console.error(e); process.exitCode = 1; });
