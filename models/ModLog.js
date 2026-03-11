const mongoose = require('mongoose');

const modLogSchema = new mongoose.Schema({
    guildId: { type: String, required: true },
    userId: { type: String, required: true },
    moderatorId: { type: String, required: true },
    action: { type: String, enum: ['BAN', 'KICK', 'TIMEOUT', 'QUARANTINE', 'SANITIZE', 'UNBAN'], required: true },
    reason: { type: String, default: 'No reason provided' },
    duration: { type: String, default: null },
    proof: { type: String, default: null },
    timestamp: { type: Date, default: Date.now }
});

module.exports = mongoose.model('ModLog', modLogSchema);
