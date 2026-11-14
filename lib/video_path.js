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

function encodeVideoPath(value) {
  return normalizeVideoPath(value).split('/').map(encodeURIComponent).join('/');
}

module.exports = { normalizeVideoPath, encodeVideoPath };
