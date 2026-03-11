const mongoose = require('mongoose');

const snipeSchema = new mongoose.Schema({
    guildId: { type: String, required: true },
    channelId: { type: String, required: true },
    authorId: { type: String, required: true },
    content: { type: String },
    attachments: { type: Array, default: [] },
    type: { type: String, enum: ['DELETE', 'EDIT'], required: true },
    oldContent: { type: String }, 
    createdAt: { type: Date, default: Date.now, expires: '7d' } 
});

module.exports = mongoose.model('Snipe', snipeSchema);
