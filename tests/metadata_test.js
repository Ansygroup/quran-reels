#!/usr/bin/env node
/* وصف حقيقي من رقم السورة والقارئ المختار، بلا ادّعاء نطاق رندر قد يتغير. */
const assert = require('node:assert/strict');
const A = require('../lib/autopilot'); const M = A.__test.metadata;
const names = require('../lib/surah_names.json');
assert.equal(names.length, 114);
const source = require('../public/data/quran-uthmani.json').data.surahs;
for (const s of source) {
  const expected = s.number === 3 ? 'آل عمران' : s.name.replace(/\p{M}/gu,'').replace(/ٱ/g,'ا').replace(/ـ/g,'').replace(/^سورة /,'');
  assert.equal(names[s.number - 1], expected, `surah name ${s.number}`);
}
for (const recipe of A.RECIPES) {
  for (const platform of ['youtube','facebook','instagram','tiktok','x']) {
    const meta = M(recipe, { name:'قارئ مختار' }, platform);
    assert(meta.title.includes(names[recipe.s - 1]), `wrong surah ${recipe.s}: ${meta.title}`);
    assert(meta.title.includes('قارئ مختار')); assert(meta.caption.includes(names[recipe.s - 1]));
    assert(!meta.caption.includes('#')); assert(meta.hashtags.split(' ').every(t => /^#[\p{L}\p{N}_]+$/u.test(t)));
    assert(meta.title.length <= 100); assert(meta.caption.length <= 2100);
    if (platform === 'x') assert([meta.title,meta.caption,meta.hashtags].join('\n').length <= 275);
    assert(!meta.caption.includes('الآيات')); // حتى لو قصّر المولّد نهاية النطاق
  }
}
const brokenRecipe = { s:73, from:1,to:6, title:'سورة المدثر', tags:'المدثر,سورة المدثر' };
const correct = M(brokenRecipe, {name:'ماهر المعيقلي'}, 'youtube');
assert.match(correct.title,/سورة المزمل/); assert.doesNotMatch(JSON.stringify(correct),/المدثر/);
assert.match(M({s:3},{name:'السديس'},'youtube').hashtags, /#سورة_آل_عمران/);
const one = M({s:2,from:255,to:255},{name:'القارئ'},'youtube'); assert(!one.caption.includes('آيات من'));
const article = M({s:1,article_title:'عنوان مهم',article_url:'/articles/a-guide/'},{name:'السديس'},'youtube');
assert.match(article.caption,/مقال للقراءة/); assert.match(article.caption,/https:\/\/quran-reels-tau.vercel.app\/articles\/a-guide\//);
for (const url of ['https://evil.test/articles/a','//evil.test','/articles/../../admin','/articles/a?x=y', undefined]) {
  const m=M({s:1,article_title:'عنوان',article_url:url},{name:'السديس'},'youtube'); assert(!m.caption.includes('مقال للقراءة'));
}
const unknown = M({s:999},{},'youtube'); assert.match(unknown.title,/القرآن الكريم/); assert(!unknown.title.includes('999'));
console.log(`ALL OK: ${A.RECIPES.length} وصفًا × 5 منصات، اسم سورة صحيح، قارئ فعلي ووسوم بلا تكرار`);
