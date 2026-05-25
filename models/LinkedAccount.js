const mongoose = require('mongoose');

/**
 * LinkedAccount — Cross-platform account linking between Discord and WhatsApp.
 * 
 * When a user links their accounts, both platform IDs map to a single unified game ID.
 * The originPlatform determines which name is shown on leaderboards.
 */
const linkedAccountSchema = new mongoose.Schema({
    discordId:       { type: String, sparse: true, unique: true },
    whatsappId:      { type: String, sparse: true, unique: true },
    unifiedId:       { type: String, required: true, unique: true },
    displayName:     { type: String, required: true },
    originPlatform:  { type: String, enum: ['discord', 'whatsapp'], required: true },
    otp:             { type: String, default: null },
    otpExpiry:       { type: Date, default: null },
    linkedAt:        { type: Date, default: null },
    createdAt:       { type: Date, default: Date.now },
});

linkedAccountSchema.index({ otp: 1 });

module.exports = mongoose.model('LinkedAccount', linkedAccountSchema);
