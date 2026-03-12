const mongoose = require('mongoose');

const quarantineUserSchema = new mongoose.Schema({
    guildId: { type: String, required: true },
    userId: { type: String, required: true },
    roles: { type: Array, default: [] },
    quarantinedAt: { type: Date, default: Date.now }
});

module.exports = mongoose.model('QuarantineUser', quarantineUserSchema);
