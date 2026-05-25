const mongoose = require('mongoose');

/**
 * GachaProfile — Tracks per-user gacha pity counters and guarantee state.
 *
 * pity5:       Number of pulls since last 5-star (resets on 5-star hit)
 * pity4:       Number of pulls since last 4-star (resets on 4-star or 5-star hit)
 * guaranteed5: If true, next 5-star is guaranteed to be the featured character
 */
const gachaProfileSchema = new mongoose.Schema({
    userId:       { type: String, required: true, unique: true },
    pity5:        { type: Number, default: 0 },
    pity4:        { type: Number, default: 0 },
    guaranteed5:  { type: Boolean, default: false },
    totalWishes:  { type: Number, default: 0 },
    total5Stars:  { type: Number, default: 0 },
    total4Stars:  { type: Number, default: 0 },
    createdAt:    { type: Date, default: Date.now },
});


module.exports = mongoose.model('GachaProfile', gachaProfileSchema);
