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
  console.log('NOTIFY:', title, '-', body);
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
  }, res => console.log('ntfy response:', res.statusCode));
  req.on('error', e => console.error('ntfy error:', e.message));
  req.write(data);
  req.end();
}

function fetchMessages(lastId) {
  return new Promise((resolve, reject) => {
    const path = `/api/v9/channels/${CHANNEL_ID}/messages?limit=10` + (lastId ? `&after=${lastId}` : '');
    const req = https.request({
      hostname: 'discord.com',
      port: 443,
      path: path,
      method: 'GET',
      headers: {
        'Authorization': TOKEN,
        'User-Agent': 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15',
        'X-Super-Properties': Buffer.from(JSON.stringify({os:'iOS',browser:'Discord iOS',device:'iPhone'})).toString('base64'),
        'Content-Type': 'application/json'
      }
    }, res => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        console.log('Discord API status:', res.statusCode);
        if (res.statusCode === 200) {
          try { resolve(JSON.parse(data)); }
          catch(e) { reject(e); }
        } else {
          console.log('Discord response:', data.slice(0, 200));
          reject(new Error('Status ' + res.statusCode));
        }
      });
    });
    req.on('error', reject);
    req.end();
  });
}

let lastMessageId = null;
let initialized = false;

async function poll() {
  try {
    const messages = await fetchMessages(lastMessageId);
    
    if (!Array.isArray(messages)) {
      console.log('Unexpected response:', JSON.stringify(messages).slice(0, 100));
      return;
    }

    if (!initialized) {
      // On first run, just store the latest message ID without alerting
      if (messages.length > 0) {
        lastMessageId = messages[0].id;
        console.log('Initialized. Last message ID:', lastMessageId);
      } else {
        console.log('No messages found in channel');
      }
      initialized = true;
      return;
    }

    // New messages come first in the array when using &after=
    const newMessages = messages.reverse(); // oldest first
    
    for (const m of newMessages) {
      if (!lastMessageId || m.id > lastMessageId) {
        lastMessageId = m.id;
        const content = m.content || '';
        const author = m.author ? (m.author.global_name || m.author.username || '?') : '?';
        console.log('New message from', author, ':', content.slice(0, 50));

        if (detectNumber(content)) {
          sendNotification('Number detected', author + ': ' + content.slice(0, 100));
        } else if (detectAfk(content)) {
          sendNotification('AFK check', author + ': ' + content.slice(0, 100));
        }
      }
    }
  } catch(e) {
    console.error('Poll error:', e.message);
  }
}

// Poll every 3 seconds
console.log('Starting polling bot for channel', CHANNEL_ID);
poll();
setInterval(poll, 3000);

// Keep-alive
if (RENDER_URL) {
  setInterval(() => {
    https.get(RENDER_URL, res => console.log('Keep-alive:', res.statusCode))
      .on('error', e => console.error('Keep-alive error:', e.message));
  }, 10 * 60 * 1000);
}

// HTTP server required by Render
http.createServer((req, res) => res.end('Aqua Bot running')).listen(process.env.PORT || 3000, () => {
  console.log('HTTP server running');
});
