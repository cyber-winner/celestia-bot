/**
 * Pokemon Spawn Handler — Counts messages and spawns Pokémon every 25 messages.
 * Also handles "celestia catch <name>" prefix command in Discord.
 */
const {
    Events,
    ContainerBuilder,
    TextDisplayBuilder,
    SeparatorBuilder,
    SeparatorSpacingSize,
    MediaGalleryBuilder,
    MediaGalleryItemBuilder,
    ActionRowBuilder,
    ButtonBuilder,
    ButtonStyle,
    MessageFlags,
} = require('discord.js');
const pokemonStore = require('../store/pokemonStore');
const accountStore = require('../store/accountStore');
const { COLORS, getTypeColor, getRankBadge, getRarityTag, errorContainer, successContainer } = require('../utils/componentBuilder');

// Catch queue to prevent race conditions (same as WhatsApp bot)
const catchQueues = {};

module.exports = {
    name: Events.MessageCreate,
    async execute(message, client) {
        if (message.author.bot) return;
        if (!message.guild) return;

        const channelId = message.channel.id;
        const body = message.content?.trim();

        // ─── Handle "celestia catch <name>" prefix command ───
        if (body && body.toLowerCase().startsWith('celestia catch ')) {
            const guessedName = body.slice('celestia catch '.length).trim();
            if (!guessedName) return;

            const userId = await accountStore.resolveUserId(message.author.id);

            // Check for summoned spawn first
            const summonedSpawn = pokemonStore.getSummonedSpawn(channelId);
            if (summonedSpawn) {
                if (summonedSpawn.summonerId !== userId) {
                    const container = errorContainer('Locked', 'Only the summoner can catch a summoned Pokémon!');
                    return message.reply({ components: [container], flags: MessageFlags.IsComponentsV2 });
                }

                const result = await pokemonStore.attemptSummonCatch(channelId, userId, guessedName);
                return handleSummonCatchResult(message, result, summonedSpawn);
            }

            // Normal catch with queue
            if (!catchQueues[channelId]) catchQueues[channelId] = { attempts: [] };
            const queue = catchQueues[channelId];
            queue.attempts.push({ userId, username: message.author.username, guessedName, message });

            if (queue.attempts.length === 1) {
                setTimeout(async () => {
                    const attempts = queue.attempts;
                    delete catchQueues[channelId];

                    if (attempts.length === 0) return;

                    const activeSpawn = pokemonStore.getActiveSpawn(channelId);
                    if (!activeSpawn) {
                        return; // No spawn, silent
                    }

                    const correct = attempts.filter(a => a.guessedName.toLowerCase() === activeSpawn.name.toLowerCase());
                    const incorrect = attempts.filter(a => a.guessedName.toLowerCase() !== activeSpawn.name.toLowerCase());

                    for (const att of incorrect) {
                        const container = errorContainer('Wrong Name', `That's not the right Pokémon!`);
                        att.message.reply({ components: [container], flags: MessageFlags.IsComponentsV2 }).catch(() => {});
                    }

                    if (correct.length === 0) return;

                    if (correct.length === 1) {
                        const player = correct[0];
                        const result = await pokemonStore.attemptCatch(channelId, player.userId, player.guessedName);
                        await handleCatchResult(player.message, result, player.username);
                    } else {
                        // Trainer clash!
                        const winnerIdx = Math.floor(Math.random() * correct.length);
                        const winner = correct[winnerIdx];
                        const losers = correct.filter((_, i) => i !== winnerIdx);
                        const loserNames = losers.map(l => l.username).join(', ');

                        const clashContainer = new ContainerBuilder()
                            .setAccentColor(COLORS.DANGER)
                            .addTextDisplayComponents(new TextDisplayBuilder().setContent(
                                `## ⚔️ TRAINER CLASH!\n\n` +
                                `**${winner.username}** and **${loserNames}** threw Pokéballs at **${activeSpawn.name}** at the same time!\n\n` +
                                `🏆 **${winner.username}** won the clash and secured the catch!\n\n` +
                                `> Other trainers' Pokéballs were refunded.`
                            ));

                        message.channel.send({ components: [clashContainer], flags: MessageFlags.IsComponentsV2 }).catch(() => {});

                        const result = await pokemonStore.attemptCatch(channelId, winner.userId, winner.guessedName);
                        await handleCatchResult(winner.message, result, winner.username);
                    }
                }, 650);
            }
            return;
        }

        // ─── Message counter → spawn every 25 messages ───
        const spawn = pokemonStore.countMessage(channelId);
        if (spawn) {
            const typeColor = getTypeColor(spawn.types);
            const container = new ContainerBuilder().setAccentColor(typeColor);

            container.addTextDisplayComponents(
                new TextDisplayBuilder().setContent(`## 🌿 A wild ${spawn.name} appeared!`)
            );

            if (spawn.cardImage) {
                container.addMediaGalleryComponents(
                    new MediaGalleryBuilder().addItems(
                        new MediaGalleryItemBuilder().setURL(spawn.cardImage)
                    )
                );
            }

            container.addSeparatorComponents(
                new SeparatorBuilder().setSpacing(SeparatorSpacingSize.Small).setDivider(true)
            );

            const typeStr = (spawn.types || []).join(' / ');
            const rankBadge = getRankBadge(spawn.level);
            let rarityText = '';
            if (spawn.isLegendary) rarityText = '👑 **LEGENDARY**';
            else if (spawn.isMythical) rarityText = '✨ **MYTHICAL**';

            container.addTextDisplayComponents(
                new TextDisplayBuilder().setContent(
                    `📊 **Level:** ${spawn.level} — ${rankBadge}\n` +
                    `🔖 **Type:** ${typeStr}\n` +
                    (rarityText ? `⭐ **Rarity:** ${rarityText}\n` : '') +
                    `\n> Type \`celestia catch ${spawn.name}\` to catch it!\n` +
                    `> ⏳ *Fleeing in 2 minutes!*`
                )
            );

            await message.channel.send({ components: [container], flags: MessageFlags.IsComponentsV2 });
            pokemonStore.markSpawnSent(channelId);
        }
    },
};

async function handleCatchResult(msg, result, username) {
    if (result.success) {
        const p = result.pokemon;
        const typeColor = getTypeColor(p.types);
        const rankBadge = getRankBadge(p.level);
        let rarityTag = '⬜ Common';
        if (p.isLegendary) rarityTag = '👑 LEGENDARY';
        else if (p.isMythical) rarityTag = '✨ MYTHICAL';

        const container = new ContainerBuilder().setAccentColor(typeColor);
        container.addTextDisplayComponents(new TextDisplayBuilder().setContent(`## 🎉 Pokémon Captured!`));

        if (p.cardImage) {
            container.addMediaGalleryComponents(new MediaGalleryBuilder().addItems(new MediaGalleryItemBuilder().setURL(p.cardImage)));
        }

        container.addSeparatorComponents(new SeparatorBuilder().setSpacing(SeparatorSpacingSize.Small).setDivider(true));

        let statsText = `👤 **Trainer:** ${username}\n`;
        statsText += `🏷️ **Pokémon:** ${p.name}\n`;
        statsText += `📊 **Level:** ${p.level} — ${rankBadge}\n`;
        statsText += `⭐ **Rarity:** ${rarityTag}\n`;
        statsText += `🔖 **Type:** ${(p.types || []).join(' / ')}\n\n`;
        statsText += `💰 **+${result.coinReward} PokéCoins**`;
        if (result.crystalReward > 0) statsText += ` · 💎 **+${result.crystalReward} Crystals**`;
        statsText += `\n💼 Wallet: ${result.totalCoins.toLocaleString()} coins\n`;
        statsText += `🔴 Pokéballs: ${result.remainingBalls} remaining`;

        container.addTextDisplayComponents(new TextDisplayBuilder().setContent(statsText));

        await msg.reply({ components: [container], flags: MessageFlags.IsComponentsV2 });
    } else if (result.reason === 'no_spawn') {
        // Silent
    } else if (result.reason === 'wrong_name') {
        await msg.reply({ components: [errorContainer('Wrong Name', 'That\'s not the right Pokémon!')], flags: MessageFlags.IsComponentsV2 }).catch(() => {});
    } else if (result.reason === 'no_pokeballs') {
        await msg.reply({ components: [errorContainer('No Pokéballs', 'Buy more at the PokéMart!\n`/pokemart buy item:pokeball`')], flags: MessageFlags.IsComponentsV2 }).catch(() => {});
    } else if (result.reason === 'ball_failed') {
        const container = new ContainerBuilder().setAccentColor(COLORS.WARNING)
            .addTextDisplayComponents(new TextDisplayBuilder().setContent(
                `## 💥 The Pokéball broke!\n\n` +
                `**${result.pokemonName}** broke free!\n🔴 Pokéballs: ${result.remainingBalls}\n\n> Try again!`
            ));
        await msg.reply({ components: [container], flags: MessageFlags.IsComponentsV2 }).catch(() => {});
    } else if (result.reason === 'too_fast') {
        await msg.reply({ components: [errorContainer('Too Fast!', `You tried to catch too quickly! Locked for **${result.lockDuration}s**.`)], flags: MessageFlags.IsComponentsV2 }).catch(() => {});
    } else if (result.reason === 'pokelocked') {
        await msg.reply({ components: [errorContainer('PokéLocked', `Wait **${result.remaining}s** before trying again.`)], flags: MessageFlags.IsComponentsV2 }).catch(() => {});
    } else if (result.reason === 'catch_cooldown') {
        await msg.reply({ components: [errorContainer('Cooldown', `Skip **${result.skipsLeft}** more spawn(s) before catching again.`)], flags: MessageFlags.IsComponentsV2 }).catch(() => {});
    }
}

async function handleSummonCatchResult(msg, result, summonedSpawn) {
    if (result.success) {
        const p = result.pokemon;
        const container = new ContainerBuilder().setAccentColor(COLORS.CELESTIA);
        container.addTextDisplayComponents(new TextDisplayBuilder().setContent(`## 🕯️ Summoned Pokémon Captured!`));
        if (p.cardImage) {
            container.addMediaGalleryComponents(new MediaGalleryBuilder().addItems(new MediaGalleryItemBuilder().setURL(p.cardImage)));
        }
        container.addSeparatorComponents(new SeparatorBuilder().setSpacing(SeparatorSpacingSize.Small).setDivider(true));
        container.addTextDisplayComponents(new TextDisplayBuilder().setContent(
            `🏷️ **${p.name}** (Lv. ${p.level})\n` +
            `🎲 Catch Chance: ${Math.round(result.catchChance * 100)}%\n` +
            `💰 +${result.coinReward} coins\n🔴 Balls: ${result.remainingBalls}`
        ));
        await msg.reply({ components: [container], flags: MessageFlags.IsComponentsV2 });
    } else if (result.reason === 'summon_ball_failed') {
        const container = new ContainerBuilder().setAccentColor(COLORS.WARNING);
        if (result.despawned) {
            container.addTextDisplayComponents(new TextDisplayBuilder().setContent(`## 💔 All Tries Exhausted!\n\n**${result.pokemonName}** vanished!\n🔴 Balls: ${result.remainingBalls}`));
        } else {
            container.addTextDisplayComponents(new TextDisplayBuilder().setContent(
                `## 💥 Ball Broke!\n\n**${result.pokemonName}** broke free!\n🎯 Tries: ${result.triesLeft}/3\n🔴 Balls: ${result.remainingBalls}`
            ));
        }
        await msg.reply({ components: [container], flags: MessageFlags.IsComponentsV2 });
    } else if (result.reason === 'wrong_name') {
        await msg.reply({ components: [errorContainer('Wrong Name', `The summoned Pokémon is **${summonedSpawn.name}**!`)], flags: MessageFlags.IsComponentsV2 });
    } else if (result.reason === 'no_pokeballs') {
        await msg.reply({ components: [errorContainer('Not Enough Balls', `Need 2, have ${result.have}.`)], flags: MessageFlags.IsComponentsV2 });
    }
}
