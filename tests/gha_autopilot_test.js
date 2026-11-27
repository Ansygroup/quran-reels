/* GitHub Actions autopilot runner: upload flow, Aaqib-only reciter, privacy handling (mock fetch, no browser). */
const assert = require("node:assert/strict");
process.env.SITE_ORIGIN = "https://quranreels.chatora.us.ci";
const g = require("../scripts/gha_autopilot");
const auto = require("../lib/autopilot");
(async () => {
  const seen = [];
  const f = async (u, o = {}) => {
    seen.push([String(u), o]);
    if (String(u).includes("uploadType=resumable")) return new Response("{}", { status: 200, headers: { location: "https://www.googleapis.com/upload/youtube/v3/videos?upload_id=X" } });
    if (String(u).includes("upload_id=X")) return new Response(JSON.stringify({ id: "vid12345678" }), { status: 200 });
    return new Response("{}", { status: 404 });
  };
  const id = await g.uploadYouTube({ token: "T", buffer: Buffer.alloc(100), mime: "video/webm", title: "t", description: "d", privacy: "nonsense", f });
  assert.equal(id, "vid12345678");
  const meta = JSON.parse(seen[0][1].body); assert.equal(meta.status.privacyStatus, "private"); assert.equal(meta.status.selfDeclaredMadeForKids, false);
  assert.equal(seen[0][1].headers.authorization, "Bearer T");
  // bad upload URL host is refused
  await assert.rejects(g.uploadYouTube({ token: "T", buffer: Buffer.alloc(1), mime: "video/webm", title: "t", description: "d", privacy: "public", f: async () => new Response("{}", { status: 200, headers: { location: "https://evil.example/x" } }) }), /no upload url/);
  // processOne: Aaqib forced, privacy from item, token fetched, nothing public by default
  let got = {};
  const out = await g.processOne({ uid: "u1", template: { content_mode: "mix", reciter_mode: "fixed", reciter: "other", privacy: "unlisted" } }, "2026-11-28", {
    auto,
    render: async (recipe, reciter, bg) => { got.reciter = reciter.id; got.recipe = recipe; return { buffer: Buffer.alloc(30000), mime: "video/webm" }; },
    call: async (p) => { got.tokenPath = p; return { access_token: "TOK" }; },
    upload: async (a) => { got.upload = a; return "abcdefghijk"; },
  });
  assert.equal(out, "abcdefghijk"); assert.equal(got.reciter, "aaqib-azeez-murattal"); assert.equal(got.tokenPath, "/api/cron/token");
  assert.equal(got.upload.privacy, "unlisted"); assert.equal(got.upload.token, "TOK"); assert(got.upload.title.length > 0 && got.upload.title.length <= 100);
  assert(got.upload.description.includes("quranreels.chatora.us.ci"));
  const p2 = await new Promise(r => g.processOne({ uid: "u1", template: {} }, "2026-11-28", { auto, render: async () => ({ buffer: Buffer.alloc(30000), mime: "video/webm" }), call: async () => ({ access_token: "T" }), upload: async a => { r(a.privacy); return "x"; } }));
  assert.equal(p2, "private");
  assert.equal(g.dayIndex("1970-01-02"), 1);
  console.log("ALL OK: runner uploads resumably, Aaqib only, privacy default private, bad upload host refused");
})().catch(e => { console.error(e); process.exitCode = 1; });
