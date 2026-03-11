require('dotenv').config();
const { Client, GatewayIntentBits, Partials, Collection } = require('discord.js');
const mongoose = require('mongoose');
const fs = require('fs');
const path = require('path');

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


mongoose.connect(process.env.MONGODB_URI)
    .then(() => console.log('Connected to MongoDB'))
    .catch(err => console.error('MongoDB Connection Error:', err));


global.bot = client;


require('./handlers/commandHandler')(client);
require('./handlers/eventHandler')(client);

client.login(process.env.TOKEN).catch(err => {
    if (err.message.includes('disallowed intents')) {
        console.error('\u001b[31m[ERROR] Disallowed Intents!\u001b[0m');
        console.error('Please go to the Discord Developer Portal (https://discord.com/developers/applications)');
        console.error('and enable the following intents under the "Bot" tab:');
        console.error('1. Presence Intent');
        console.error('2. Server Members Intent');
        console.error('3. Message Content Intent');
    } else {
        console.error('Login Error:', err);
    }
});
