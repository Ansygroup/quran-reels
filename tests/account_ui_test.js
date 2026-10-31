const fs = require('fs');
const path = require('path');
const assert = require('assert');

const root = path.resolve(__dirname, '..');
const html = fs.readFileSync(path.join(root, 'public/index.html'), 'utf8');
const js = fs.readFileSync(path.join(root, 'public/js/publish.js'), 'utf8');
const css = fs.readFileSync(path.join(root, 'public/css/style.css'), 'utf8');
const api = fs.readFileSync(path.join(root, 'api/autopilot.js'), 'utf8');

const ids = [...html.matchAll(/\bid="([^"]+)"/g)].map(m => m[1]);
const idCounts = ids.reduce((m, id) => (m[id] = (m[id] || 0) + 1, m), {});
for (const id of ['view-account', 'acctNotice', 'acctAuth', 'acctDataNotice', 'acctStats', 'acctQuickActions', 'acctHowTo', 'acctChannels', 'acctQueue', 'acctAuto', 'acctAutoRuns', 'acctRunChannel', 'acctRunsRefresh', 'acctRunList', 'btnNewSched', 'schedFile']) {
  assert.strictEqual(idCounts[id], 1, `expected exactly one #${id}`);
}
for (const [id, count] of Object.entries(idCounts)) assert.strictEqual(count, 1, `duplicate HTML id: ${id}`);

const dynamicIds = new Set([...js.matchAll(/\bid="([^"]+)"/g)].map(m => m[1]));
for (const [, id] of js.matchAll(/\$id\(["']([^"']+)["']\)/g)) {
  assert.ok(idCounts[id] || dynamicIds.has(id), `publish.js references missing #${id}`);
}
assert.match(html, /css\/style\.css\?v=7/, 'account CSS cache version must be bumped');
assert.match(html, /js\/publish\.js\?v=11/, 'account JS cache version must be bumped');
assert.match(js, /window\.confirm\(`سيُنشر[^`]*الآن علنًا/, 'manual publish must require confirmation');
assert.match(js, /window\.confirm\("تفعيل الأتمتة/, 'enabling automation must require confirmation');
assert.match(js, /enabled:\s*false/, 'automation default must remain off');
assert.match(css, /\.acct-stats\[hidden\][^{]*\{display:none!important\}/, 'hidden stats must stay hidden despite grid styling');
assert.doesNotMatch(html, /class="plans-row"/, 'remove placeholder subscription-plan cards');
assert.match(js, /loadAutoHistory\(\).*?renderAutoRuns\(\)/s, 'refreshAccount must load and render private automation history');
assert.match(js, /youtubeVideoId\(run\.external_url\)/, 'only validated YouTube URLs should be embedded');
assert.match(js, /youtube-nocookie\.com\/embed\//, 'use privacy-enhanced YouTube embeds');
assert.match(js, /acctRunsRefresh[\s\S]*?refreshAutoRuns/, 'history refresh control must be wired');
assert.match(api, /user_id=eq\.\$\{encodeURIComponent\(uid\)\}&run_type=eq\.daily/, 'history must be limited to the authenticated user’s automatic runs');
assert.match(api, /user_id: `eq\.\$\{uid\}`/, 'queue metadata lookup must be scoped to the authenticated user');
const vercel = JSON.parse(fs.readFileSync(path.join(root, 'vercel.json'), 'utf8'));
const cspValues = JSON.stringify(vercel).match(/default-src[^"\\]+/g) || [];
assert.ok(cspValues.length >= 1 && JSON.stringify(vercel).includes('https://www.youtube-nocookie.com'), 'CSP must allow the privacy-enhanced video iframe');

console.log('ACCOUNT UI STATIC CHECK OK');
