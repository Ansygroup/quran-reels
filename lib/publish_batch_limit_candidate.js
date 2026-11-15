/* CANDIDATE ONLY: local experiments. Not used by the app or a global limit.
 * Input is a previously confirmed draft batch. No retry or durable recovery. */
'use strict';

async function publishBatchLimitCandidate(targets, { limit, publish } = {}) {
  if (!Array.isArray(targets) || !Number.isSafeInteger(limit) || limit < 1 || typeof publish !== 'function') throw new Error('invalid candidate batch');
  const ids = new Set(), keys = new Set(); let owner = null;
  const entries = targets.map(item => {
    const r = item?.row, c = item?.connection_id;
    if (!item || typeof item.platform !== 'string' || !item.platform ||
        !Object.prototype.hasOwnProperty.call(item, 'connection_id') ||
        !(c === null || (typeof c === 'string' && c)) ||
        !r || typeof r.id !== 'string' || !r.id || typeof r.user_id !== 'string' || !r.user_id ||
        r.status !== 'draft' || r.platform !== item.platform ||
        !Object.prototype.hasOwnProperty.call(r, 'connection_id') || r.connection_id !== c) throw new Error('invalid candidate target');
    const key = JSON.stringify([item.platform, c]);
    if (ids.has(r.id) || keys.has(key) || (owner !== null && owner !== r.user_id)) throw new Error('invalid candidate target');
    ids.add(r.id); keys.add(key); owner = r.user_id;
    return { platform: item.platform, connection_id: c, row: { ...r } };
  });
  const results = new Array(entries.length); let next = 0;
  async function worker() {
    for (;;) {
      const index = next++;
      if (index >= entries.length) return;
      const item = entries[index];
      try {
        const out = await publish(item.row);
        if (out?.ok !== true || typeof out.url !== 'string' || !out.url.trim()) throw new Error(`${item.platform}: ${out?.error || 'تعذّر تأكيد نتيجة النشر'}`);
        results[index] = { status: 'fulfilled', value: { platform: item.platform, connection_id: item.connection_id, url: out.url } };
      } catch (reason) { results[index] = { status: 'rejected', reason }; }
    }
  }
  await Promise.all(Array.from({ length: Math.min(limit, entries.length) }, () => worker()));
  const rejected = results.filter(r => r.status === 'rejected');
  return { results, failed: rejected.length, urls: results.filter(r => r.status === 'fulfilled').map(r => r.value.url).filter(Boolean),
    why: rejected.map(r => String(r.reason?.message || r.reason)).join('; ') };
}
module.exports = { publishBatchLimitCandidate };
