// Mathfall server: static files, the school question bank, and the Socket.IO game.
const path = require('path');
const fs = require('fs');
const http = require('http');
const express = require('express');
const { Server } = require('socket.io');
const QRCode = require('qrcode');
const { attach, sessions } = require('./server/session');
const { normaliseSet } = require('./server/questions');
const G = require('./shared/generators');
const qimages = require('./server/qimages');

const PORT = process.env.PORT || 3000;
const app = express();
const server = http.createServer(app);
const io = new Server(server, { pingInterval: 10000, pingTimeout: 20000, maxHttpBufferSize: 12e6 });

// ---- School question bank: every .json file in /banks ----
function loadBanks() {
  const dir = path.join(__dirname, 'banks');
  const banks = new Map();
  if (!fs.existsSync(dir)) return banks;
  for (const f of fs.readdirSync(dir).filter(f => f.endsWith('.json')).sort()) {
    try {
      const raw = JSON.parse(fs.readFileSync(path.join(dir, f), 'utf8'));
      const id = raw.id || f.replace(/\.json$/, '');
      const set = normaliseSet(raw);
      if (!set.main.length && !set.modified.length) continue;
      banks.set(id, { ...raw, id, title: set.title, questions: raw.questions, modified: raw.modified || [], _meta: { year: raw.year || null, topic: raw.topic || '', description: raw.description || '', main: set.main.length, modified: set.modified.length, file: f } });
    } catch (e) { console.warn('Skipping bank file', f, e.message); }
  }
  return banks;
}
const banks = loadBanks();
console.log(`Loaded ${banks.size} question set(s) from the school bank.`);

app.disable('x-powered-by');
// Optional hand-made art: an empty manifest means "use the built-in art".
app.get('/art/manifest.json', (req, res) => {
  const f = path.join(__dirname, 'public', 'art', 'manifest.json');
  res.setHeader('Cache-Control', 'no-cache');
  if (fs.existsSync(f)) return res.sendFile(f);
  res.json({});
});
// Game code revalidates on every load (so a redeploy reaches students straight away);
// fonts and KaTeX never change, so browsers keep them for a week.
app.use('/fonts', express.static(path.join(__dirname, 'public', 'fonts'), { maxAge: '7d' }));
app.use('/vendor', express.static(path.join(__dirname, 'public', 'vendor'), { maxAge: '7d' }));
// "no-cache" makes every browser (iPad Safari included) check with the server before reusing a file, and the pages
// below stamp their script/style links with this deploy's id, so an open tab can't keep running last week's code.
const BUILD = (process.env.RENDER_GIT_COMMIT || String(Date.now())).slice(0, 10);
const fresh = { maxAge: 0, setHeaders: res => res.setHeader('Cache-Control', 'no-cache') };
function stamped(file) {
  return (req, res) => {
    const html = fs.readFileSync(path.join(__dirname, 'public', file), 'utf8')
      .replace(/(src|href)="(\/(?:js|css|shared)\/[^"?]+\.(?:js|css))"/g, `$1="$2?v=${BUILD}"`);
    res.setHeader('Cache-Control', 'no-cache'); res.type('html').send(html);
  };
}
app.get(['/', '/index.html'], stamped('index.html'));
app.get(['/host', '/host.html'], stamped('host.html'));
// Question pictures: school bank pictures (banks/img) and pictures teachers uploaded with their own sets.
// Served as images only (sandboxed), so an uploaded SVG can't run script if opened directly.
const imgHeaders = res => { res.setHeader('Content-Security-Policy', "default-src 'none'; style-src 'unsafe-inline'; sandbox"); res.setHeader('X-Content-Type-Options', 'nosniff'); };
app.use('/banks/img', express.static(path.join(__dirname, 'banks', 'img'), { maxAge: '1d', setHeaders: imgHeaders }));
app.get('/qimg/:id', (req, res) => {
  const e = qimages.get(String(req.params.id));
  if (!e) return res.status(404).end();
  imgHeaders(res); res.setHeader('Cache-Control', 'public, max-age=86400, immutable');
  res.type(e.type).send(e.buf);
});
app.use('/shared', express.static(path.join(__dirname, 'shared'), fresh));
app.use(express.static(path.join(__dirname, 'public'), { ...fresh, extensions: ['html'] }));

app.get('/api/bank', (req, res) => {
  res.json({
    sets: [...banks.values()].map(b => ({ id: b.id, title: b.title, ...b._meta })),
    topics: G.list()
  });
});
app.get('/api/bank/:id', (req, res) => {
  const b = banks.get(req.params.id);
  if (!b) return res.status(404).json({ error: 'not found' });
  res.json({ id: b.id, title: b.title, questions: b.questions, modified: b.modified });
});
app.get('/api/qr', async (req, res) => {
  const text = String(req.query.text || '').slice(0, 300);
  if (!text) return res.status(400).end();
  try {
    const svg = await QRCode.toString(text, { type: 'svg', margin: 1, color: { dark: '#0d0b14', light: '#ffffff' } });
    res.type('image/svg+xml').send(svg);
  } catch (e) { res.status(500).end(); }
});
// Session report for the teacher (how the game ran): only with that game's host token.
app.get('/api/report/:code', (req, res) => {
  const s = sessions.get(String(req.params.code));
  if (!s || !req.query.k || req.query.k !== s.hostToken) return res.status(404).json({ error: 'No game with that code is still on the server.' });
  const stamp = new Date().toISOString().slice(0, 16).replace(/[:T]/g, '-');
  res.setHeader('Content-Disposition', `attachment; filename="mathfall-session-${stamp}.json"`);
  res.setHeader('Cache-Control', 'no-store');
  res.type('application/json').send(JSON.stringify(s.tel.report(), null, 1));
});
app.get('/healthz', (req, res) => res.json({ ok: true, games: sessions.size }));

attach(io, banks);

server.listen(PORT, () => {
  console.log(`Mathfall running on http://localhost:${PORT}  (teacher: /host)`);
});
