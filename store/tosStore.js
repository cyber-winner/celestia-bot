/**
 * ToS Store — Tracks which users have accepted the Terms of Service.
 * Uses in-memory cache backed by the PlayerWallet model's tosVersion field.
 * The bot owner (FATHER_DISCORD_ID) is always exempt.
 */

const PlayerWallet = require('../models/PlayerWallet');
const { TOS_VERSION } = require('../data/tos');

// Father's Discord user ID — always exempt from ToS
const FATHER_DISCORD_ID = '1297956800427065475';

// In-memory cache: Set<discordUserId> of users who have accepted the current ToS version
const acceptedUsers = new Set();

/**
 * Load all accepted users from DB into memory on startup.
 */
async function loadAll() {
    try {
        const accountStore = require('./accountStore');
        const wallets = await PlayerWallet.find({ tosVersion: { $gte: TOS_VERSION } }, { userId: 1 });
        for (const w of wallets) {
            // The wallet userId may be a WhatsApp ID; we cache what we have.
            // We'll also check at runtime via resolveUserId.
            acceptedUsers.add(w.userId);
        }
        // Father is always exempt
        acceptedUsers.add(FATHER_DISCORD_ID);
        console.log(`[ToSStore] Loaded ${acceptedUsers.size} accepted users (v${TOS_VERSION}).`);
    } catch (err) {
        console.error('[ToSStore] Failed to load:', err.message);
    }
}

/**
 * Check if a user has accepted the current ToS version.
 * @param {string} resolvedUserId - The resolved (linked) userId from accountStore
 * @param {string} discordUserId - The raw Discord user ID
 */
function hasAcceptedToS(resolvedUserId, discordUserId) {
    if (discordUserId === FATHER_DISCORD_ID) return true;
    return acceptedUsers.has(resolvedUserId) || acceptedUsers.has(discordUserId);
}

/**
 * Record that a user has accepted the current ToS version.
 * Updates both in-memory cache and DB.
 */
async function acceptToS(resolvedUserId, discordUserId) {
    if (acceptedUsers.has(resolvedUserId)) return false;

    acceptedUsers.add(resolvedUserId);
    if (discordUserId) acceptedUsers.add(discordUserId);

    try {
        await PlayerWallet.updateOne(
            { userId: resolvedUserId },
            { $set: { tosVersion: TOS_VERSION } },
            { upsert: true }
        );
    } catch (err) {
        console.error('[ToSStore] Failed to save acceptance:', err.message);
    }

    return true;
}

module.exports = {
    loadAll,
    hasAcceptedToS,
    acceptToS,
    TOS_VERSION,
    FATHER_DISCORD_ID,
};
