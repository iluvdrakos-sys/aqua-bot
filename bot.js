const WebSocket = require('ws');
const https = require('https');
const http = require('http');

const TOKEN = process.env.DISCORD_TOKEN;
const CHANNEL_ID = process.env.DISCORD_CHANNEL_ID;
const NTFY_TOPIC = process.env.NTFY_TOPIC;
const RENDER_URL = process.env.RENDER_URL;

if (!TOKEN || !CHANNEL_ID || !NTFY_TOPIC) {
  console.error('Missing env vars');
  process.exit(1);
}

const NUMBER_WORDS = /\b(zero|one|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve|thirteen|fourteen|fifteen|sixteen|seventeen|eighteen|nineteen|twenty|thirty|forty|fifty|sixty|seventy|eighty|ninety|hundred|thousand)\b/i;
const AFK_TRIGGERS = ['afk', 'brb', 'be right back', 'away from keyboard', 'stepping out', 'taking a break'];

function detectNumber(content) {
  if (!content) return false;
  if (/\d+/.test(content)) return true;
  if (NUMBER_WORDS.test(content)) return true;
  if (/\b(I{1,3}|IV|VI{0,3}|IX|XI{0,3}|XIV|XV|XVI{0,3}|XIX|XX)\b/.test(content)) return true;
  return false;
}

function detectAfk(content) {
  if (!content) return false;
  const lc = content.toLowerCase();
  return AFK_TRIGGERS.some(t => lc.includes(t));
}

function sendNotification(title, body) {
  console.log('NOTIFY:', title, '—', body);
  const data = Buffer.from(body);
  const req = https.request({
    hostname: 'ntfy.sh',
    port: 443,
    path: '/' + NTFY_TOPIC,
    method: 'POST',
    headers: {
      'Title': title,
      'Content-Type': 'text/plain',
      'Content-Length': data.length,
      'Priority': 'high',
      'Tags': 'bell'
    }
  }, res => console.log('ntfy:', res.statusCode));
  req.on('error', e => console.error('ntfy error:', e.message));
  req.write(data);
  req.end();
}

let ws, heartbeatInterval, sequence = null, sessionId = null, resumeUrl = null;

function connect(url) {
  url = url || 'wss://gateway.discord.gg/?v=10&encoding=json';
  console.log('Connecting...');
  ws = new WebSocket(url, { headers: { 'User-Agent': 'Mozilla/5.0' } });

  ws.on('open', () => console.log('WS open'));

  ws.on('message', raw => {
    let msg;
    try { msg = JSON.parse(raw); } catch(e) { return; }
    const { op, d, t, s } = msg;
    if (s) sequence = s;

    if (op === 10) {
      // Heartbeat
      clearInterval(heartbeatInterval);
      heartbeatInterval = setInterval(() => {
        if (ws.readyState === WebSocket.OPEN) {
          ws.send(JSON.stringify({ op: 1, d: sequence }));
          console.log('Heartbeat sent');
        }
      }, d.heartbeat_interval);

      // Identify with user token (intents: 0 for user accounts)
      ws.send(JSON.stringify({
        op: 2,
        d: {
          token: TOKEN,
          intents: 0,
          properties: {
            os: 'ios',
            browser: 'Discord iOS',
            device: ''
          },
          presence: {
            status: 'online',
            since: 0,
            activities: [],
            afk: false
          }
        }
      }));
    }

    if (op === 11) console.log('Heartbeat ACK');
    if (op === 7) { console.log('Reconnect requested'); reconnect(); }
    if (op === 9) { console.log('Invalid session'); setTimeout(() => connect(), 3000); }

    if (op === 0) {
      if (t === 'READY') {
        sessionId = d.session_id;
        resumeUrl = d.resume_gateway_url;
        console.log('Ready! Logged in as', d.user && d.user.username);
        console.log('Watching channel', CHANNEL_ID);
      }

      if (t === 'MESSAGE_CREATE') {
        const m = d;
        console.log('Message in channel:', m.channel_id, '| content:', m.content && m.content.slice(0, 50));
        
        if (m.channel_id !== CHANNEL_ID) return;

        const content = m.content || '';
        const author = m.author ? (m.author.global_name || m.author.username || '?') : '?';

        if (detectNumber(content)) {
          sendNotification('Number detected', author + ': ' + content.slice(0, 100));
        } else if (detectAfk(content)) {
          sendNotification('AFK check', author + ': ' + content.slice(0, 100));
        }
      }
    }
  });

  ws.on('close', (code, reason) => {
    console.log('Disconnected, code:', code, reason && reason.toString());
    clearInterval(heartbeatInterval);
    setTimeout(() => reconnect(), 5000);
  });

  ws.on('error', e => console.error('WS error:', e.message));
}

function reconnect() {
  try { if (ws) ws.terminate(); } catch(e) {}
  clearInterval(heartbeatInterval);
  if (resumeUrl && sessionId) {
    const url = resumeUrl.startsWith('wss://') ? resumeUrl : 'wss://' + resumeUrl;
    connect(url + '?v=10&encoding=json');
  } else {
    connect();
  }
}

// Keep-alive
if (RENDER_URL) {
  setInterval(() => {
    const url = new URL(RENDER_URL);
    const mod = url.protocol === 'https:' ? https : http;
    mod.get(RENDER_URL, res => console.log('Keep-alive:', res.statusCode))
       .on('error', e => console.error('Keep-alive error:', e.message));
  }, 10 * 60 * 1000);
}

// HTTP server required by Render
http.createServer((req, res) => res.end('Aqua Bot running')).listen(process.env.PORT || 3000, () => {
  console.log('HTTP server up');
});

connect();
