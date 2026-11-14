/* Notices must not imply that the tool grants third-party audio rights. */
const assert = require('node:assert/strict');
const fs = require('node:fs');
const home = fs.readFileSync('public/index.html', 'utf8');
const publish = fs.readFileSync('public/js/publish.js', 'utf8');
const terms = fs.readFileSync('public/terms/index.html', 'utf8');
const sw = fs.readFileSync('public/sw.js', 'utf8');
assert.match(home, /id="selReciter" aria-describedby="reciterRightsNotice"/);
assert.match(home, /id="reciterRightsNotice"[^>]*>[^<]*لم نتحقق من تراخيص جميع التسجيلات للنشر أو الربح/);
assert.match(publish, /id="acctReciter" aria-describedby="acctReciterRights"/);
assert.match(publish, /id="acctReciterRights"[^>]*>[^<]*لم نتحقق من تراخيص جميع التسجيلات للنشر أو الربح/);
const scripts = [...terms.matchAll(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/g)].map(m => JSON.parse(m[1]));
const answer = scripts.find(x => x['@type'] === 'FAQPage').mainEntity.find(x => x.name === 'هل يمكنني استخدام الفيديوهات تجاريًا؟').acceptedAnswer.text;
assert(terms.includes(`<h3>هل يمكنني استخدام الفيديوهات تجاريًا؟</h3><p>${answer}</p>`));
assert.match(answer, /تحقّق من إذن أصحاب الحقوق/);
assert.doesNotMatch(terms, /الفيديوهات والملفات التي تُنتجها من الموقع <b>ملكك أنت<\/b>|نعم، مخرجاتك ملكك/);
const version = (home.match(/js\/publish\.js\?v=(\d+)/) || [])[1];
assert(version && sw.includes(`/js/publish.js?v=${version}`));
console.log('ALL OK: rights notices, terms FAQ, and cached publish version');
