/**
 * Giveaway Store — Manages active giveaways in Discord servers.
 * Handles starting, entering, rolling, and resuming giveaways with DB persistence.
 */

const PlayerWallet = require('../models/PlayerWallet');
const ActiveGiveaway = require('../models/ActiveGiveaway');
const { FATHER_DISCORD_ID } = require('./tosStore');

// Key: guildId, Value: { participants: Map<resolvedUserId, userName>, endTime, timer, prize, channelId, messageId }
const activeGiveaways = new Map();

/**
 * Check if a guild has an active giveaway.
 */
function hasActiveGiveaway(guildId) {
    return activeGiveaways.has(guildId);
}

/**
 * Get active giveaway details for a guild.
 */
function getGiveaway(guildId) {
    return activeGiveaways.get(guildId);
}

/**
 * Starts a new giveaway in a guild.
 * @param {string} guildId
 * @param {string} channelId
 * @param {Object} prize - { type: 'pokecoins'|'crystal'|'item', amount, itemName? }
 * @param {number} durationMinutes
 * @param {Object} client - Discord client
 * @param {string} fatherResolvedId - Father's resolved economy userId
 */
async function startGiveaway(guildId, channelId, prize, durationMinutes, client, fatherResolvedId) {
    if (activeGiveaways.has(guildId)) {
        return { success: false, reason: 'A giveaway is already running in this server!' };
    }

    // Deduct prize from Father's wallet immediately to lock it
    const fatherWallet = await PlayerWallet.findOne({ userId: fatherResolvedId });
    if (!fatherWallet) {
        return { success: false, reason: 'Father does not have a registered profile wallet!' };
    }

    if (prize.type === 'pokecoins') {
        if ((fatherWallet.pokecoins || 0) < prize.amount) {
            return { success: false, reason: `Father only has ${fatherWallet.pokecoins || 0} PokéCoins (requested ${prize.amount}).` };
        }
        fatherWallet.pokecoins -= prize.amount;
    } else if (prize.type === 'crystal') {
        if ((fatherWallet.radiantCrystals || 0) < prize.amount) {
            return { success: false, reason: `Father only has ${fatherWallet.radiantCrystals || 0} Radiant Crystals (requested ${prize.amount}).` };
        }
        fatherWallet.radiantCrystals -= prize.amount;
    } else if (prize.type === 'item') {
        const itemLower = prize.itemName.toLowerCase();
        const existingItem = fatherWallet.inventory.find(i => i.itemName.toLowerCase() === itemLower);
        if (!existingItem || existingItem.quantity < prize.amount) {
            const hasQty = existingItem ? existingItem.quantity : 0;
            return { success: false, reason: `Father only has ${hasQty}x ${prize.itemName} (requested ${prize.amount}).` };
        }
        existingItem.quantity -= prize.amount;
        fatherWallet.inventory = fatherWallet.inventory.filter(i => i.quantity > 0);
    }

    await fatherWallet.save();

    const durationMs = durationMinutes * 60 * 1000;
    const endTime = Date.now() + durationMs;

    const timer = setTimeout(async () => {
        await rollGiveaway(guildId, client);
    }, durationMs);

    activeGiveaways.set(guildId, {
        participants: new Map(),
        endTime,
        timer,
        guildId,
        channelId,
        prize,
        fatherResolvedId,
    });

    // Persist to DB
    try {
        await ActiveGiveaway.create({
            guildId,
            channelId,
            prize,
            endTime,
            participants: [],
        });
    } catch (err) {
        console.error('[GiveawayStore] Failed to save active giveaway to DB:', err);
    }

    return { success: true, durationMs };
}

/**
 * Adds a user to the active giveaway in a guild.
 */
function enterParticipant(guildId, resolvedUserId, userName) {
    const giveaway = activeGiveaways.get(guildId);
    if (!giveaway) return { success: false, reason: 'no_giveaway' };

    if (giveaway.participants.has(resolvedUserId)) {
        return { success: false, reason: 'already_entered' };
    }

    giveaway.participants.set(resolvedUserId, userName);

    // Save/update in DB asynchronously
    ActiveGiveaway.findOneAndUpdate(
        { guildId },
        { $push: { participants: { userId: resolvedUserId, userName } } }
    ).catch(err => console.error('[GiveawayStore] DB Enter Participant Error:', err));

    return { success: true, count: giveaway.participants.size };
}

/**
 * Rolls the giveaway to select a winner and transfer locked assets.
 */
async function rollGiveaway(guildId, client) {
    const giveaway = activeGiveaways.get(guildId);
    if (!giveaway) return;

    // Clean up from active giveaways map
    activeGiveaways.delete(guildId);

    // Remove from DB
    try {
        await ActiveGiveaway.deleteOne({ guildId });
    } catch (err) {
        console.error('[GiveawayStore] Failed to delete active giveaway from DB:', err);
    }

    const { prize, channelId, fatherResolvedId } = giveaway;
    let channel;
    try {
        channel = await client.channels.fetch(channelId);
    } catch (err) {
        console.error('[GiveawayStore] Failed to fetch channel:', err);
        return;
    }

    if (giveaway.participants.size === 0) {
        // Refund Father's wallet since no one entered
        const fatherWallet = await PlayerWallet.findOne({ userId: fatherResolvedId });
        if (fatherWallet) {
            if (prize.type === 'pokecoins') {
                fatherWallet.pokecoins = (fatherWallet.pokecoins || 0) + prize.amount;
            } else if (prize.type === 'crystal') {
                fatherWallet.radiantCrystals = (fatherWallet.radiantCrystals || 0) + prize.amount;
            } else if (prize.type === 'item') {
                const existing = fatherWallet.inventory.find(i => i.itemName.toLowerCase() === prize.itemName.toLowerCase());
                if (existing) {
                    existing.quantity += prize.amount;
                } else {
                    fatherWallet.inventory.push({ itemName: prize.itemName, quantity: prize.amount });
                }
            }
            await fatherWallet.save();
        }

        const { ContainerBuilder, TextDisplayBuilder, SeparatorBuilder, SeparatorSpacingSize, MessageFlags } = require('discord.js');
        const { COLORS } = require('../utils/componentBuilder');

        const container = new ContainerBuilder()
            .setAccentColor(COLORS.WARNING)
            .addTextDisplayComponents(new TextDisplayBuilder().setContent(`## 💨 Giveaway Ended`))
            .addSeparatorComponents(new SeparatorBuilder().setSpacing(SeparatorSpacingSize.Small).setDivider(true))
            .addTextDisplayComponents(new TextDisplayBuilder().setContent(
                `😢 No one entered the giveaway, so the prize has been returned to Father's vault!`
            ));

        await channel.send({ components: [container], flags: MessageFlags.IsComponentsV2 }).catch(console.error);
        return;
    }

    // Pick a random winner
    const participantList = Array.from(giveaway.participants.entries()).map(([id, name]) => ({ id, name }));
    const winner = participantList[Math.floor(Math.random() * participantList.length)];

    try {
        const economyStore = require('./economyStore');
        const winnerWallet = await economyStore.getWallet(winner.id);

        let prizeText = '';
        if (prize.type === 'pokecoins') {
            winnerWallet.pokecoins = (winnerWallet.pokecoins || 0) + prize.amount;
            prizeText = `<:pokecoins:1508755286784086037> **${prize.amount.toLocaleString()} PokéCoins**`;
        } else if (prize.type === 'crystal') {
            winnerWallet.radiantCrystals = (winnerWallet.radiantCrystals || 0) + prize.amount;
            prizeText = `<:Crystal:1508755711348445214> **${prize.amount.toLocaleString()} Radiant Crystals**`;
        } else if (prize.type === 'item') {
            const existing = winnerWallet.inventory.find(i => i.itemName.toLowerCase() === prize.itemName.toLowerCase());
            if (existing) {
                existing.quantity += prize.amount;
            } else {
                winnerWallet.inventory.push({ itemName: prize.itemName, quantity: prize.amount });
            }
            prizeText = `🎁 **${prize.amount}x ${prize.itemName}**`;
        }

        await winnerWallet.save();

        // Resolve the Discord user for the winner
        const accountStore = require('./accountStore');
        const LinkedAccount = require('../models/LinkedAccount');
        
        // Try to find the Discord user ID for the winner
        let winnerMention = winner.name;
        try {
            const linked = await LinkedAccount.findOne({ waUserId: winner.id });
            if (linked) {
                winnerMention = `<@${linked.discordUserId}>`;
            } else {
                // Maybe the winner ID IS a Discord user ID
                winnerMention = `<@${winner.id}>`;
            }
        } catch (e) {
            winnerMention = winner.name;
        }

        const { ContainerBuilder, TextDisplayBuilder, SeparatorBuilder, SeparatorSpacingSize, MessageFlags } = require('discord.js');
        const { COLORS } = require('../utils/componentBuilder');

        const container = new ContainerBuilder()
            .setAccentColor(COLORS.GOLD)
            .addTextDisplayComponents(new TextDisplayBuilder().setContent(`## 🏆 Giveaway Winner Chosen!`))
            .addSeparatorComponents(new SeparatorBuilder().setSpacing(SeparatorSpacingSize.Small).setDivider(true))
            .addTextDisplayComponents(new TextDisplayBuilder().setContent(
                `🎉 Congratulations to ${winnerMention} (${winner.name})!\n\n` +
                `👑 **Host:** Father Cyber\n` +
                `🎁 **Prize Won:** ${prizeText}\n\n` +
                `📦 *The prize has been delivered to your profile inventory!*\n` +
                `> *~Praise the Supreme Father Cyber!~* 🙏`
            ));

        await channel.send({ components: [container], flags: MessageFlags.IsComponentsV2 }).catch(console.error);

    } catch (err) {
        console.error('[Giveaway Roll Error]:', err);
        const { MessageFlags } = require('discord.js');
        const { errorContainer } = require('../utils/componentBuilder');
        await channel.send({
            components: [errorContainer('Giveaway Error', `An error occurred while processing the giveaway: \`${err.message}\``)],
            flags: MessageFlags.IsComponentsV2,
        }).catch(console.error);
    }
}

/**
 * Initialize / Resume any active giveaways from MongoDB on bot startup
 */
async function init(client) {
    try {
        const giveaways = await ActiveGiveaway.find({});
        console.log(`[GiveawayStore] Found ${giveaways.length} active giveaways in DB to resume.`);

        const now = Date.now();
        for (const doc of giveaways) {
            const remainingMs = doc.endTime - now;

            // Rebuild participants Map
            const participantsMap = new Map();
            if (doc.participants && doc.participants.length > 0) {
                for (const p of doc.participants) {
                    participantsMap.set(p.userId, p.userName);
                }
            }

            if (remainingMs <= 0) {
                // Expired while offline — roll immediately
                console.log(`[GiveawayStore] Giveaway in guild ${doc.guildId} expired while offline. Rolling now...`);
                activeGiveaways.set(doc.guildId, {
                    participants: participantsMap,
                    endTime: doc.endTime,
                    guildId: doc.guildId,
                    channelId: doc.channelId,
                    prize: doc.prize,
                    timer: null,
                    fatherResolvedId: null, // Will refund to first Father found
                });
                await rollGiveaway(doc.guildId, client);
            } else {
                console.log(`[GiveawayStore] Resuming giveaway in guild ${doc.guildId} with ${Math.round(remainingMs / 1000 / 60)} minutes remaining.`);

                const timer = setTimeout(async () => {
                    await rollGiveaway(doc.guildId, client);
                }, remainingMs);

                activeGiveaways.set(doc.guildId, {
                    participants: participantsMap,
                    endTime: doc.endTime,
                    timer,
                    guildId: doc.guildId,
                    channelId: doc.channelId,
                    prize: doc.prize,
                    fatherResolvedId: null,
                });
            }
        }
    } catch (err) {
        console.error('[GiveawayStore] Failed to initialize / resume active giveaways:', err);
    }
}

module.exports = {
    init,
    hasActiveGiveaway,
    getGiveaway,
    startGiveaway,
    enterParticipant,
    rollGiveaway,
};
