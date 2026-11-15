/* Verify selected generated pages and account claims without network or publishing. */
'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { execFileSync } = require('node:child_process');
const { JSDOM } = require('jsdom');
const root = path.resolve(__dirname, '..');
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'qr-copy-test-'));
const pages = ['faq/index.html', 'blog/index.html', 'blog/schedule-quran-reels/index.html',
  'blog/quran-video-ideas/index.html', 'blog/free-quran-video-maker/index.html',
  'blog/compare-quran-video-tools/index.html', 'blog/mistakes-quran-shorts/index.html',
  'blog/friday-content/index.html', 'blog/first-quran-video-tutorial/index.html'];
const readDoc = p => new JSDOM(fs.readFileSync(p, 'utf8')).window.document;
const jsonLD = doc => [...doc.querySelectorAll('script[type="application/ld+json"]')].map(x => JSON.parse(x.textContent));
const normalize = text => text.replace(/\s+/g, ' ').trim();
try {
  fs.mkdirSync(path.join(tmp, 'scripts'));
  for (const name of ['build_lp.js', 'build_blog.js', 'site_nav.js']) fs.copyFileSync(path.join(root, 'scripts', name), path.join(tmp, 'scripts', name));
  for (const script of ['build_lp.js', 'build_blog.js']) execFileSync(process.execPath, [path.join(tmp, 'scripts', script)], { stdio: 'ignore' });
  for (const page of pages) {
    const actual = readDoc(path.join(root, 'public', page));
    const generated = readDoc(path.join(tmp, 'public', page));
    assert.equal(actual.querySelector('main').innerHTML, generated.querySelector('main').innerHTML, `${page}: generated content drift`);
    for (const selector of ['meta[name="description"]', 'meta[property="og:description"]', 'meta[name="twitter:description"]']) {
      assert.equal(actual.querySelector(selector)?.content, generated.querySelector(selector)?.content, `${page}: ${selector} drift`);
    }
    const faqs = jsonLD(actual).filter(x => x['@type'] === 'FAQPage');
    if (page !== 'blog/index.html') assert.deepEqual(faqs, jsonLD(generated).filter(x => x['@type'] === 'FAQPage'), `${page}: generated FAQ schema drift`);
    for (const faq of faqs) for (const q of faq.mainEntity) {
      const visible = [...actual.querySelectorAll('.qa')].find(el => normalize(el.querySelector('h3')?.textContent || '') === normalize(q.name));
      assert(visible, `${page}: structured question is not displayed: ${q.name}`);
      const answer = actual.createElement('div'); answer.innerHTML = q.acceptedAnswer.text;
      assert.equal(normalize(visible.querySelector('p').textContent), normalize(answer.textContent), `${page}: answer mismatch: ${q.name}`);
    }
  }
  const faq = readDoc(path.join(root, 'public/faq/index.html'));
  const faqText = faq.querySelector('main').textContent;
  assert.match(faqText, /الأتمتة تعمل على الخادم/);
  assert.match(faqText, /جدولة ملف مُصدَّر يدويًا غير متاحة/);
  assert.match(faqText, /تيليجرام وواتساب غير متاح/);
  const schedule = readDoc(path.join(root, 'public/blog/schedule-quran-reels/index.html'));
  const text = schedule.querySelector('main').textContent;
  for (const claim of [/04:15 UTC/, /غير متاحة حاليًا/, /قد يؤدي الربط إلى تفعيل الأتمتة/, /لا يؤكد معالجة الفيديو/, /إلغاء تصريح المنصة إجراء منفصل/]) assert.match(text, claim);
  for (const old of [/06:15 بتوقيت القاهرة/, /سيُنشر في وقته/, /كل مقطع يُجدول بضغوطة/, /إمكانية فك الربط في أي لحظة بضغطة/]) assert.doesNotMatch(text, old);
  assert(schedule.querySelector('main a[href="/#/account"]'), 'account CTA must link to account');
  const vercel = JSON.parse(fs.readFileSync(path.join(root, 'vercel.json'), 'utf8'));
  assert(vercel.crons.some(x => x.path === '/api/cron/publish' && x.schedule === '15 4 * * *'), 'copy uses configured UTC cron');
  const platforms = require(path.join(root, 'lib/platforms.js'));
  assert.equal(platforms.canPublish('telegram'), false); assert.equal(platforms.canPublish('whatsapp'), false);
  console.log('ALL OK: selected static pages match generators; FAQ schema, account limits, CTA and cron checked locally');
} finally { fs.rmSync(tmp, { recursive: true, force: true }); }
