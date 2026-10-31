const fs = require('fs');
const path = require('path');
const assert = require('assert');

const root = path.resolve(__dirname, '..');
const html = fs.readFileSync(path.join(root, 'public/index.html'), 'utf8');
const js = fs.readFileSync(path.join(root, 'public/js/publish.js'), 'utf8');
const css = fs.readFileSync(path.join(root, 'public/css/style.css'), 'utf8');

const ids = [...html.matchAll(/\bid="([^"]+)"/g)].map(m => m[1]);
const idCounts = ids.reduce((m, id) => (m[id] = (m[id] || 0) + 1, m), {});
for (const id of ['view-account', 'acctNotice', 'acctAuth', 'acctDataNotice', 'acctStats', 'acctQuickActions', 'acctHowTo', 'acctChannels', 'acctQueue', 'acctAuto', 'btnNewSched', 'schedFile']) {
  assert.strictEqual(idCounts[id], 1, `expected exactly one #${id}`);
}
for (const [id, count] of Object.entries(idCounts)) assert.strictEqual(count, 1, `duplicate HTML id: ${id}`);

const dynamicIds = new Set([...js.matchAll(/\bid="([^"]+)"/g)].map(m => m[1]));
for (const [, id] of js.matchAll(/\$id\(["']([^"']+)["']\)/g)) {
  assert.ok(idCounts[id] || dynamicIds.has(id), `publish.js references missing #${id}`);
}
assert.match(html, /css\/style\.css\?v=6/, 'account CSS cache version must be bumped');
assert.match(html, /js\/publish\.js\?v=10/, 'account JS cache version must be bumped');
assert.match(js, /window\.confirm\(`سيُنشر[^`]*الآن علنًا/, 'manual publish must require confirmation');
assert.match(js, /window\.confirm\("تفعيل الأتمتة/, 'enabling automation must require confirmation');
assert.match(js, /enabled:\s*false/, 'automation default must remain off');
assert.match(css, /\.acct-stats\[hidden\][^{]*\{display:none!important\}/, 'hidden stats must stay hidden despite grid styling');
assert.doesNotMatch(html, /class="plans-row"/, 'remove placeholder subscription-plan cards');

console.log('ACCOUNT UI STATIC CHECK OK');
