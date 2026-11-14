/* CANDIDATE ONLY: not imported by the publisher. No production policy is set.
 * The caller must independently validate URL, origin and ownership and choose
 * limits after operational review. This does not inspect/validate media. */
'use strict';

async function readBoundedVideoCandidate(url, { maxBytes, timeoutMs, fetchImpl = fetch } = {}) {
  if (!Number.isSafeInteger(maxBytes) || maxBytes < 1 || !Number.isSafeInteger(timeoutMs) || timeoutMs < 1 || timeoutMs > 2147483647 || typeof fetchImpl !== 'function') {
    throw new Error('invalid candidate limits');
  }
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  const error = () => new Error('تعذّر قراءة ملف الفيديو ضمن حدود الاختبار — راجع المهمة');
  let reader, response, complete = false;
  try {
    response = await fetchImpl(url, { redirect: 'error', signal: controller.signal });
    if (controller.signal.aborted || !response.ok || response.status !== 200 || !response.body || typeof response.body.getReader !== 'function') throw error();
    const raw = response.headers.get('content-length');
    let expected = null;
    if (raw !== null) {
      if (!/^\d+$/.test(raw)) throw error();
      const length = Number(raw);
      if (!Number.isSafeInteger(length)) throw error();
      // HTTP Content-Length describes encoded bytes; fetch may decompress.
      // Only compare it to decoded bytes for an identity response.
      const encoding = (response.headers.get('content-encoding') || '').trim().toLowerCase();
      if (!encoding || encoding === 'identity') { if (length > maxBytes) throw error(); expected = length; }
    }
    reader = response.body.getReader();
    const chunks = []; let total = 0;
    for (;;) {
      const { done, value } = await reader.read();
      if (controller.signal.aborted) throw error();
      if (done) break;
      if (!(value instanceof Uint8Array)) throw error();
      if (value.byteLength > maxBytes - total) throw error();
      total += value.byteLength;
      chunks.push(Buffer.from(value));
    }
    if (!total || (expected !== null && total !== expected)) throw error();
    const result = Buffer.concat(chunks, total);
    complete = true;
    return result;
  } catch { throw error(); }
  finally {
    clearTimeout(timer);
    if (!complete) {
      controller.abort();
      // Do not wait on a misbehaving cancellation promise in a mock/adapter.
      try { (reader ? reader.cancel() : response?.body?.cancel())?.catch(() => {}); } catch {}
    }
    try { reader?.releaseLock(); } catch {}
  }
}
module.exports = { readBoundedVideoCandidate };
