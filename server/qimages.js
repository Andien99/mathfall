// Pictures attached to questions.
// A question's `image` can be:
//   - a path inside the banks folder, e.g. "img/y10-probability/venn-1.svg" (school bank sets),
//   - an absolute path on this site ("/banks/img/...") or an https:// link,
//   - a data: URI (a picture a teacher uploaded in the editor; saved in their browser with the set).
// Data URIs are stored here once, keyed by a hash, and sent to students as a short /qimg/<id> link,
// so the picture isn't re-sent with every question.
const crypto = require('crypto');

const MAX_BYTES = 1.5 * 1024 * 1024;        // one picture
const MAX_TOTAL = 120 * 1024 * 1024;        // everything kept in memory
const TYPES = { 'image/png': 'png', 'image/jpeg': 'jpg', 'image/gif': 'gif', 'image/webp': 'webp', 'image/svg+xml': 'svg' };
const store = new Map();                    // id -> { buf, type, used }
let total = 0;

function putDataUri(uri) {
  const m = /^data:(image\/(?:png|jpeg|gif|webp|svg\+xml));base64,([A-Za-z0-9+/=\s]+)$/.exec(uri);
  if (!m) return '';
  const buf = Buffer.from(m[2], 'base64');
  if (!buf.length || buf.length > MAX_BYTES) return '';
  const id = crypto.createHash('sha1').update(buf).digest('hex').slice(0, 20) + '.' + TYPES[m[1]];
  const have = store.get(id);
  if (have) { have.used = Date.now(); return '/qimg/' + id; }
  store.set(id, { buf, type: m[1], used: Date.now() });
  total += buf.length;
  // Over budget: drop the pictures nobody has used for longest.
  if (total > MAX_TOTAL) {
    const old = [...store.entries()].sort((a, b) => a[1].used - b[1].used);
    for (const [k, v] of old) { if (total <= MAX_TOTAL * 0.8) break; if (k === id) continue; store.delete(k); total -= v.buf.length; }
  }
  return '/qimg/' + id;
}

// Returns a link a browser can load, or '' if the value isn't a usable picture.
function resolveImage(v) {
  if (typeof v !== 'string') return '';
  v = v.trim();
  if (!v) return '';
  if (v.startsWith('data:')) return putDataUri(v);
  if (/^https:\/\/[^\s"'<>]+$/i.test(v)) return v.slice(0, 600);
  if (/^\/(banks|qimg)\/[\w\-./]+$/.test(v) && !v.includes('..')) return v;
  if (/^[\w\-]+(\/[\w\-.]+)*\.(png|jpe?g|gif|webp|svg)$/i.test(v) && !v.includes('..')) return '/banks/' + v;
  return '';
}

function get(id) { const e = store.get(id); if (e) e.used = Date.now(); return e || null; }

module.exports = { resolveImage, get };
