const mongoose = require('mongoose');

const guildSchema = new mongoose.Schema({
    guildId: { type: String, required: true, unique: true },
    prefix: { type: String, default: '!' },
    logChannel: { type: String, default: null },
    modLogChannel: { type: String, default: null },
    aiLogChannel: { type: String, default: null },
    quarantineRoleId: { type: String, default: null },
    quarantineViewChannelId: { type: String, default: null },
    automod: {
        enabled: { type: Boolean, default: true },
        aiThreshold: { type: Number, default: 0.7 }
    }
});

module.exports = mongoose.model('Guild', guildSchema);
