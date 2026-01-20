const fs = require("fs");
const path = require("path");
const { Client, GatewayIntentBits, PermissionsBitField } = require("discord.js");

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

// Files on host
const STATE_FILE = path.join(__dirname, "count_state.json");
const CONFIG_FILE = path.join(__dirname, "config.json");

// State: last correct number, and last user
function loadState() {
  try {
    const parsed = JSON.parse(fs.readFileSync(STATE_FILE, "utf8"));
    return {
      current: Number.isInteger(parsed.current) ? parsed.current : 0, // 0 means next expected is 1
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
