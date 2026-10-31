const assert = require("node:assert/strict");
const { RECIPES, RECITERS, CONTENT_MODES, parseTemplate, chooseRecipe, cairoDate } = require("../lib/autopilot");
const autopilotApi = require("../api/autopilot");
const quran = require("../public/data/quran-uthmani.json");

assert.equal(CONTENT_MODES.size, 3);
assert.equal(RECITERS.length, 8);
assert.ok(RECIPES.length >= 70, "curated rotation should include the prepared recipe library");
for (const recipe of RECIPES) {
  assert.equal(recipe.title, recipe.title.normalize("NFC"));
  assert.equal(recipe.desc, recipe.desc.normalize("NFC"));
  assert.doesNotMatch(`${recipe.title} ${recipe.desc}`, /[\u3400-\u9fff]/, "unexpected CJK characters");
  assert.ok(recipe.s >= 1 && recipe.s <= quran.data.surahs.length);
  assert.ok(recipe.from >= 1 && recipe.to >= recipe.from && recipe.to <= quran.data.surahs[recipe.s - 1].ayahs.length, `invalid Quran range: ${recipe.file}`);
}
assert.equal(parseTemplate({ content_mode: "invalid" }).content_mode, "mix");
assert.equal(parseTemplate({ content_mode: "famous", background: "bogus" }).background, "rotate");
assert.equal(parseTemplate({ content_mode: "sequential" }).reciter_mode, "rotate");
assert.equal(chooseRecipe(parseTemplate({ content_mode: "sequential" }), 0).s, 1);
assert.ok(chooseRecipe(parseTemplate({ content_mode: "famous" }), 0));
assert.equal(cairoDate(new Date("2026-10-30T04:15:00.000Z")), "2026-10-30");

(async () => {
  const res = { statusCode: 0, headers: {}, setHeader(k, v) { this.headers[k] = v; }, end(value) { this.body = value; } };
  await autopilotApi({ method: "GET", headers: {}, url: "/api/autopilot" }, res);
  assert.equal(res.statusCode, 401, "dashboard API must reject unauthenticated requests");
  assert.equal(JSON.parse(res.body).error, "سجّل الدخول أولًا");
  console.log("AUTOPILOT UNIT OK");
})().catch(error => { console.error(error); process.exitCode = 1; });
