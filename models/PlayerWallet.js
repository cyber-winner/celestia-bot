const mongoose = require('mongoose');

const inventoryItemSchema = new mongoose.Schema({
    itemName:  { type: String, required: true },
    quantity:  { type: Number, default: 1 },
});

const playerWalletSchema = new mongoose.Schema({
    userId:     { type: String, required: true, unique: true },
    pokecoins:  { type: Number, default: 0 },
    pokeballs:  { type: Number, default: 20 },  // Start with 20 pokeballs
    radiantCrystals: { type: Number, default: 0 },  // Gacha currency for Wishing Compasses
    inventory:  { type: [inventoryItemSchema], default: [] },
    lastDaily:  { type: Date, default: null },   // Last daily reward claim timestamp
    lastWeekly: { type: Date, default: null },   // Last weekly reward claim timestamp
    lastSummon: { type: Date, default: null },   // Last Summoning Candle usage timestamp
    createdAt:  { type: Date, default: Date.now },
});

module.exports = mongoose.model('PlayerWallet', playerWalletSchema);
