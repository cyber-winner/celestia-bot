/**
 * Pokemon Spawn Handler — Counts messages and spawns Pokémon every 25 messages.
 * Uses button-based catching with a 5-second delay before the catch button enables.
 * Spawns only in designated channels.
 */
const {
    Events,
    ContainerBuilder,
    TextDisplayBuilder,
    SeparatorBuilder,
    SeparatorSpacingSize,
    SectionBuilder,
    MediaGalleryBuilder,
    MediaGalleryItemBuilder,
    ActionRowBuilder,
    ButtonBuilder,
    ButtonStyle,
    MessageFlags,
    ThumbnailBuilder,
} = require('discord.js');
const pokemonStore = require('../store/pokemonStore');
const accountStore = require('../store/accountStore');
const { COLORS, getTypeColor, getRankBadge, getRarityTag, errorContainer, successContainer } = require('../utils/componentBuilder');

// Catch queue to prevent race conditions
const catchQueues = {};

module.exports = {
    name: Events.MessageCreate,
    async execute(message, client) {
        if (message.author.bot) return;
        if (!message.guild) return;

        const channelId = message.channel.id;

        // ─── Support "celestia catch <pokemon_name>" text catching ───
        const contentLower = message.content.toLowerCase().trim();
        if (contentLower.startsWith('celestia catch')) {
            let guessedName = message.content.slice('celestia catch'.length).trim();
            if (!guessedName) return;

            const dbUserId = await accountStore.resolveUserId(message.author.id);
            const result = await pokemonStore.attemptCatch(channelId, dbUserId, guessedName, false); // false = not button/slash

            if (result.success) {
                const p = result.pokemon;
                const typeColor = getTypeColor(p.types);
                const rankBadge = getRankBadge(p.level);
                let rarityTag = '⬜ Common';
                if (p.isLegendary) rarityTag = '👑 LEGENDARY';
                else if (p.isMythical) rarityTag = '✨ MYTHICAL';

                const container = new ContainerBuilder().setAccentColor(typeColor);
                container.addTextDisplayComponents(new TextDisplayBuilder().setContent(`## 🎉 Pokémon Captured via Chat!`));

                if (p.cardImage) {
                    container.addMediaGalleryComponents(new MediaGalleryBuilder().addItems(new MediaGalleryItemBuilder().setURL(p.cardImage)));
                }

                container.addSeparatorComponents(new SeparatorBuilder().setSpacing(SeparatorSpacingSize.Small).setDivider(true));

                let statsText = `👤 **Trainer:** ${message.author.username}\n`;
                statsText += `🏷️ **Pokémon:** ${p.name}\n`;
                statsText += `📊 **Level:** ${p.level} — ${rankBadge}\n`;
                statsText += `⭐ **Rarity:** ${rarityTag}\n`;
                statsText += `🔖 **Type:** ${(p.types || []).join(' / ')}\n\n`;
                statsText += `💰 **+${result.coinReward} PokéCoins**`;
                if (result.crystalReward > 0) statsText += ` · <:Crystal:1508755711348445214> **+${result.crystalReward} Crystals**`;
                statsText += `\n💼 Wallet: ${result.totalCoins.toLocaleString()} coins\n`;
                statsText += `<:Pokemon:1508753880782209085> Pokéballs: ${result.remainingBalls} remaining`;

                container.addTextDisplayComponents(new TextDisplayBuilder().setContent(statsText));

                await message.reply({ components: [container], flags: MessageFlags.IsComponentsV2 });
            } else {
                const msgs = {
                    no_spawn: "No wild Pokémon is currently spawned in this channel.",
                    wrong_name: "That's not the right Pokémon name!",
                    no_pokeballs: "You don't have enough Pokéballs! Buy more: `/pokemart buy item:pokeball`",
                    too_fast: "You tried to catch too quickly! Try again in a few seconds.",
                    pokelocked: `Wait for the pokelock penalty to expire before catching again.`,
                    catch_cooldown: `Skip some spawns before trying to catch another Pokémon.`,
                    wand_blocked: `🪄 **Hexed!** You are hexed by an Enchanted Wand and cannot catch Pokémon for the next ${result.wandBlockSpawns} global spawns!`,
                };
                
                const msg = `👤 **${message.author.username}**: ${msgs[result.reason] || "Catch attempt failed."}`;
                await message.reply({
                    components: [errorContainer('Catch Failed', msg)],
                    flags: MessageFlags.IsComponentsV2,
                });
            }
            return;
        }

        // ─── Message counter → spawn every 25 messages ───
        const spawn = pokemonStore.countMessage(channelId);
        if (spawn) {
            const typeColor = getTypeColor(spawn.types);

            // ── Build the spawn container ──
            const container = new ContainerBuilder().setAccentColor(typeColor);

            // Title
            container.addTextDisplayComponents(
                new TextDisplayBuilder().setContent(`## 🌿 A wild Pokémon appeared!`)
            );

            container.addSeparatorComponents(
                new SeparatorBuilder().setSpacing(SeparatorSpacingSize.Small).setDivider(true)
            );

            // Pokemon info
            const typeStr = (spawn.types || []).join(' / ');
            const rankBadge = getRankBadge(spawn.level);
            let rarityText = '⬜ Common';
            if (spawn.isLegendary) rarityText = '👑 **LEGENDARY**';
            else if (spawn.isMythical) rarityText = '✨ **MYTHICAL**';

            container.addTextDisplayComponents(
                new TextDisplayBuilder().setContent(
                    `🏷️ **Name:** **${spawn.name}**\n` +
                    `📊 **Level:** ${spawn.level} — ${rankBadge}\n` +
                    `🔖 **Type:** ${typeStr}\n` +
                    `⭐ **Rarity:** ${rarityText}`
                )
            );

            container.addSeparatorComponents(
                new SeparatorBuilder().setSpacing(SeparatorSpacingSize.Small).setDivider(true)
            );

            // Card image
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

            // Description
            if (spawn.description) {
                container.addTextDisplayComponents(
                    new TextDisplayBuilder().setContent(
                        `> *${spawn.description.substring(0, 300)}*`
                    )
                );

                container.addSeparatorComponents(
                    new SeparatorBuilder().setSpacing(SeparatorSpacingSize.Small).setDivider(true)
                );
            }

            // Footer
            container.addTextDisplayComponents(
                new TextDisplayBuilder().setContent(
                    `-# <:Pokemon:1508753880782209085> Click the button below to catch! • ⏳ Button unlocks in 5s • 💨 Fleeing in 2 minutes!`
                )
            );

            // Disabled catch button — will be enabled after 5s
            const catchBtnId = `spawn_catch_${channelId}_${Date.now()}`;
            const row = new ActionRowBuilder().addComponents(
                new ButtonBuilder()
                    .setCustomId(catchBtnId)
                    .setEmoji('🔒')
                    .setLabel('Catch Pokémon')
                    .setStyle(ButtonStyle.Primary)
                    .setDisabled(true),
                new ButtonBuilder()
                    .setCustomId(`spawn_info_${channelId}`)
                    .setEmoji('📋')
                    .setLabel('Details')
                    .setStyle(ButtonStyle.Secondary)
                    .setDisabled(true),
            );

            const sentMsg = await message.channel.send({
                components: [container.addActionRowComponents(row)],
                flags: MessageFlags.IsComponentsV2,
            });
            pokemonStore.markSpawnSent(channelId);

            // Enable button after 5 seconds
            setTimeout(async () => {
                try {
                    const activeSpawn = pokemonStore.getActiveSpawn(channelId);
                    if (!activeSpawn) return; // already caught or expired

                    const enabledRow = new ActionRowBuilder().addComponents(
                        new ButtonBuilder()
                            .setCustomId(`spawn_catch_${channelId}_active`)
                            .setEmoji('<:Pokemon:1508753880782209085>')
                            .setLabel('Catch Pokémon!')
                            .setStyle(ButtonStyle.Success)
                            .setDisabled(false),
                        new ButtonBuilder()
                            .setCustomId(`spawn_info_${channelId}_active`)
                            .setEmoji('📋')
                            .setLabel('Details')
                            .setStyle(ButtonStyle.Secondary)
                            .setDisabled(false),
                    );

                    // Since container was mutated previously with addActionRowComponents, we need to rebuild it or splice it.
                    // For safety, we will just rebuild the container with the exact same content but the new row.
                    
                    const newContainer = new ContainerBuilder().setAccentColor(typeColor);
                    newContainer.addTextDisplayComponents(new TextDisplayBuilder().setContent(`## 🌿 A wild Pokémon appeared!`));
                    newContainer.addSeparatorComponents(new SeparatorBuilder().setSpacing(SeparatorSpacingSize.Small).setDivider(true));
                    newContainer.addTextDisplayComponents(new TextDisplayBuilder().setContent(
                        `🏷️ **Name:** **${spawn.name}**\n` +
                        `📊 **Level:** ${spawn.level} — ${rankBadge}\n` +
                        `🔖 **Type:** ${typeStr}\n` +
                        `⭐ **Rarity:** ${rarityText}`
                    ));
                    newContainer.addSeparatorComponents(new SeparatorBuilder().setSpacing(SeparatorSpacingSize.Small).setDivider(true));
                    if (spawn.cardImage) {
                        newContainer.addMediaGalleryComponents(new MediaGalleryBuilder().addItems(new MediaGalleryItemBuilder().setURL(spawn.cardImage)));
                        newContainer.addSeparatorComponents(new SeparatorBuilder().setSpacing(SeparatorSpacingSize.Small).setDivider(true));
                    }
                    if (spawn.description) {
                        newContainer.addTextDisplayComponents(new TextDisplayBuilder().setContent(`> *${spawn.description.substring(0, 300)}*`));
                        newContainer.addSeparatorComponents(new SeparatorBuilder().setSpacing(SeparatorSpacingSize.Small).setDivider(true));
                    }
                    newContainer.addTextDisplayComponents(new TextDisplayBuilder().setContent(`-# <:Pokemon:1508753880782209085> Click the button below to catch! • 💨 Fleeing in 2 minutes!`));
                    
                    newContainer.addActionRowComponents(enabledRow);

                    await sentMsg.edit({
                        components: [newContainer],
                        flags: MessageFlags.IsComponentsV2,
                    });
                } catch (e) {
                    console.error('[SpawnEnable]', e.message);
                }
            }, 5000);
        }
    },
};
