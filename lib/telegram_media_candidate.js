/* Candidate bounded Storage reader only. Not used by production paths.
 * Fetches from the configured Supabase origin, never from a URL supplied by a user.
 * An MP4 header or MIME type is NOT evidence that video or audio can be decoded.
 */
const {MAX_VIDEO_BYTES} = require('./telegram_candidate');
const uuid=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
function makeStorageReader({supabaseUrl, serviceKey, fetchImpl = fetch, maxBytes = MAX_VIDEO_BYTES}) {
  let base;
  try { base = new URL(supabaseUrl); } catch { throw new Error('Invalid Storage configuration'); }
  if (base.protocol !== 'https:' || base.username || base.password || base.pathname !== '/' || base.search || base.hash || typeof serviceKey !== 'string' || !serviceKey || !Number.isSafeInteger(maxBytes) || maxBytes < 12 || maxBytes > MAX_VIDEO_BYTES) throw new Error('Invalid Storage configuration');
  return async ({userId, videoPath}) => {
    if (typeof userId !== 'string' || !uuid.test(userId) || typeof videoPath !== 'string' || videoPath.length > 500) throw new Error('Invalid video path');
    const parts=videoPath.split('/');
    if (parts.length < 2 || parts[0] !== userId || parts.some(p=>!p || p === '.' || p === '..' || !/^[A-Za-z0-9_.-]+$/.test(p))) throw new Error('Invalid video path');
    const url=base.origin+'/storage/v1/object/authenticated/reels/'+parts.map(encodeURIComponent).join('/');
    let res;
    try { res=await fetchImpl(url,{method:'GET',headers:{apikey:serviceKey,Authorization:`Bearer ${serviceKey}`},redirect:'error',signal:AbortSignal.timeout(45000)}); }
    catch { throw new Error('Unable to read video'); }
    if (!res?.ok || !res.body || typeof res.body.getReader !== 'function') throw new Error('Unable to read video');
    const length=res.headers?.get('content-length');
    if (length !== null && length !== undefined && (!/^\d+$/.test(length) || !Number.isSafeInteger(Number(length)) || Number(length) > maxBytes)) {
      await res.body.cancel().catch(()=>{}); throw new Error('Video exceeds size limit');
    }
    const reader=res.body.getReader(),chunks=[];let total=0;
    try {
      for (;;) {
        const {done,value}=await reader.read();
        if (done) break;
        if (!(value instanceof Uint8Array)) throw new Error('Invalid video data');
        total+=value.byteLength;
        if (total>maxBytes) throw new Error('Video exceeds size limit');
        chunks.push(Buffer.from(value));
      }
      if (length !== null && length !== undefined && Number(length) !== total) throw new Error('Incomplete video');
      if (total < 12) throw new Error('Invalid video');
      return Buffer.concat(chunks,total);
    } catch { await reader.cancel().catch(()=>{}); throw new Error('Unable to read complete video'); }
    finally { reader.releaseLock(); }
  };
}
module.exports={makeStorageReader};
