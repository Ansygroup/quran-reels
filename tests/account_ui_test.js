const fs = require('fs');
const path = require('path');
const assert = require('assert');

const root = path.resolve(__dirname, '..');
const html = fs.readFileSync(path.join(root, 'public/index.html'), 'utf8');
const js = fs.readFileSync(path.join(root, 'public/js/publish.js'), 'utf8');
const css = fs.readFileSync(path.join(root, 'public/css/style.css'), 'utf8');
const api = fs.readFileSync(path.join(root, 'api/autopilot.js'), 'utf8');
const sw = fs.readFileSync(path.join(root, 'public/sw.js'), 'utf8');

const ids = [...html.matchAll(/\bid="([^"]+)"/g)].map(m => m[1]);
const idCounts = ids.reduce((m, id) => (m[id] = (m[id] || 0) + 1, m), {});
for (const id of ['view-account', 'acctNotice', 'acctAuth', 'acctDataNotice', 'acctStats', 'acctQuickActions', 'acctDashboardTitle', 'acctDashboardRefresh', 'acctDashStats', 'acctUpcoming', 'acctKanban', 'acctHowTo', 'acctChannels', 'acctQueue', 'acctAuto', 'acctAutoRuns', 'acctRunChannel', 'acctRunsRefresh', 'acctRunList', 'btnNewSched', 'schedFile']) {
  assert.strictEqual(idCounts[id], 1, `expected exactly one #${id}`);
}
for (const [id, count] of Object.entries(idCounts)) assert.strictEqual(count, 1, `duplicate HTML id: ${id}`);

const dynamicIds = new Set([...js.matchAll(/\bid="([^"]+)"/g)].map(m => m[1]));
for (const [, id] of js.matchAll(/\$id\(["']([^"']+)["']\)/g)) {
  assert.ok(idCounts[id] || dynamicIds.has(id), `publish.js references missing #${id}`);
}
assert.match(html, /css\/style\.css\?v=12/, 'account CSS cache version must be bumped');
assert.match(html, /js\/publish\.js\?v=25/, 'account JS cache version must be bumped');
assert.match(sw, /const CACHE = "qr-v18"/, 'service worker cache must be invalidated');
assert.match(sw, /css\/style\.css\?v=12/, 'offline shell must include current account styles');
assert.match(sw, /js\/publish\.js\?v=25/, 'offline shell must include current account logic');
assert.match(js, /openSchedule\("", file\)/, 'selected schedule video should remain local until the user saves');
assert.match(js, /function safeExternalUrl\(/, 'published links must be restricted to known HTTPS hosts');
assert.match(js, /function renderDashboard\(/, 'account dashboard must summarize and render the Kanban board');
assert.match(js, /function renderUpcomingSchedule\(/, 'dashboard must render a preview of the upcoming batch');
assert.match(js, /dashboard\.upcoming/, 'upcoming videos must come from the authenticated account response');
assert.ok(js.includes('Africa/Cairo'), 'upcoming time must be converted to Cairo local time');
assert.match(js, /UTC/, 'upcoming time must also show the cron UTC schedule');
assert.match(api, /upcoming,/, 'authenticated account API must return private upcoming video previews');
assert.match(js, /dashboardLoading = true;/, 'account refresh must enter a loading state before reading settings');
assert.match(js, /if \(dashboardLoading\) \{[\s\S]{0,500}لن يُحفَظ أي تغيير[\s\S]{0,200}return;/, 'automation form must not expose defaults during loading');
assert.match(js, /await Promise\.all\(\[loadConnections\(\), loadQueue\(\), loadAutoHistory\(\)\]\);\s*if \(sequence !== refreshSequence\) return;\s*dashboardLoading = false;/, 'settings become editable only after the current refresh completes');
assert.match(js, /if \(dashboardError\) \{[\s\S]{0,500}acctAutoRetry[\s\S]{0,300}return;\s*\}\s*const config =/, 'failed settings reads must show retry instead of editable fallback settings');
assert.match(js, /function renderAccountStats\(\) \{[\s\S]{0,350}if \(dashboardError\)[\s\S]{0,300}لا نعرض أرقامًا توحي بأن سجلّك فارغ/, 'failed history reads must not be rendered as zero published videos');
assert.match(js, /dashboard = \{ config: null, channels: \[\], runs: \[\], reciters: \[\] \};/, 'failed settings reads must preserve unknown state rather than imply automation is disabled');
assert.match(js, /acctBoardRetry/, 'dashboard errors must offer retry');
assert.match(js, /if \(queueError\) \{[\s\S]{0,400}لا نفترض أن جدولك فارغًا[\s\S]{0,200}acctQueueRetry/, 'queue failures must not be presented as an empty schedule');
assert.match(js, /connectionsError[\s\S]{0,250}acctConnectionsRetry/, 'connection failures must show retry instead of inviting duplicate linking');
assert.match(js, /kanban-column/, 'Kanban board must have visible status columns');
assert.match(js, /autoPurpose/, 'user must be able to choose a publishing purpose');
assert.match(js, /autoVideoStyle/, 'user must be able to choose or rotate video styles');
assert.match(js, /autoReciter/, 'user must be able to lock a selected reciter into the automation template');
assert.match(js, /reciter_mode, reciter/, 'selected reciter mode and identity must be persisted');
assert.match(js, /autoCustomMessage/, 'user must be able to set optional published copy');
assert.match(js, /window\.confirm\(`سيُنشر[^`]*الآن علنًا/, 'manual publish must require confirmation');
assert.match(js, /needsConfirmation && !window\.confirm\(/, 'public automation changes must require confirmation');
assert.match(js, /enabled:\s*false/, 'automation default must remain off');
assert.match(css, /\.acct-stats\[hidden\][^{]*\{display:none!important\}/, 'hidden stats must stay hidden despite grid styling');
assert.doesNotMatch(html, /class="plans-row"/, 'remove placeholder subscription-plan cards');
assert.match(js, /loadAutoHistory\(\).*?renderAutoRuns\(\)/s, 'refreshAccount must load and render private automation history');
assert.match(js, /youtubeVideoId\(run\.external_url\)/, 'only validated YouTube URLs should be embedded');
assert.match(js, /youtube-nocookie\.com\/embed\//, 'use privacy-enhanced YouTube embeds');
assert.match(js, /acctRunsRefresh[\s\S]*?refreshAutoRuns/, 'history refresh control must be wired');
assert.match(api, /user_id=eq\.\$\{encodeURIComponent\(uid\)\}&run_type=eq\.daily/, 'history must be limited to the authenticated user’s automatic runs');
assert.match(api, /user_id: `eq\.\$\{uid\}`/, 'queue metadata lookup must be scoped to the authenticated user');
assert.match(api, /youtube_connection_ids/, 'automation settings must accept selected channel IDs');
assert.match(api, /daily_count/, 'automation settings must accept a per-day video count');
assert.match(api, /custom_message/, 'automation API must persist the user-approved message');
assert.match(api, /video_style/, 'automation API must persist the chosen visual style');
assert.match(api, /reciter_mode/,'automation API must persist a fixed or rotating reciter mode');
assert.match(api, /selectedReciter\.id/, 'automation API must validate and persist the selected reciter');
assert.match(js, /class="autoChannel"/, 'the user must be able to select multiple linked channels');
assert.match(js, /acct-run-steps/, 'each run must show visible progress steps');
assert.match(api, /daily_index,daily_total,channel_name/, 'history includes per-video sequence and target channel');
const oauth = fs.readFileSync(path.join(root, 'lib/oauth.js'), 'utf8');
const ytCallback = fs.readFileSync(path.join(root, 'lib/cb_youtube.js'), 'utf8');
assert.match(oauth, /prompt: "consent select_account"/, 'YouTube OAuth must allow choosing another Google account');
assert.match(ytCallback, /for \(const item of channels\)/, 'all returned YouTube channels should be stored, not only the first');
const vercel = JSON.parse(fs.readFileSync(path.join(root, 'vercel.json'), 'utf8'));
const cspValues = JSON.stringify(vercel).match(/default-src[^"\\]+/g) || [];
assert.ok(cspValues.length >= 1 && JSON.stringify(vercel).includes('https://www.youtube-nocookie.com'), 'CSP must allow the privacy-enhanced video iframe');

console.log('ACCOUNT UI STATIC CHECK OK');
