const mongoose = require('mongoose');

const activeGiveawaySchema = new mongoose.Schema({
    guildId: { type: String, required: true, unique: true },
    channelId: { type: String, required: true },
    messageId: { type: String, default: null },
    prize: { type: mongoose.Schema.Types.Mixed, required: true },
    endTime: { type: Number, required: true },
    participants: [{
        userId: { type: String, required: true },
        userName: { type: String, required: true }
    }],
    createdAt: { type: Date, default: Date.now }
});

module.exports = mongoose.model('ActiveGiveaway', activeGiveawaySchema);
