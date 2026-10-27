const proxy = require('/home/user/quran-reels/api/proxy.js');
const ip = require('/home/user/quran-reels/api/ip.js');
const cfg = require('/home/user/quran-reels/api/app-config.js');

function mockRes() {
  const res = { statusCode: 200, headers: {}, body: null };
  res.setHeader = (k, v) => { res.headers[String(k).toLowerCase()] = v; };
  res.end = (b) => { res.body = b === undefined ? Buffer.alloc(0) : (Buffer.isBuffer(b) ? b : Buffer.from(String(b))); };
  return res;
}
async function call(handler, url, method = 'GET', headers = {}) {
  const res = mockRes();
  const out = handler({ url, method, headers }, res);
  if (out && typeof out.then === 'function') await out;
  for (let i = 0; i < 800 && res.body === null; i += 50) await new Promise(r => setTimeout(r, 50));
  return res;
}
(async () => {
  const errs = [];
  const chk = (name, cond, extra = '') => {
    if (cond) console.log('OK   ' + name);
    else { errs.push(name); console.log('FAIL ' + name + ' :: ' + extra); }
  };

  let r = await call(proxy, '/proxy');
  chk('proxy no-u -> 400', r.statusCode === 400, r.statusCode);

  r = await call(proxy, '/proxy?u=' + encodeURIComponent('https://evil.com/x'));
  chk('proxy evil host -> 403', r.statusCode === 403, r.statusCode);

  r = await call(proxy, '/proxy?u=' + encodeURIComponent('ftp://everyayah.com/x'));
  chk('proxy bad scheme -> 403', r.statusCode === 403, r.statusCode);

  r = await call(proxy, '/proxy?u=' + encodeURIComponent('https://api.alquran.cloud/v1/surah/1'));
  chk('proxy good -> 200', r.statusCode === 200, r.statusCode + ' ' + (r.body && r.body.slice(0, 120)));
  chk('proxy ACAO *', r.headers['access-control-allow-origin'] === '*', r.headers['access-control-allow-origin']);
  chk('proxy json content-type', String(r.headers['content-type']).includes('json'), r.headers['content-type']);
  chk('proxy CDN cache hdr', String(r.headers['cache-control']).includes('s-maxage=21600'), r.headers['cache-control']);

  r = await call(proxy, '/proxy?u=' + encodeURIComponent('https://api.alquran.cloud/v1/surah/1'));
  chk('proxy 2nd call X-Cache HIT', r.headers['x-cache'] === 'HIT', r.headers['x-cache']);

  // Range served from warm cache
  r = await call(proxy, '/proxy?u=' + encodeURIComponent('https://api.alquran.cloud/v1/surah/1'), 'GET', { range: 'bytes=0-9' });
  chk('proxy range -> 206', r.statusCode === 206, r.statusCode);
  chk('proxy range Content-Range', /^bytes 0-9\//.test(r.headers['content-range'] || ''), r.headers['content-range']);
  chk('proxy range body len 10', r.body && r.body.length === 10, r.body && String(r.body.length));

  r = await call(proxy, '/proxy?u=' + encodeURIComponent('https://api.alquran.cloud/v1/nonexistent-xyz'));
  chk('proxy upstream 404 -> 502', r.statusCode === 502, r.statusCode);

  r = await call(proxy, '/proxy', 'POST');
  chk('proxy POST -> 405', r.statusCode === 405, r.statusCode);

  // rate limit: 121st request from same IP within a minute -> 429
  let got429 = false;
  for (let i = 0; i < 130 && !got429; i++) {
    r = await call(proxy, '/proxy?u=' + encodeURIComponent('https://api.alquran.cloud/v1/surah/2'), 'GET', { 'x-forwarded-for': '9.9.9.9' });
    if (r.statusCode === 429) got429 = true;
  }
  chk('proxy rate limit -> 429', got429, 'no 429 after 130 reqs');
  r = await call(proxy, '/proxy?u=' + encodeURIComponent('https://api.alquran.cloud/v1/surah/2'), 'GET', { 'x-forwarded-for': '8.8.8.8' });
  chk('proxy other IP unaffected', r.statusCode === 200, r.statusCode);

  r = await call(ip, '/api/ip');
  let j = null; try { j = JSON.parse(r.body.toString()); } catch {}
  chk('ip -> 200 parseable json', r.statusCode === 200 && j && typeof j.latitude === 'number' && j.country_name, r.statusCode + ' ' + (r.body && r.body.toString().slice(0, 160)));
  chk('ip no s-maxage (per-visitor)', !String(r.headers['cache-control']).includes('s-maxage'), r.headers['cache-control']);

  r = await call(cfg, '/api/app-config');
  let c = null; try { c = JSON.parse(r.body.toString()); } catch {}
  chk('config -> 200 object with supabase', r.statusCode === 200 && c && c.supabase && typeof c.supabase.url === 'string', r.body && r.body.toString());

  console.log(errs.length ? 'ERRORS ' + errs.length + ': ' + JSON.stringify(errs) : 'ALL OK (0 errors)');
  process.exit(errs.length ? 1 : 0);
})();
