const https = require('https');
const http = require('http');

const TOKEN = process.env.DISCORD_TOKEN;
const CHANNEL_ID = process.env.DISCORD_CHANNEL_ID;
const NTFY_TOPIC = process.env.NTFY_TOPIC;
const RENDER_URL = process.env.RENDER_URL;

if (!TOKEN || !CHANNEL_ID || !NTFY_TOPIC) { console.error('Missing env vars'); process.exit(1); }

// ═══════════ FULL AQUA LURKER DETECTION ENGINE ═══════════
const DIGITS = Object.create(null);
const bases=[0xFF10,0x0660,0x06F0,0x07C0,0x0966,0x09E6,0x0A66,0x0AE6,0x0B66,0x0BE6,0x0C66,0x0CE6,0x0D66,0x0DE6,0x0E50,0x0ED0,0x0F20,0x1040,0x17E0,0x1810,0xA8D0,0xA900,0xA9D0,0xAA50,0xABF0];
bases.forEach(b=>{for(let i=0;i<10;i++)DIGITS[String.fromCharCode(b+i)]=String(i);});
const sup='\u2070\u00B9\u00B2\u00B3\u2074\u2075\u2076\u2077\u2078\u2079';
const sub='\u2080\u2081\u2082\u2083\u2084\u2085\u2086\u2087\u2088\u2089';
for(let i=0;i<10;i++){DIGITS[sup[i]]=String(i);DIGITS[sub[i]]=String(i);}
const circ='\u2460\u2461\u2462\u2463\u2464\u2465\u2466\u2467\u2468\u2469\u246A\u246B\u246C\u246D\u246E\u246F\u2470\u2471\u2472\u2473';
for(let i=0;i<20;i++)DIGITS[circ[i]]=String(i+1);
DIGITS['\u24EA']='0';DIGITS['\u24FF']='0';
['\u2776\u2777\u2778\u2779\u277A\u277B\u277C\u277D\u277E\u277F','\u2780\u2781\u2782\u2783\u2784\u2785\u2786\u2787\u2788\u2789','\u278A\u278B\u278C\u278D\u278E\u278F\u2790\u2791\u2792\u2793'].forEach(set=>{for(let i=0;i<10;i++)DIGITS[set[i]]=String(i+1);});
for(let i=0;i<20;i++){DIGITS[String.fromCharCode(0x2474+i)]=String(i+1);DIGITS[String.fromCharCode(0x2488+i)]=String(i+1);}
for(let i=0;i<30;i++)DIGITS[String.fromCharCode(0x3251+i)]=String(i+21);
for(let i=0;i<10;i++)DIGITS[String.fromCharCode(0x24EB+i)]=String(i+11);
for(let i=0;i<10;i++)DIGITS[String.fromCharCode(0x24F5+i)]=String(i+1);
[0x1D7CE,0x1D7D8,0x1D7E2,0x1D7EC,0x1D7F6].forEach(b=>{for(let i=0;i<10;i++)DIGITS[String.fromCodePoint(b+i)]=String(i);});
[0x104A0,0x11066,0x110F0,0x11136,0x16A60,0x1E950,0x1FBF0].forEach(b=>{for(let i=0;i<10;i++)DIGITS[String.fromCodePoint(b+i)]=String(i);});
const braille='\u281A\u2801\u2803\u2809\u2819\u2811\u280B\u281B\u2813\u280A';
for(let i=0;i<10;i++)DIGITS[braille[i]]=String(i);

const WORDS_EN={zero:0,one:1,two:2,three:3,four:4,five:5,six:6,seven:7,eight:8,nine:9,ten:10,eleven:11,twelve:12,thirteen:13,fourteen:14,fifteen:15,sixteen:16,seventeen:17,eighteen:18,nineteen:19,twenty:20,thirty:30,forty:40,fourty:40,fifty:50,sixty:60,seventy:70,eighty:80,ninety:90,hundred:100,thousand:1000,million:1000000,first:1,second:2,third:3,fourth:4,fifth:5,sixth:6,seventh:7,eighth:8,ninth:9,tenth:10};
const WORDMAP=Object.create(null);
const allWords={en:WORDS_EN,es:{cero:0,uno:1,dos:2,tres:3,cuatro:4,cinco:5,seis:6,siete:7,ocho:8,nueve:9,diez:10,veinte:20,treinta:30,cuarenta:40,cincuenta:50,cien:100,mil:1000},fr:{zero:0,un:1,deux:2,trois:3,quatre:4,cinq:5,six:6,sept:7,huit:8,neuf:9,dix:10,vingt:20,trente:30,cent:100,mille:1000},de:{null:0,eins:1,zwei:2,drei:3,vier:4,funf:5,sechs:6,sieben:7,acht:8,neun:9,zehn:10,zwanzig:20,hundert:100,tausend:1000},ja:{'一':1,'二':2,'三':3,'四':4,'五':5,'六':6,'七':7,'八':8,'九':9,'十':10,'百':100,'千':1000,'零':0},zh:{'零':0,'一':1,'二':2,'两':2,'三':3,'四':4,'五':5,'六':6,'七':7,'八':8,'九':9,'十':10,'百':100,'千':1000}};
Object.keys(allWords).forEach(l=>Object.keys(allWords[l]).forEach(w=>{const k=w.toLowerCase();if(WORDMAP[k]==null)WORDMAP[k]=allWords[l][w];}));

const ROMAN_RE=/^M{0,4}(CM|CD|D?C{0,3})(XC|XL|L?X{0,3})(IX|IV|V?I{0,3})$/i;
const RVAL={I:1,V:5,X:10,L:50,C:100,D:500,M:1000};
function roman(s){let n=0;s=s.toUpperCase();for(let i=0;i<s.length;i++){const v=RVAL[s[i]],w=RVAL[s[i+1]];if(!v)return 0;n+=w>v?-v:v;}return n;}

function stripText(t){
  let s=String(t||'');
  s=s.replace(/```[\s\S]*?```/g,' ').replace(/`([^`]+)`/g,' $1 ').replace(/\*\*([\s\S]+?)\*\*/g,'$1').replace(/__([\s\S]+?)__/g,'$1').replace(/~~([\s\S]+?)~~/g,'$1').replace(/\*([\s\S]+?)\*/g,'$1').replace(/\|\|([\s\S]+?)\|\|/g,'$1').replace(/<a?:\w+:\d+>/g,' ').replace(/<@[!&]?\d+>/g,' ').replace(/<#\d+>/g,' ').replace(/[\u200B-\u200F\u202A-\u202E\u2060-\u206F\uFEFF]/g,'');
  try{s=s.normalize('NFKC');}catch(e){}
  return s.replace(/[\u0300-\u036F\u20D0-\u20FF\uFE20-\uFE2F]/g,'');
}

function normalizeDigits(t){
  let out='';
  for(let i=0;i<t.length;i++){const cp=t.codePointAt(i);if(cp>0xFFFF){const k=String.fromCodePoint(cp);out+=(DIGITS[k]!=null?DIGITS[k]:k);i++;continue;}const ch=t[i];out+=(DIGITS[ch]!=null?DIGITS[ch]:ch);}
  return out.replace(/([0-9])\uFE0F?\u20E3/g,'$1').replace(/\uD83D\uDD1F/g,'10').replace(/\uD83D\uDCAF/g,'100').replace(/:zero:/gi,'0').replace(/:one:/gi,'1').replace(/:two:/gi,'2').replace(/:three:/gi,'3').replace(/:four:/gi,'4').replace(/:five:/gi,'5').replace(/:six:/gi,'6').replace(/:seven:/gi,'7').replace(/:eight:/gi,'8').replace(/:nine:/gi,'9').replace(/:(keycap_)?ten:/gi,'10');
}

function tallyDetect(text){
  const zheng=(text.match(/正/g)||[]).length;if(zheng)return true;
  const m=String(text).match(/(?:[|｜Il1]\s*){4}[\/\\-]|(?:[|｜]\s*){3,}/g);
  if(m){let n=0;m.forEach(g=>{n+=(g.match(/[|｜Il1]/g)||[]).length;});if(n>=3)return true;}
  if((text.match(/[\u1D360-\u1D371]/g)||[]).length>0)return true;
  return false;
}

function radixDetect(text){
  if(/\b(?:0x|#)([0-9a-f]{1,8})\b/gi.test(text))return true;
  if(/\b(?:0b)?([01]{4,32})\b/gi.test(text))return true;
  return false;
}

const SYM_GLYPHS=/[│┃╻╽╿❘❙|⣿⣷⣾⡇⢸⣠⣀⢀█▐▌▊▋▍▎▏▓▒░▄▀▗▖▝▘◢◣◤◥╱╲╳╬╫╪╎╏⟩]/u;
// Obfuscated: "T w E n T y" or "xxtwentyxx"
const EN_SORTED=Object.keys(WORDS_EN).sort((a,b)=>b.length-a.length);
function obfuscatedDetect(text){
  const letters=String(text||'').toLowerCase().replace(/[^a-z]/g,'');
  if(letters.length<3||letters.length>200)return false;
  let i=0,hit=false;
  while(i<letters.length){
    let matched=false;
    for(const w of EN_SORTED){if(letters.startsWith(w,i)){i+=w.length;matched=true;hit=true;break;}}
    if(!matched){if(hit)return true;i++;}
  }
  return hit;
}

// Acrostic: first letters of words spell a number
function chainWords(s){
  s=String(s||'').toLowerCase().replace(/[^a-z]/g,'');
  if(s.length<3)return null;
  let i=0,words=[],guard=0;
  while(i<s.length){
    if(++guard>200)return null;
    let ok=false;
    for(const w of EN_SORTED){if(s.startsWith(w,i)){words.push(w);i+=w.length;ok=true;break;}}
    if(!ok)return null;
  }
  return words.filter(w=>w!=='and').length?words:null;
}
function acrosticDetect(text){
  const raw=String(text||'');
  if(!raw||raw.length>4000)return false;
  const plain=raw.replace(/```[\s\S]*?```/g,' ').replace(/https?:\/\/\S+/g,' ').replace(/<a?:\w+:\d+>/g,' ').replace(/<@[!&]?\d+>/g,' ').replace(/[*_~`|]/g,'');
  const words=plain.match(/[A-Za-z][A-Za-z''-]*/g)||[];
  if(words.length>=4&&words.length<=40){
    const firsts=words.map(w=>w[0]).join('');
    if(chainWords(firsts))return true;
  }
  return false;
}

// ASCII art ones
function asciiArtDetect(text){
  const lines=String(text||'').split(/\r?\n/);
  if(lines.length<7)return false;
  function looksLikeOne(block){
    const bins=block.map(l=>l.replace(/ /g,'0').replace(/[^ ]/g,'1'));
    const widths=bins.map(b=>b.replace(/0+$/,'').length);
    const baseW=widths[6];
    if(baseW<3)return false;
    if(widths.slice(0,6).some(w=>w>baseW))return false;
    const topIndented=bins.slice(0,3).some(b=>/^0+1/.test(b));
    const midShorter=widths.slice(3,6).every(w=>w<=baseW);
    const baseFull=bins[6].replace(/^0+/,'').length>=baseW-1;
    const allSame=widths.every(w=>w===baseW)&&bins.every(b=>!/0/.test(b.replace(/^0*/,'').replace(/0*$/,'')));
    return (topIndented&&midShorter&&baseFull)||allSame;
  }
  for(let i=0;i<=lines.length-7;i++){
    const block=lines.slice(i,i+7);
    if(block.every(l=>!l.trim()))continue;
    if(looksLikeOne(block))return true;
  }
  return false;
}

function symbolicDetect(text){
  const s=String(text||'');
  const fullRe=/^(?:[│┃╻╽╿❘❙|⣿⣷⣾⡇⢸⣠⣀⢀█▐▌▊▋▍▎▏▓▒░▄▀▗▖▝▘◢◣◤◥╱╲╳╬╫╪╎╏⟩])+$/u;
  if(fullRe.test(s.trim()))return true;
  return false;
}

const AFK_TRIGGERS=['afk check','afk-check','activity check','say ','type ','respond','react ','are you here','you there','prove you','alive check','check '];
const RECITE_RE=/\b(recite|repeat after me|say this|copy this)\b/i;

function detect(content){
  if(!content)return{hit:false,kinds:[]};
  const kinds=[];
  const stripped=stripText(content);
  const normalized=normalizeDigits(stripped);

  // Plain digits / unicode digits
  if(/-?\d+(?:[.,]\d+)?/.test(normalized))kinds.push('digits');

  // Number words (multi-language)
  const lower=normalized.toLowerCase();
  const tokens=lower.split(/[^a-z\u00C0-\u024F\u0400-\u04FF\u0600-\u06FF\u3040-\u9FFF\-]+/i).filter(Boolean);
  let wordHit=false;
  tokens.forEach(w=>{if(WORDMAP[w]!=null)wordHit=true;});
  if(wordHit)kinds.push('words');

  // Roman numerals
  const rm=stripped.match(/\b[MDCLXVI]{2,}\b/g);
  if(rm&&rm.some(r=>ROMAN_RE.test(r)&&roman(r)>0))kinds.push('roman');

  // Hex / binary
  if(radixDetect(stripped))kinds.push('hex/binary');

  // Tally marks
  if(tallyDetect(content))kinds.push('tally');

  // Symbolic glyphs
  if(symbolicDetect(content))kinds.push('symbolic');

  // Obfuscated number words
  if(obfuscatedDetect(stripped))kinds.push('obfuscated');

  // Acrostic first-letter chain
  if(acrosticDetect(content))kinds.push('acrostic');

  // ASCII art ones
  if(asciiArtDetect(content))kinds.push('ascii-art');

  // AFK check
  const lc=content.toLowerCase();
  if(AFK_TRIGGERS.some(t=>lc.includes(t)))kinds.push('afk-check');

  // Recite
  if(RECITE_RE.test(lc))kinds.push('recite');

  return{hit:kinds.length>0,kinds};
}

// ═══════════ NTFY ═══════════
function sendNotification(title,body){
  console.log('NOTIFY:',title,'-',body);
  const data=Buffer.from(body);
  const req=https.request({hostname:'ntfy.sh',port:443,path:'/'+NTFY_TOPIC,method:'POST',headers:{'Title':title,'Content-Type':'text/plain','Content-Length':data.length,'Priority':'high','Tags':'bell'}},res=>console.log('ntfy:',res.statusCode));
  req.on('error',e=>console.error('ntfy error:',e.message));
  req.write(data);req.end();
}

// ═══════════ DISCORD POLLING ═══════════
function fetchMessages(lastId){
  return new Promise((resolve,reject)=>{
    const path=`/api/v9/channels/${CHANNEL_ID}/messages?limit=10`+(lastId?`&after=${lastId}`:'');
    const req=https.request({hostname:'discord.com',port:443,path,method:'GET',headers:{'Authorization':TOKEN,'User-Agent':'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15','Content-Type':'application/json'}},res=>{
      let data='';
      res.on('data',chunk=>data+=chunk);
      res.on('end',()=>{
        console.log('Discord API status:',res.statusCode);
        if(res.statusCode===200){try{resolve(JSON.parse(data));}catch(e){reject(e);}}
        else{console.log('Discord response:',data.slice(0,200));reject(new Error('Status '+res.statusCode));}
      });
    });
    req.on('error',reject);req.end();
  });
}

let lastMessageId=null,initialized=false;
async function poll(){
  try{
    const messages=await fetchMessages(lastMessageId);
    if(!Array.isArray(messages)){console.log('Bad response:',JSON.stringify(messages).slice(0,100));return;}
    if(!initialized){
      if(messages.length>0){lastMessageId=messages[0].id;console.log('Initialized. Last message ID:',lastMessageId);}
      else console.log('No messages found');
      initialized=true;return;
    }
    const newMessages=messages.slice().reverse();
    for(const m of newMessages){
      if(!lastMessageId||m.id>lastMessageId){
        lastMessageId=m.id;
        const content=m.content||'';
        const author=m.author?(m.author.global_name||m.author.username||'?'):'?';
        console.log('New message from',author,':',content.slice(0,60));
        const det=detect(content);
        if(det.hit){
          const isAfk=det.kinds.includes('afk-check'),isRec=det.kinds.includes('recite');
          const label=isAfk?'AFK check':isRec?'Recite request':('Number detected · '+det.kinds.join(', '));
          sendNotification(label,author+': '+content.slice(0,100));
        }
      }
    }
  }catch(e){console.error('Poll error:',e.message);}
}

console.log('Starting Aqua bot for channel',CHANNEL_ID);
poll();
setInterval(poll,3000);

if(RENDER_URL){
  setInterval(()=>{
    https.get(RENDER_URL,res=>console.log('Keep-alive:',res.statusCode)).on('error',e=>console.error('Keep-alive error:',e.message));
  },10*60*1000);
}

http.createServer((req,res)=>res.end('Aqua Bot running')).listen(process.env.PORT||3000,()=>console.log('HTTP server running'));
