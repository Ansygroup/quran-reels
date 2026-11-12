/* JPEGs are normalized in the browser. Server checks are deliberately repeated
 * on every read; header checks are not a substitute for an image decoder. */
const MAX_BYTES = 512 * 1024;
const MAX_DIMENSION = 1600;
const MAX_PIXELS = 2560000;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
const PREFIX = 'data:image/jpeg;base64,';
function validId(id) { return typeof id === 'string' && UUID.test(id); }
function validateImage(data) {
  if (typeof data !== 'string' || !data.startsWith(PREFIX)) throw new Error('اختار صورة JPEG أو PNG صالحة');
  const encoded = data.slice(PREFIX.length);
  if (!encoded || encoded.length > Math.ceil(MAX_BYTES / 3) * 4 || encoded.length % 4 !== 0 || !/^[A-Za-z0-9+/]*={0,2}$/.test(encoded)) throw new Error('حجم الصورة أو بياناتها غير صالحة');
  const buf = Buffer.from(encoded, 'base64');
  if (buf.toString('base64') !== encoded || buf.length > MAX_BYTES || buf.length < 10 || buf[0] !== 0xff || buf[1] !== 0xd8 || buf[buf.length-2] !== 0xff || buf[buf.length-1] !== 0xd9) throw new Error('صورة JPEG غير صالحة');
  let i = 2, width = 0, height = 0;
  while (i + 3 < buf.length) {
    if (buf[i++] !== 0xff) break;
    while (buf[i] === 0xff) i++;
    const marker = buf[i++];
    if (marker === 0xda || marker === 0xd9) break;
    if (marker === 0x01 || (marker >= 0xd0 && marker <= 0xd7)) continue;
    if (i + 2 > buf.length) break;
    const n = buf.readUInt16BE(i);
    if (n < 2 || i + n > buf.length) break;
    if ([0xc0,0xc1,0xc2,0xc3,0xc5,0xc6,0xc7,0xc9,0xca,0xcb,0xcd,0xce,0xcf].includes(marker)) {
      if (n < 8) break;
      height = buf.readUInt16BE(i+3); width = buf.readUInt16BE(i+5); break;
    }
    i += n;
  }
  if (!width || !height || width > MAX_DIMENSION || height > MAX_DIMENSION || width * height > MAX_PIXELS) throw new Error('أبعاد الصورة غير صالحة');
  return encoded;
}
async function loadBackground(rest, uid, id) {
  if (!validId(uid) || !validId(id)) throw new Error('معرّف الصورة غير صالح');
  const rows = await rest(`/rest/v1/private_autopilot_backgrounds?user_id=eq.${encodeURIComponent(uid)}&image_id=eq.${encodeURIComponent(id)}&select=jpeg_base64&limit=1`);
  if (!Array.isArray(rows) || rows.length !== 1 || typeof rows[0].jpeg_base64 !== 'string') throw new Error('الصورة الخاصة غير متاحة أو تغيّرت — لم يُنشر الفيديو');
  const data = PREFIX + rows[0].jpeg_base64;
  validateImage(data);
  return data;
}
module.exports = { MAX_BYTES, MAX_DIMENSION, MAX_PIXELS, PREFIX, validId, validateImage, loadBackground };
