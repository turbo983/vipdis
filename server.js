const http = require('http'), fs = require('fs'), path = require('path'), os = require('os');
const { WebSocketServer } = require('ws');

const FILE = path.join(__dirname, 'data.json');
let db;
try { db = JSON.parse(fs.readFileSync(FILE, 'utf8')); }
catch { db = { servers: [{ id: 's1', name: 'Home', channels: [{ id: 'c1', name: 'general' }, { id: 'c2', name: 'random' }] }], messages: {} }; }

let timer;
const save = () => { clearTimeout(timer); timer = setTimeout(() => fs.writeFile(FILE, JSON.stringify(db), () => {}), 500); };
const uid = () => Math.random().toString(36).slice(2, 10);
const clean = (s, n) => String(s || '').trim().slice(0, n);
const hasChannel = (c) => db.servers.some(s => s.channels.some(x => x.id === c));

const server = http.createServer((req, res) => {
  fs.readFile(path.join(__dirname, 'index.html'), (e, d) => {
    res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
    res.end(d);
  });
});
const wss = new WebSocketServer({ server });
const send = (ws, o) => ws.readyState === 1 && ws.send(JSON.stringify(o));
const all = (o) => wss.clients.forEach(c => c.user && send(c, o));
const online = () => [...new Set([...wss.clients].filter(c => c.user).map(c => c.user))];

wss.on('connection', (ws) => {
  ws.on('message', (raw) => {
    let m; try { m = JSON.parse(raw); } catch { return; }
    if (m.t === 'hello') {
      ws.user = clean(m.user, 20) || 'guest';
      send(ws, { t: 'servers', servers: db.servers });
      all({ t: 'online', users: online() });
    } else if (!ws.user) {
      return;
    } else if (m.t === 'open') {
      send(ws, { t: 'history', ch: m.ch, msgs: (db.messages[m.ch] || []).slice(-100) });
    } else if (m.t === 'msg') {
      const text = clean(m.text, 2000);
      if (!text || !hasChannel(m.ch)) return;
      const msg = { id: uid(), user: ws.user, text, time: Date.now() };
      (db.messages[m.ch] = db.messages[m.ch] || []).push(msg);
      if (db.messages[m.ch].length > 1000) db.messages[m.ch].shift();
      save(); all({ t: 'msg', ch: m.ch, msg });
    } else if (m.t === 'newServer') {
      const name = clean(m.name, 30); if (!name) return;
      db.servers.push({ id: uid(), name, channels: [{ id: uid(), name: 'general' }] });
      save(); all({ t: 'servers', servers: db.servers });
    } else if (m.t === 'newChannel') {
      const s = db.servers.find(x => x.id === m.server);
      const name = clean(m.name, 30).toLowerCase().replace(/\s+/g, '-');
      if (!s || !name) return;
      s.channels.push({ id: uid(), name });
      save(); all({ t: 'servers', servers: db.servers });
    }
  });
  ws.on('close', () => all({ t: 'online', users: online() }));
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log('\nVIP Chat is running!');
  console.log('  On this PC:        http://localhost:' + PORT);
  for (const list of Object.values(os.networkInterfaces()))
    for (const i of list) if (i.family === 'IPv4' && !i.internal) console.log('  Friends on same Wi-Fi: http://' + i.address + ':' + PORT);
  console.log('');
});
