const fs = require("fs");
const path = require("path");
const http = require("http");
const { Client, GatewayIntentBits, PermissionsBitField } = require("discord.js");

// ---- Don't let the process die silently ----
process.on("unhandledRejection", (err) => console.error("UNHANDLED REJECTION:", err));
process.on("uncaughtException", (err) => console.error("UNCAUGHT EXCEPTION:", err));

// ===== Keep-alive web server (Replit + UptimeRobot) =====
const PORT = Number(process.env.PORT) || 3000;

const server = http.createServer((req, res) => {
  res.writeHead(200, { "Content-Type": "text/plain" });
  res.end("Bot is running");
});

server.listen(PORT, "0.0.0.0", () => {
  console.log("Keep-alive server listening on port " + PORT);
});

// ===== Discord setup =====
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

// ===== Persistent files =====
const STATE_FILE = path.join(__dirname, "count_state.json");
const CONFIG_FILE = path.join(__dirname, "config.json");

function loadState() {
  try {
    const parsed = JSON.parse(fs.readFileSync(STATE_FILE, "utf8"));
    return {
      current: Number.isInteger(parsed.current) ? parsed.current : 0, // next expected = 1
      lastUserId: typeof parsed.lastUserId === "string" ? parsed.lastUserId : null,
    };
  } catch {
    return { current: 0, lastUserId: null };
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
          : "^ Wrong number fuckwit start again\n1",
    };
  } catch {
    return { wrongMessage: "^ Wrong number fuckwit start again\n1" };
  }
}
function saveConfig(cfg) {
  fs.writeFileSync(CONFIG_FILE, JSON.stringify(cfg, null, 2), "utf8");
}

let state = loadState();
let config = loadConfig();

async function reset(channel) {
  state = { current: 0, lastUserId: null };
  saveState(state);
  await channel.send(config.wrongMessage);
}

function isDigitsOnly(str) {
  return /^[0-9]+$/.test(str);
}

client.once("ready", () => {
  console.log(`✅ Logged in as ${client.user.tag}`);
  console.log(`Watching counting channel: ${COUNTING_CHANNEL_ID}`);
});

client.on("messageCreate", async (message) => {
  try {
    if (message.author?.bot) return;
    if (message.channel?.id !== COUNTING_CHANNEL_ID) return;

    // ---- Admin command to change wrong message live ----
    const rawContent = typeof message.content === "string" ? message.content : "";

    if (rawContent.toLowerCase().startsWith("!setwrong")) {
      const canManage = message.member?.permissions?.has(
        PermissionsBitField.Flags.ManageGuild
      );
      if (!canManage) {
        return message.reply("❌ You don’t have permission to change the wrong message.");
      }

      const newMsg = rawContent.slice("!setwrong".length).trim();
      if (!newMsg) return message.reply("Usage: `!setwrong your message here`");

      config.wrongMessage = newMsg;
      saveConfig(config);
      return message.reply("✅ Wrong message updated (no restart needed).");
    }

    // ---- Block non-text posts (images, stickers, links/embeds, etc.) ----
    const hasAttachments = (message.attachments?.size ?? 0) > 0;
    const hasStickers = (message.stickers?.size ?? 0) > 0;
    const hasEmbeds = (message.embeds?.length ?? 0) > 0;

    // If they posted ANY attachment/sticker/embed, reset immediately
    if (hasAttachments || hasStickers || hasEmbeds) {
      return reset(message.channel);
    }

    const content = rawContent.trim();

    // Empty content (common with some special messages)
    if (!content) {
      return reset(message.channel);
    }

    // Must be digits only
    if (!isDigitsOnly(content)) {
      return reset(message.channel);
    }

    const number = Number(content);

    // No double turns
    if (state.lastUserId && message.author.id === state.lastUserId) {
      return reset(message.channel);
    }

    const expected = state.current + 1;
    if (number !== expected) {
      return reset(message.channel);
    }

    // Correct
    state.current = number;
    state.lastUserId = message.author.id;
    saveState(state);
  } catch (err) {
    console.error("Handler error:", err);
  }
});

client.login(DISCORD_TOKEN);
