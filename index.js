/**
 * Steal to Egg Notifier - Discord Bot
 * ------------------------------------
 * Detecta mensajes de SenZ V2 y actualiza data/latest.json en GitHub.
 */

require('dotenv').config();
const { Client, GatewayIntentBits, Partials } = require('discord.js');
const https = require('https');

// ====== CONFIGURACIÓN ======
const CHANNEL_ID = '1544813161037963315';
const SENZ_BOT_ID = '1409108089705332836';

const GITHUB_OWNER = 'marblack-o';
const GITHUB_REPO = 'Steal-to-Egg-Notifier';
const GITHUB_FILE_PATH = 'data/latest.json';
const GITHUB_BRANCH = 'main';

// ====== Cliente Discord ======
const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
  ],
  partials: [Partials.Channel],
});

// ====== Helpers ======
function parseMoney(str) {
  if (!str) return 0;
  const cleaned = str.replace(/[~$\s,/s]/gi, '').toLowerCase();
  const match = cleaned.match(/^([\d.]+)([kmb])?$/i);
  if (!match) return 0;
  let num = parseFloat(match[1]);
  const unit = (match[2] || '').toLowerCase();
  if (unit === 'k') num *= 1e3;
  if (unit === 'm') num *= 1e6;
  if (unit === 'b') num *= 1e9;
  return num;
}

function cleanEggMessage(raw) {
  if (!raw) return null;

  const nameMatch = raw.match(/\*\*Egg:\*\*\s*([^\n\r]+)/i) || raw.match(/Egg:\s*([^\n\r]+)/i);
  const name = nameMatch ? nameMatch[1].trim() : 'Egg';

  const wikiName = name.replace(/\s+/g, '_');
  const wikiUrl = `https://stealanegg.fandom.com/wiki/${encodeURIComponent(wikiName)}`;

  const emojiMatch = raw.match(/<:([a-zA-Z0-9_]+):(\d+)>/);
  const emojiId = emojiMatch ? emojiMatch[2] : null;
  const imageUrl = emojiId ? `https://cdn.discordapp.com/emojis/${emojiId}.png` : '';

  let text = raw.replace(/<:[a-zA-Z0-9_]+:\d+>/g, '');
  text = text.replace(/\*\*(.*?)\*\*/g, '*$1*');
  text = text.replace(/<t:(\d+):R>/g, (_, ts) => {
    const diff = Math.floor(Date.now() / 1000) - parseInt(ts);
    if (diff < 60) return 'hace unos segundos';
    if (diff < 3600) return `hace ${Math.floor(diff / 60)} minutos`;
    return `hace ${Math.floor(diff / 3600)} horas`;
  });
  text = text.replace(/\[Click Here\]\((https:\/\/www\.roblox\.com[^)]+)\)/gi, '$1');
  text = text.replace(/\[([^\]]+)\]\((https?:\/\/[^)]+)\)/g, '$2');

  text = text.split('\n').map(l => l.trim()).filter(l => l.length > 0).join('\n');
  text = text
    .replace(/^\*?Egg:\*?\s*/im, '🥚 *Egg:* ')
    .replace(/^\*?Location:\*?\s*/im, '😈 *Location:* ')
    .replace(/^\*?Spawned:\*?\s*/im, '⏱ *Spawned:* ')
    .replace(/^\*?Money:\*?\s*/im, '💰 *Money:* ')
    .replace(/^\*?Recommended Speed:\*?\s*/im, '⚡ *Recommended Speed:* ')
    .replace(/^\*?Join Game:\*?\s*/im, '🎮 *Join Game:*\n');
  text = text.replace(/  +/g, ' ').trim();
  text += `\n🔍 *Wiki:*\n${wikiUrl}`;

  const locationMatch = raw.match(/\*\*Location:\*\*\s*([^\n\r]+)/i) || raw.match(/Location:\s*([^\n\r]+)/i);
  const moneyMatch = raw.match(/\*\*Money:\*\*\s*([^\n\r]+)/i) || raw.match(/Money:\s*([^\n\r]+)/i);
  const speedMatch = raw.match(/\*\*Recommended Speed:\*\*\s*([^\n\r]+)/i) || raw.match(/Recommended Speed:\s*([^\n\r]+)/i);
  const joinMatch = raw.match(/\((https:\/\/www\.roblox\.com[^)]+)\)/i);

  const moneyText = moneyMatch ? moneyMatch[1].trim() : '';

  return {
    name,
    moneyText,
    moneyValue: parseMoney(moneyText),
    location: locationMatch ? locationMatch[1].trim() : '',
    speed: speedMatch ? speedMatch[1].trim() : '',
    join: joinMatch ? joinMatch[1] : '',
    wiki: wikiUrl,
    imageUrl,
    fullText: text,
    timestamp: Date.now(),
  };
}

// ====== GitHub API ======
function githubRequest(method, path, body = null) {
  return new Promise((resolve, reject) => {
    const token = process.env.GITHUB_TOKEN;
    if (!token) return reject(new Error('Falta GITHUB_TOKEN en .env'));

    const data = body ? JSON.stringify(body) : null;
    const options = {
      hostname: 'api.github.com',
      path,
      method,
      headers: {
        'User-Agent': 'Steal-to-Egg-Notifier',
        'Authorization': `Bearer ${token}`,
        'Accept': 'application/vnd.github+json',
        'Content-Type': 'application/json',
        ...(data ? { 'Content-Length': Buffer.byteLength(data) } : {}),
      },
    };

    const req = https.request(options, (res) => {
      let raw = '';
      res.on('data', (chunk) => (raw += chunk));
      res.on('end', () => {
        if (res.statusCode >= 200 && res.statusCode < 300) {
          try {
            resolve(raw ? JSON.parse(raw) : {});
          } catch {
            resolve({});
          }
        } else {
          reject(new Error(`GitHub ${res.statusCode}: ${raw}`));
        }
      });
    });

    req.on('error', reject);
    if (data) req.write(data);
    req.end();
  });
}

async function getCurrentFile() {
  try {
    const res = await githubRequest(
      'GET',
      `/repos/${GITHUB_OWNER}/${GITHUB_REPO}/contents/${GITHUB_FILE_PATH}?ref=${GITHUB_BRANCH}`
    );
    const content = Buffer.from(res.content, 'base64').toString('utf8');
    return {
      sha: res.sha,
      data: JSON.parse(content),
    };
  } catch (err) {
    if (err.message.includes('404')) {
      return { sha: null, data: { updatedAt: 0, eggs: [] } };
    }
    throw err;
  }
}

async function updateLatestJson(newEgg) {
  const { sha, data } = await getCurrentFile();

  const idx = data.eggs.findIndex(
    (e) => e.name.toLowerCase() === newEgg.name.toLowerCase()
  );
  if (idx >= 0) {
    data.eggs[idx] = newEgg;
  } else {
    data.eggs.push(newEgg);
  }

  data.eggs.sort((a, b) => (b.moneyValue || 0) - (a.moneyValue || 0));
  data.updatedAt = Date.now();

  const content = Buffer.from(JSON.stringify(data, null, 2)).toString('base64');

  await githubRequest(
    'PUT',
    `/repos/${GITHUB_OWNER}/${GITHUB_REPO}/contents/${GITHUB_FILE_PATH}`,
    {
      message: `update: ${newEgg.name} (${newEgg.moneyText || 'egg'})`,
      content,
      branch: GITHUB_BRANCH,
      ...(sha ? { sha } : {}),
    }
  );

  console.log(`✅ JSON actualizado en GitHub → ${newEgg.name}`);
}

// ====== Discord events ======
client.once('ready', () => {
  console.log(`✅ Bot conectado como ${client.user.tag}`);
  console.log(`👀 Canal: ${CHANNEL_ID}`);
  console.log(`🎯 SenZ V2: ${SENZ_BOT_ID}`);
  console.log(`📦 JSON: data/latest.json`);
});

client.on('messageCreate', async (message) => {
  if (message.channel.id !== CHANNEL_ID) return;
  if (message.author.id !== SENZ_BOT_ID) return;
  if (message.author.id === client.user.id) return;

  console.log('\n🥚 ¡Huevo OP detectado!');

  const cleaned = cleanEggMessage(message.content);
  if (!cleaned) {
    console.log('No se pudo limpiar el mensaje');
    return;
  }

  console.log(`   Nombre : ${cleaned.name}`);
  console.log(`   Money  : ${cleaned.moneyText}`);
  console.log(`   Location: ${cleaned.location}`);

  try {
    await updateLatestJson(cleaned);
  } catch (err) {
    console.error('❌ Error actualizando JSON:', err.message);
  }
});

// ====== Login ======
const token = process.env.DISCORD_TOKEN;
if (!token) {
  console.error('❌ Falta DISCORD_TOKEN en el archivo .env');
  process.exit(1);
}
if (!process.env.GITHUB_TOKEN) {
  console.error('❌ Falta GITHUB_TOKEN en el archivo .env');
  process.exit(1);
}

client.login(token).catch((err) => {
  console.error('❌ Error al conectar con Discord:', err.message);
  process.exit(1);
});
