#!/usr/bin/env node
/* Local-only render diagnostic. It marks each test verse with a colored square and
 * replaces recitation with three generated tones. No account, uploads or posts.
 * Requires playwright-core, @sparticuz/chromium and ffmpeg (or FFMPEG=/path).
 * Usage: node tools/render_sync_diagnostic.js [--quality=720|1080] [--no-gpu] [--stall-ms=1500]
 * The labels measure an injected marker in encoded frames, NOT OCR or proof of
 * readable Quran text. Results from one machine do not prove production behavior. */
'use strict';
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const http = require('node:http');
const { spawnSync } = require('node:child_process');
const { pathToFileURL } = require('node:url');

const SAMPLE_RATE = 8000, WINDOW = 800, FREQUENCIES = [440, 660, 880];

function toneAt(buffer, offset) {
  let sum = 0;
  const sin = [0, 0, 0], cos = [0, 0, 0];
  for (let i = 0; i < WINDOW; i++) {
    const sample = buffer.readFloatLE((offset + i) * 4);
    sum += sample * sample;
    for (let j = 0; j < FREQUENCIES.length; j++) {
      const angle = 2 * Math.PI * FREQUENCIES[j] * i / SAMPLE_RATE;
      cos[j] += sample * Math.cos(angle); sin[j] += sample * Math.sin(angle);
    }
  }
  if (Math.sqrt(sum / WINDOW) < 0.008) return null;
  const energy = sin.map((s, j) => Math.hypot(s, cos[j]));
  const order = [0, 1, 2].sort((a, b) => energy[b] - energy[a]);
  return energy[order[0]] > energy[order[1]] * 2 ? order[0] : 'unknown';
}

function frameAt(buffer, i) {
  const values = [buffer[i * 3], buffer[i * 3 + 1], buffer[i * 3 + 2]];
  const order = [0, 1, 2].sort((a, b) => values[b] - values[a]);
  return values[order[0]] >= 120 && values[order[0]] > values[order[1]] * 1.8 ? order[0] : null;
}

function analyze(audio, video) {
  if (audio.length % 4 || video.length % 3) throw new Error('Invalid decoded sample data');
  const count = Math.min(Math.floor(audio.length / 4 / WINDOW), video.length / 3);
  const summary = FREQUENCIES.map(frequency => ({ frequency, windows: 0, matched: 0, mismatched: 0, unclassified_frame: 0 }));
  const mismatches = [];
  let silentWindows = 0, unknownAudioWindows = 0;
  for (let i = 0; i < count; i++) {
    const tone = toneAt(audio, i * WINDOW), frame = frameAt(video, i);
    if (tone === null) { silentWindows++; continue; }
    if (tone === 'unknown') { unknownAudioWindows++; continue; }
    const row = summary[tone]; row.windows++;
    if (frame === null) row.unclassified_frame++;
    else if (frame === tone) row.matched++;
    else {
      row.mismatched++;
      const prev = mismatches.at(-1);
      if (prev && prev.end_window === i && prev.audio_index === tone && prev.frame_index === frame) prev.end_window++;
      else mismatches.push({ start_window: i, end_window: i + 1, audio_index: tone, frame_index: frame });
    }
  }
  return {
    window_ms: 100, compared_seconds: count / 10,
    decoded_audio_seconds: audio.length / 4 / SAMPLE_RATE, decoded_video_seconds: video.length / 3 / 10,
    uncompared_audio_seconds: Math.max(0, audio.length / 4 / SAMPLE_RATE - count / 10),
    uncompared_video_seconds: Math.max(0, video.length / 3 / 10 - count / 10),
    all_tones_sampled: count > 0 && summary.every(t => t.windows > 0),
    tones: summary, silent_windows: silentWindows, unclassified_audio_windows: unknownAudioWindows,
    mismatches: mismatches.map(({start_window, end_window, ...rest}) => ({start_seconds: start_window / 10, end_seconds: end_window / 10, ...rest})),
    caveat: 'Synthetic tones and injected frame markers only; 100ms sampling and frame duplication are approximate. This does not verify Quran text or production behavior.',
  };
}

function decode(ffmpeg, args) {
  const result = spawnSync(ffmpeg, ['-v', 'error', ...args], { maxBuffer: 32 * 1024 * 1024 });
  if (result.error) throw result.error;
  if (result.status !== 0) throw new Error(`ffmpeg failed: ${String(result.stderr).slice(0, 1000)}`);
  return result.stdout;
}

async function withTimeout(promise, ms) {
  let timer;
  try {
    return await Promise.race([promise, new Promise((_, reject) => { timer = setTimeout(() => reject(new Error('Local export timed out')), ms); })]);
  } finally { clearTimeout(timer); }
}

function staticServer(root) {
  const types = { '.html': 'text/html; charset=utf-8', '.js': 'application/javascript', '.css': 'text/css', '.json': 'application/json', '.svg': 'image/svg+xml', '.webp': 'image/webp', '.ttf': 'font/ttf', '.png': 'image/png' };
  return http.createServer((req, res) => {
    let pathname;
    try { pathname = decodeURIComponent(new URL(req.url, 'http://localhost').pathname); }
    catch { res.writeHead(400); return res.end(); }
    const file = path.resolve(root, '.' + (pathname === '/' ? '/index.html' : pathname));
    if (!file.startsWith(root + path.sep)) { res.writeHead(403); return res.end(); }
    fs.readFile(file, (error, data) => {
      if (error) { res.writeHead(404); return res.end(); }
      res.writeHead(200, { 'Content-Type': types[path.extname(file)] || 'application/octet-stream', 'Cache-Control': 'no-store' });
      res.end(data);
    });
  });
}

function parseArgs(args) {
  const result = { noGpu: false, stallMs: 0, quality: 720 }, seen = new Set();
  for (const arg of args) {
    const [key, ...rest] = arg.split('=');
    if (seen.has(key)) throw new Error(`Duplicate option: ${key}`);
    seen.add(key);
    if (key === '--no-gpu' && rest.length === 0) result.noGpu = true;
    else if (key === '--quality' && rest.length === 1 && /^(720|1080)$/.test(rest[0])) result.quality = Number(rest[0]);
    else if (key === '--stall-ms' && rest.length === 1 && /^\d+$/.test(rest[0]) && Number(rest[0]) <= 10000) result.stallMs = Number(rest[0]);
    else throw new Error('Usage: node tools/render_sync_diagnostic.js [--quality=720|1080] [--no-gpu] [--stall-ms=0..10000]');
  }
  return result;
}

async function run() {
  const { noGpu, stallMs, quality } = parseArgs(process.argv.slice(2));
  const { chromium: pw } = require('playwright-core');
  const { default: bin } = await import(pathToFileURL(require.resolve('@sparticuz/chromium')).href);
  const server = staticServer(path.resolve(__dirname, '../public'));
  let browser, directory;
  try {
    await new Promise((resolve, reject) => { server.once('error', reject); server.listen(0, '127.0.0.1', resolve); });
    const origin = `http://127.0.0.1:${server.address().port}`;
    browser = await pw.launch({ executablePath: await bin.executablePath(), headless: true, args: [...bin.args,
      '--autoplay-policy=no-user-gesture-required', '--disable-background-timer-throttling', '--disable-backgrounding-occluded-windows',
      '--disable-renderer-backgrounding', '--disable-features=CalculateNativeWinOcclusion', ...(noGpu ? ['--disable-gpu'] : [])] });
    const context = await browser.newContext({ viewport: { width: 900, height: 1200 }, serviceWorkers: 'block' });
    const page = await context.newPage(), pageErrors = [];
    page.on('pageerror', e => pageErrors.push(e.message));
    await page.route('**/*', route => { let url; try { url = new URL(route.request().url()); } catch { return route.abort(); } return url.origin === origin ? route.continue() : route.abort(); });
    await page.goto(origin + '/', { waitUntil: 'load', timeout: 60000 });
    await page.waitForFunction(() => typeof Creator !== 'undefined' && Creator.ready && typeof Quran !== 'undefined' && Quran.data, null, { timeout: 60000 });
    const output = await withTimeout(page.evaluate(async ({ stallMs, quality }) => {
      Selection.ratio = '9:16'; Selection.quality = quality; Creator.setSelection(48, 4, 6, true);
      AyahPlayer.prepare = async function (reciter, verses) {
        this.reciter = reciter; this.ayat = verses; this.silent = false; this.estimates = [];
        const ctx = this.ensureCtx();
        verses.forEach((verse, i) => {
          const buffer = ctx.createBuffer(1, ctx.sampleRate * 2, ctx.sampleRate), data = buffer.getChannelData(0);
          for (let n = 0; n < data.length; n++) data[n] = 0.12 * Math.sin(2 * Math.PI * (440 + i * 220) * n / ctx.sampleRate);
          this.cache.set(`${reciter}/${verse.s}:${verse.a}`, buffer); this.estimates.push(buffer.duration);
        });
        return { ok: verses.length, total: verses.length, failed: 0 };
      };
      const draw = Creator.renderer.draw.bind(Creator.renderer);
      Creator.renderer.draw = function (...args) {
        draw(...args);
        const c = this.ctx; c.save(); c.globalAlpha = 1;
        c.fillStyle = ['#ff0000', '#00ff00', '#0000ff'][this.state.index] || '#ffffff';
        c.fillRect(0, 0, 80, 80); c.restore();
      };
      if (stallMs) {
        const play = AyahPlayer.play.bind(AyahPlayer);
        AyahPlayer.play = function (...args) {
          const result = play(...args);
          setTimeout(() => { const start = performance.now(); while (performance.now() - start < stallMs) {} }, 1300);
          return result;
        };
      }
      await Creator.startExport();
      const video = document.querySelector('#resultVideo');
      if (document.querySelector('#expResult').hidden || !video.src) throw new Error(Creator.lastAbortReason || 'Export failed');
      const dimensions = { width: Creator.renderer.cv.width, height: Creator.renderer.cv.height };
      const bytes = new Uint8Array(await (await fetch(video.src)).arrayBuffer()), parts = [];
      for (let i = 0; i < bytes.length; i += 8192) parts.push(String.fromCharCode(...bytes.subarray(i, i + 8192)));
      return { base64: btoa(parts.join('')), metadata: document.querySelector('#resultMeta').textContent, dimensions };
    }, { stallMs, quality }), 90000);
    if (pageErrors.length) throw new Error('Page errors: ' + pageErrors.join('; '));
    directory = fs.mkdtempSync(path.join(os.tmpdir(), 'quran-sync-diagnostic-'));
    const file = path.join(directory, 'synthetic-video'); fs.writeFileSync(file, Buffer.from(output.base64, 'base64'));
    const ffmpeg = process.env.FFMPEG || 'ffmpeg';
    const audio = decode(ffmpeg, ['-i', file, '-vn', '-af', 'aresample=async=1:first_pts=0', '-ar', '8000', '-ac', '1', '-f', 'f32le', 'pipe:1']);
    const video = decode(ffmpeg, ['-i', file, '-an', '-vf', 'fps=10,crop=40:40:10:10,scale=1:1', '-pix_fmt', 'rgb24', '-f', 'rawvideo', 'pipe:1']);
    const report = analyze(audio, video);
    console.log(JSON.stringify({ mode: { no_gpu: noGpu, injected_stall_ms: stallMs, quality }, dimensions: output.dimensions, metadata: output.metadata, ...report }, null, 2));
    if (!report.all_tones_sampled) {
      console.error('Incomplete measurement: at least one synthetic tone was not sampled in the compared portion.');
      process.exitCode = 2;
    }
  } finally {
    if (browser) await browser.close().catch(() => {});
    await new Promise(resolve => server.close(resolve));
    if (directory) fs.rmSync(directory, { recursive: true, force: true });
  }
}

module.exports = { analyze, toneAt, frameAt, parseArgs };
if (require.main === module) run().catch(error => { console.error(error); process.exitCode = 1; });
