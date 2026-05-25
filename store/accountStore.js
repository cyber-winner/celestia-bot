/**
 * Account Store — Cross-platform account linking and unified ID resolution.
 * 
 * Handles:
 *   - Discord ID → unified game ID resolution
 *   - OTP generation for account linking
 *   - Account merging (migrate all game data to unified ID)
 */

const LinkedAccount = require('../models/LinkedAccount');
const PokemonEntry = require('../models/Pokemon');
const PlayerWallet = require('../models/PlayerWallet');
const GachaProfile = require('../models/GachaProfile');
const PokemonListing = require('../models/PokemonListing');
const crypto = require('crypto');

/**
 * Generate a 6-digit OTP for account linking.
 */
function generateOTP() {
    return crypto.randomInt(100000, 999999).toString();
}

/**
 * Resolve a Discord user ID to a unified game ID.
 * If the user has a linked account, returns the unifiedId.
 * Otherwise returns `discord_<discordId>`.
 */
async function resolveUserId(discordId) {
    const linked = await LinkedAccount.findOne({ discordId });
    if (linked) return linked.unifiedId;
    return `discord_${discordId}`;
}

/**
 * Get display name for a user ID (checks LinkedAccount first).
 */
async function getDisplayName(userId, fallbackName) {
    const linked = await LinkedAccount.findOne({
        $or: [{ unifiedId: userId }, { discordId: userId.replace('discord_', '') }]
    });
    if (linked) return linked.displayName;
    return fallbackName || 'Trainer';
}

/**
 * Get display name for leaderboard display by game userId.
 */
async function getLeaderboardName(userId) {
    // Check if this is a linked account
    const linked = await LinkedAccount.findOne({ unifiedId: userId });
    if (linked) return linked.displayName;

    // Check if it's a discord user
    if (userId.startsWith('discord_')) {
        const discordId = userId.replace('discord_', '');
        try {
            const user = await global.bot.users.fetch(discordId);
            return user.username;
        } catch {
            return `User ${discordId.slice(-4)}`;
        }
    }

    // WhatsApp user (phone number) — show masked
    return `WA:${userId.slice(-4)}`;
}

/**
 * Initiate Discord → WhatsApp link. 
 * Creates or updates a LinkedAccount with OTP.
 */
async function initiateDiscordLink(discordId, discordUsername) {
    // Check if already linked
    const existing = await LinkedAccount.findOne({ discordId });
    if (existing && existing.whatsappId) {
        return { success: false, reason: 'already_linked', linkedTo: existing.whatsappId };
    }

    const otp = generateOTP();
    const otpExpiry = new Date(Date.now() + 5 * 60 * 1000); // 5 minutes

    if (existing) {
        // Update existing record with new OTP
        existing.otp = otp;
        existing.otpExpiry = otpExpiry;
        await existing.save();
    } else {
        // Create new record
        await LinkedAccount.findOneAndUpdate(
            { discordId },
            {
                discordId,
                unifiedId: `discord_${discordId}`,
                displayName: discordUsername,
                originPlatform: 'discord',
                otp,
                otpExpiry,
            },
            { upsert: true, new: true }
        );
    }

    return { success: true, otp };
}

/**
 * Complete Discord → WhatsApp link (called from WhatsApp side).
 * Validates OTP and merges data.
 */
async function completeLink(otp, whatsappId) {
    const account = await LinkedAccount.findOne({ otp, otpExpiry: { $gt: new Date() } });
    if (!account) return { success: false, reason: 'invalid_otp' };

    const discordId = account.discordId;
    const oldWhatsappUserId = whatsappId;
    const newUnifiedId = account.unifiedId; // Keep Discord ID as unified

    // Check if this whatsappId already has a LinkedAccount
    const existing = await LinkedAccount.findOne({ whatsappId });
    if (existing) {
        // Merge game data from existing.unifiedId to newUnifiedId
        await migrateGameData(existing.unifiedId, newUnifiedId);
        // Delete the old linked account
        await LinkedAccount.deleteOne({ _id: existing._id });
    } else {
        // Migrate raw WhatsApp game data to unified ID
        await migrateGameData(oldWhatsappUserId, newUnifiedId);
    }

    // Update linked account
    account.whatsappId = whatsappId;
    account.otp = null;
    account.otpExpiry = null;
    account.linkedAt = new Date();
    await account.save();

    return { success: true, unifiedId: newUnifiedId, displayName: account.displayName };
}

/**
 * Initiate WhatsApp → Discord link.
 * Creates or updates a LinkedAccount with OTP.
 */
async function initiateWhatsAppLink(whatsappId, whatsappName) {
    // Check if already linked
    const existing = await LinkedAccount.findOne({ whatsappId });
    if (existing && existing.discordId) {
        return { success: false, reason: 'already_linked' };
    }

    const otp = generateOTP();
    const otpExpiry = new Date(Date.now() + 5 * 60 * 1000); // 5 minutes

    if (existing) {
        existing.otp = otp;
        existing.otpExpiry = otpExpiry;
        await existing.save();
    } else {
        await LinkedAccount.findOneAndUpdate(
            { whatsappId },
            {
                whatsappId,
                unifiedId: whatsappId,
                displayName: whatsappName,
                originPlatform: 'whatsapp',
                otp,
                otpExpiry,
            },
            { upsert: true, new: true }
        );
    }

    return { success: true, otp };
}

/**
 * Complete WhatsApp → Discord link (called from Discord side).
 */
async function completeLinkFromDiscord(otp, discordId, discordUsername) {
    const account = await LinkedAccount.findOne({ otp, otpExpiry: { $gt: new Date() } });
    if (!account) return { success: false, reason: 'invalid_otp' };

    const oldDiscordUserId = `discord_${discordId}`;
    const newUnifiedId = account.unifiedId; // Keep WhatsApp ID as unified

    // Check if this discordId already has a LinkedAccount
    const existing = await LinkedAccount.findOne({ discordId });
    if (existing) {
        // Merge game data from existing.unifiedId to newUnifiedId
        await migrateGameData(existing.unifiedId, newUnifiedId);
        // Delete the old linked account
        await LinkedAccount.deleteOne({ _id: existing._id });
    } else {
        // Migrate raw Discord game data to unified ID
        await migrateGameData(oldDiscordUserId, newUnifiedId);
    }

    // Update linked account
    account.discordId = discordId;
    account.otp = null;
    account.otpExpiry = null;
    account.linkedAt = new Date();
    await account.save();

    return { success: true, unifiedId: newUnifiedId, displayName: account.displayName };
}

/**
 * Migrate all game data from one userId to another.
 */
async function migrateGameData(fromUserId, toUserId) {
    if (fromUserId === toUserId) return;

    // Migrate PokemonEntries
    await PokemonEntry.updateMany({ userId: fromUserId }, { userId: toUserId });

    // Merge wallets
    const fromWallet = await PlayerWallet.findOne({ userId: fromUserId });
    const toWallet = await PlayerWallet.findOne({ userId: toUserId });

    if (fromWallet && toWallet) {
        // Merge coins, balls, crystals
        toWallet.pokecoins += fromWallet.pokecoins;
        toWallet.pokeballs += fromWallet.pokeballs;
        toWallet.radiantCrystals = (toWallet.radiantCrystals || 0) + (fromWallet.radiantCrystals || 0);

        // Merge inventory
        for (const item of fromWallet.inventory) {
            const existing = toWallet.inventory.find(i => i.itemName === item.itemName);
            if (existing) {
                existing.quantity += item.quantity;
            } else {
                toWallet.inventory.push(item);
            }
        }

        // Keep the most recent cooldowns (most restrictive)
        if (fromWallet.lastDaily && (!toWallet.lastDaily || fromWallet.lastDaily > toWallet.lastDaily)) {
            toWallet.lastDaily = fromWallet.lastDaily;
        }
        if (fromWallet.lastWeekly && (!toWallet.lastWeekly || fromWallet.lastWeekly > toWallet.lastWeekly)) {
            toWallet.lastWeekly = fromWallet.lastWeekly;
        }
        if (fromWallet.lastSummon && (!toWallet.lastSummon || fromWallet.lastSummon > toWallet.lastSummon)) {
            toWallet.lastSummon = fromWallet.lastSummon;
        }

        await toWallet.save();
        await PlayerWallet.deleteOne({ userId: fromUserId });
    } else if (fromWallet && !toWallet) {
        fromWallet.userId = toUserId;
        await fromWallet.save();
    }

    // Merge gacha profiles
    const fromGacha = await GachaProfile.findOne({ userId: fromUserId });
    const toGacha = await GachaProfile.findOne({ userId: toUserId });

    if (fromGacha && toGacha) {
        // Keep higher pity (more progress)
        toGacha.pity5 = Math.max(toGacha.pity5, fromGacha.pity5);
        toGacha.pity4 = Math.max(toGacha.pity4, fromGacha.pity4);
        toGacha.guaranteed5 = toGacha.guaranteed5 || fromGacha.guaranteed5;
        toGacha.totalWishes += fromGacha.totalWishes;
        toGacha.total5Stars += fromGacha.total5Stars;
        toGacha.total4Stars += fromGacha.total4Stars;
        await toGacha.save();
        await GachaProfile.deleteOne({ userId: fromUserId });
    } else if (fromGacha && !toGacha) {
        fromGacha.userId = toUserId;
        await fromGacha.save();
    }

    // Migrate marketplace listings
    await PokemonListing.updateMany({ sellerId: fromUserId }, { sellerId: toUserId });
}

module.exports = {
    resolveUserId,
    getDisplayName,
    getLeaderboardName,
    initiateDiscordLink,
    completeLink,
    initiateWhatsAppLink,
    completeLinkFromDiscord,
    migrateGameData,
    generateOTP,
};
