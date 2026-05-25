require('dotenv').config();
const { Client, GatewayIntentBits, Partials, Collection } = require('discord.js');
const mongoose = require('mongoose');
const fs = require('fs');
const path = require('path');
const connectDB = require('./db/connect');

console.log(`
╔══════════════════════════════════════════╗
║        ✨  CELESTIA  Discord Bot         ║
║              v2.0.0                      ║
║     Pokémon · Gacha · Cross-Platform     ║
╚══════════════════════════════════════════╝
`);

const client = new Client({
    intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.MessageContent,
        GatewayIntentBits.GuildMembers,
        GatewayIntentBits.GuildPresences,
        GatewayIntentBits.GuildMessageReactions
    ],
    partials: [Partials.Message, Partials.Channel, Partials.Reaction]
});

global.bot = client;

async function start() {
    // 1. Connect to MongoDB (same DB as WhatsApp bot)
    await connectDB();

    // 2. Load command and event handlers
    require('./handlers/commandHandler')(client);
    require('./handlers/eventHandler')(client);

    // 3. Login
    client.login(process.env.TOKEN).catch(err => {
        if (err.message.includes('disallowed intents')) {
            console.error('\u001b[31m[ERROR] Disallowed Intents!\u001b[0m');
            console.error('Please enable the following intents in the Discord Developer Portal:');
            console.error('1. Presence Intent');
            console.error('2. Server Members Intent');
            console.error('3. Message Content Intent');
        } else {
            console.error('Login Error:', err);
        }
    });
}

start();
