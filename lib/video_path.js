/* Treat video_path as a storage object key, never as a URL fragment. */
'use strict';

function normalizeVideoPath(value) {
  const invalid = () => new Error('مسار ملف الفيديو غير صالح — راجع المهمة قبل إعادة النشر');
  if (typeof value !== 'string') throw invalid();
  const path = value.replace(/^\/+/, '');
  // Percent escapes and backslashes may be decoded/normalized differently by
  // proxies; forbid ambiguity rather than risk resolving a different object.
  if (!path || /[\x00-\x1f\x7f%\\]/.test(path)) throw invalid();
  const parts = path.split('/');
  if (parts.some(part => !part || part === '.' || part === '..')) throw invalid();
  try { parts.forEach(encodeURIComponent); } catch { throw invalid(); }
  return path;
}

// Restrict new manually submitted keys to the session's exact first segment.
// This is a naming boundary, not a storage ownership/existence check. Existing
// queue rows and direct database writers require separate review and controls.
function normalizeManualVideoPath(value, userId) {
  const path = normalizeVideoPath(value);
  if (typeof userId !== 'string' || !userId || userId.includes('/') || !path.startsWith(userId + '/')) {
    throw new Error('مسار الفيديو خارج نطاق الحساب — لم تُنشأ المهمة');
  }
  return path;
}

function encodeVideoPath(value) {
  return normalizeVideoPath(value).split('/').map(encodeURIComponent).join('/');
}

module.exports = { normalizeVideoPath, normalizeManualVideoPath, encodeVideoPath };
