// Klein lokaal servertje: serveert de app en bewaart je voortgang in opslag/voortgang.json.
// Elke dag komt er een kopie bij in opslag/backups/ (de laatste 60 dagen blijven bewaard).
// Alleen bereikbaar vanaf deze laptop (127.0.0.1). Blijft draaien tot je de laptop uitzet (gebruikt vrijwel niets).
'use strict';
const http = require('http');
const fs = require('fs');
const path = require('path');

const PORT = 8790;
const HOST = '127.0.0.1';
const ROOT = __dirname;
const DIR = path.join(ROOT, 'opslag');
const FILE = path.join(DIR, 'voortgang.json');
const BACKUPS = path.join(DIR, 'backups');
const KEEP_DAYS = 60;
const ORIGINS = [`http://${HOST}:${PORT}`, `http://localhost:${PORT}`];

fs.mkdirSync(BACKUPS, { recursive: true });

const TYPES = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8', '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml', '.png': 'image/png', '.ico': 'image/x-icon', '.webmanifest': 'application/manifest+json',
};


function localDate() {
  const d = new Date();
  return new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 10);
}

function writeAtomic(file, text) {
  const tmp = file + '.tmp';
  fs.writeFileSync(tmp, text, 'utf8');
  fs.renameSync(tmp, file);
}

function saveData(text) {
  writeAtomic(FILE, text);
  writeAtomic(path.join(BACKUPS, `voortgang-${localDate()}.json`), text);
  const old = fs.readdirSync(BACKUPS).filter(f => /^voortgang-\d{4}-\d{2}-\d{2}\.json$/.test(f)).sort();
  for (const f of old.slice(0, Math.max(0, old.length - KEEP_DAYS))) fs.unlinkSync(path.join(BACKUPS, f));
}

function send(res, code, body, type) {
  res.writeHead(code, { 'Content-Type': type || 'text/plain; charset=utf-8', 'Cache-Control': 'no-store' });
  res.end(body);
}

const server = http.createServer((req, res) => {
  const url = new URL(req.url, `http://${HOST}:${PORT}`);

  if (url.pathname === '/api/ping') return send(res, 200, 'ok');

  if (url.pathname === '/api/data') {
    if (req.method === 'GET') {
      if (!fs.existsSync(FILE)) return send(res, 200, 'null', TYPES['.json']);
      return send(res, 200, fs.readFileSync(FILE, 'utf8'), TYPES['.json']);
    }
    if (req.method === 'PUT' || req.method === 'POST') {
      // alleen de app zelf mag opslaan, geen andere websites
      const origin = req.headers.origin;
      if (origin && !ORIGINS.includes(origin)) return send(res, 403, 'forbidden');
      if (!String(req.headers['content-type'] || '').startsWith('application/json')) return send(res, 415, 'json only');
      const chunks = []; let size = 0;
      req.on('data', c => { size += c.length; if (size > 20e6) req.destroy(); else chunks.push(c); });
      req.on('end', () => {
        const text = Buffer.concat(chunks).toString('utf8');
        try {
          const obj = JSON.parse(text);
          if (!obj || typeof obj !== 'object' || !obj.cards) return send(res, 400, 'bad data');
          saveData(text);
          send(res, 200, 'saved');
        } catch (e) { send(res, 400, 'bad json'); }
      });
      return;
    }
    return send(res, 405, 'method not allowed');
  }

  if (req.method !== 'GET') return send(res, 405, 'method not allowed');
  let rel = decodeURIComponent(url.pathname);
  if (rel === '/') rel = '/index.html';
  const file = path.normalize(path.join(ROOT, rel));
  if (!file.startsWith(ROOT + path.sep) || file.startsWith(DIR)) return send(res, 404, 'not found');
  fs.readFile(file, (err, buf) => {
    if (err) return send(res, 404, 'not found');
    send(res, 200, buf, TYPES[path.extname(file).toLowerCase()] || 'application/octet-stream');
  });
});

server.on('error', e => { console.error(e.message); process.exit(1); });
server.listen(PORT, HOST, () => console.log(`Spaanstool draait op http://${HOST}:${PORT}/`));
