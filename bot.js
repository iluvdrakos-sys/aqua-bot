const WebSocket = require('ws');
const https = require('https');

// ── Config from environment variables ──
const TOKEN = process.env.DISCORD_TOKEN;
const CHANNEL_ID = process.env.DISCORD_CHANNEL_ID;
const NTFY_TOPIC = process.env.NTFY_TOPIC; // e.g. "aqua-lurker-abc123"

if (!TOKEN || !CHANNEL_ID || !NTFY_TOPIC) {
  console.error('Missing env vars: DISCORD_TOKEN, DISCORD_CHANNEL_ID, NTFY_TOPIC');
  process.exit(1);
}

// ── Number detection (matches Aqua Lurker) ──
const NUMBER_WORDS = /\b(zero|one|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve|thirteen|fourteen|fifteen|sixteen|seventeen|eighteen|nineteen|twenty|thirty|forty|fifty|sixty|seventy|eighty|ninety|hundred|thousand)\b/i;
const AFK_TRIGGERS = ['afk', 'brb', 'be right back', 'away from keyboard', 'stepping out', 'taking a break'];

function detectNumber(content) {
  if (!content) return false;
  // Plain digits
  if (/\d+/.test(content)) return true;
  // Number words
  if (NUMBER_WORDS.test(content)) return true;
  // Roman numerals
  if (/\b(I{1,3}|IV|VI{0,3}|IX|XI{0,3}|XIV|XV|XVI{0,3}|XIX|XX)\b/.test(content)) return true;
  // Hex
  if (/\b0x[0-9a-f]+\b/i.test(content)) return true;
  // Binary
  if (/\b[01]{4,}\b/.test(content)) return true;
  return false;
}

function detectAfk(content) {
  if (!content) return false;
  const lc = content.toLowerCase();
  return AFK_TRIGGERS.some(t => lc.includes(t));
}

// ── Send push notification via ntfy.sh ──
function sendNotification(title, body) {
  console.log(`NOTIFY: ${title} — ${body}`);
  const data = Buffer.from(body);
  const options = {
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
  };
  const req = https.request(options, res => {
    console.log('ntfy status:', res.statusCode);
  });
  req.on('error', e => console.error('ntfy error:', e.message));
  req.write(data);
  req.end();
}

// ── Discord Gateway ──
let ws, heartbeatInterval, sequence = null, sessionId = null, resumeUrl = null;

function connect(url) {
  url = url || 'wss://gateway.discord.gg/?v=10&encoding=json';
  console.log('Connecting to', url);
  ws = new WebSocket(url);

  ws.on('open', () => console.log('Gateway connected'));

  ws.on('message', raw => {
    const msg = JSON.parse(raw);
    const { op, d, t, s } = msg;
    if (s) sequence = s;

    if (op === 10) {
      // Hello — start heartbeat
      const interval = d.heartbeat_interval;
      heartbeatInterval = setInterval(() => {
        ws.send(JSON.stringify({ op: 1, d: sequence }));
      }, interval);
      // Identify
      ws.send(JSON.stringify({
        op: 2,
        d: {
          token: TOKEN,
          intents: 512, // GUILD_MESSAGES
          properties: { os: 'linux', browser: 'aqua-bot', device: 'aqua-bot' }
        }
      }));
    }

    if (op === 7) { reconnect(); }
    if (op === 9) { setTimeout(identify, 2000); }

    if (op === 0) {
      if (t === 'READY') {
        sessionId = d.session_id;
        resumeUrl = d.resume_gateway_url;
        console.log('Ready! Watching channel', CHANNEL_ID);
      }

      if (t === 'MESSAGE_CREATE') {
        const m = d;
        if (m.channel_id !== CHANNEL_ID) return;
        if (m.author && m.author.bot) return;

        const content = m.content || '';
        const author = m.author ? (m.author.global_name || m.author.username || '?') : '?';

        const isNumber = detectNumber(content);
        const isAfk = detectAfk(content);

        if (isNumber) {
          sendNotification('Number detected', author + ': ' + content.slice(0, 100));
        } else if (isAfk) {
          sendNotification('AFK check', author + ': ' + content.slice(0, 100));
        }
      }
    }
  });

  ws.on('close', (code) => {
    console.log('Disconnected, code:', code);
    clearInterval(heartbeatInterval);
    setTimeout(() => reconnect(), 5000);
  });

  ws.on('error', e => console.error('WS error:', e.message));
}

function identify() {
  ws.send(JSON.stringify({
    op: 2,
    d: {
      token: TOKEN,
      intents: 512,
      properties: { os: 'linux', browser: 'aqua-bot', device: 'aqua-bot' }
    }
  }));
}

function reconnect() {
  clearInterval(heartbeatInterval);
  if (resumeUrl && sessionId) {
    connect(resumeUrl + '?v=10&encoding=json');
  } else {
    connect();
  }
}

// ── Keep-alive ping (stops Render from sleeping) ──
const RENDER_URL = process.env.RENDER_URL; // e.g. https://aqua-bot.onrender.com
if (RENDER_URL) {
  setInterval(() => {
    https.get(RENDER_URL, res => console.log('Keep-alive ping:', res.statusCode))
      .on('error', e => console.error('Keep-alive error:', e.message));
  }, 10 * 60 * 1000); // every 10 minutes
}

// ── Simple HTTP server (required by Render) ──
const http = require('http');
http.createServer((req, res) => res.end('Aqua Bot running')).listen(process.env.PORT || 3000);

connect();
