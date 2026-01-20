const fs = require("fs");
const path = require("path");
const { Client, GatewayIntentBits, PermissionsBitField } = require("discord.js");

// Railway uses Environment Variables (not .env files), so we read from process.env
const DISCORD_TOKEN = process.env.DISCORD_TOKEN;
const COUNTING_CHANNEL_ID = process.env.COUNTING_CHANNEL_ID;

if (!DISCORD_TOKEN) throw new Error("Missing DISCORD_TOKEN env var");
if (!COUNTING_CHANNEL_ID) throw new Error("Missing COUNTING_CHANNEL_ID env var");

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
  ],
});

// ---------- Files stored on the server ----------
const STATE_FILE = path.join(__dirname, "count_state.json");
const CONFIG_FILE = path.join(__dirname, "config.json");

// Start/reset logic: we want the game to restart at 0
// We'll store "current" as last correct number. Start at -1 so expected is 0.
function loadState() {
  try {
    const parsed = JSON.parse(fs.readFileSync(STATE_FILE, "utf8"));
    return {
      current: Number.isInteger(parsed.current) ? parsed.current : -1,
      lastUserId: typeof parsed.lastUserId === "string" ? parsed.lastUserId : null,
    };
  } catch {
    return { current: -1, lastUserId: null };
  }
}

function saveState(state) {
  fs.writeFileSync(STATE_FILE, JSON.stringify(state, null, 2), "utf8");
}

function loadConfig() {
  try {
    const parsed = JSON.parse(fs.readFileSync(CONFIG_FILE, "utf8"));
    return {
      wrongMessage:
        typeof parsed.wrongMessage === "string"
          ? parsed.wrongMessage
          : "^ Wrong number fuckwit start again\n0",
    };
  } catch {
    return { wrongMessage: "^ Wrong number fuckwit start again\n0" };
  }
}

function saveConfig(cfg) {
  fs.writeFileSync(CONFIG_FILE, JSON.stringify(cfg, null, 2), "utf8");
}

let state = loadState();
let config = loadConfig();

async function reset(channel) {
  state = { current: -1, lastUserId: null }; // expected becomes 0
  saveState(state);
  await channel.send(config.wrongMessage);
}

client.once("ready", () => {
  console.log(`✅ Logged in as ${client.user.tag}`);
  console.log(`✅ Watching counting channel: ${COUNTING_CHANNEL_ID}`);
});

client.on("messageCreate", async (message) => {
  if (message.author.bot) return;
  if (message.channel.id !== COUNTING_CHANNEL_ID) return;

  // Admin command (no restart): set wrong message
  if (message.content.toLowerCase().startsWith("!setwrong")) {
    const canManage = message.member?.permissions?.has(
      PermissionsBitField.Flags.ManageGuild
    );

    if (!canManage) {
      return message.reply("❌ You don’t have permission to change the wrong message.");
    }

    const newMsg = message.content.slice("!setwrong".length).trim();
    if (!newMsg) return message.reply("Usage: `!setwrong your message here`");

    config.wrongMessage = newMsg;
    saveConfig(config);
    return message.reply("✅ Wrong message updated (no restart needed).");
  }

  // Must be plain integer only
  const content = message.content.trim();
  const number = Number(content);

  if (!Number.isInteger(number) || String(number) !== content) {
    return reset(message.channel);
  }

  // No double turns
  if (state.lastUserId && message.author.id === state.lastUserId) {
    return reset(message.channel);
  }

  // Expected number (starts at 0 after reset because current=-1)
  const expected = state.current + 1;

  if (number !== expected) {
    return reset(message.channel);
  }

  // Correct
  state.current = number;
  state.lastUserId = message.author.id;
  saveState(state);
});

client.login(DISCORD_TOKEN);
