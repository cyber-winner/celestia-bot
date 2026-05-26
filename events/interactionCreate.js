const {
    Events, MessageFlags, ContainerBuilder, TextDisplayBuilder, SeparatorBuilder,
    SeparatorSpacingSize, SectionBuilder, MediaGalleryBuilder, MediaGalleryItemBuilder,
    ActionRowBuilder, ButtonBuilder, ButtonStyle, StringSelectMenuBuilder,
    StringSelectMenuOptionBuilder, ThumbnailBuilder,
} = require('discord.js');
const pokemonStore = require('../store/pokemonStore');
const economyStore = require('../store/economyStore');
const accountStore = require('../store/accountStore');
const PokemonEntry = require('../models/Pokemon');
const ActiveRaid = require('../models/ActiveRaid');
const { COLORS, getTypeColor, getRankBadge, getRarityTag, errorContainer, successContainer } = require('../utils/componentBuilder');

function logInteractionError(context, err) {
    if (err && (err.code === 10062 || err.code === 40060 || err.message?.includes('Unknown Interaction') || err.message?.includes('Interaction has already been acknowledged'))) {
        console.warn(`⚠️ [${context}] Interaction expired or already acknowledged (${err.code || 'timeout'}).`);
        return;
    }
    console.error(`[${context}]`, err);
}

module.exports = {
    name: Events.InteractionCreate,
    async execute(interaction, client) {

        if (interaction.isChatInputCommand()) {
            const command = client.commands.get(interaction.commandName);
            if (!command) return;

            // Monkey-patch interaction.reply to automatically route to editReply if already deferred/replied
            const originalReply = interaction.reply.bind(interaction);
            interaction.reply = async function (options) {
                if (interaction.deferred || interaction.replied) {
                    return await interaction.editReply(options);
                }
                return await originalReply(options);
            };

            // Defer reply immediately so it never times out (3-second window)
            try {
                if (!interaction.deferred && !interaction.replied) {
                    const isEphemeral = (interaction.commandName === 'connect');
                    await interaction.deferReply({ flags: MessageFlags.IsComponentsV2 | (isEphemeral ? MessageFlags.Ephemeral : 0) });
                }
            } catch (err) {
                logInteractionError(`Auto-Defer /${interaction.commandName}`, err);
            }

            try {
                await command.execute(interaction, client);
            } catch (error) {
                logInteractionError(`Command /${interaction.commandName}`, error);
                const errMsg = { content: '> ❌ There was an error executing this command!', flags: MessageFlags.Ephemeral };
                if (interaction.replied || interaction.deferred) {
                    await interaction.followUp(errMsg).catch(() => { });
                } else {
                    await interaction.reply(errMsg).catch(() => { });
                }
            }
            return;
        }

        if (interaction.isButton()) {
            const customId = interaction.customId;

            // ─── Spawn Catch Button ───
            if (customId.startsWith('spawn_catch_') && customId.endsWith('_active')) {
                return handleSpawnCatch(interaction, client);
            }

            // ─── Spawn Info Button ───
            if (customId.startsWith('spawn_info_') && customId.endsWith('_active')) {
                return handleSpawnInfo(interaction);
            }

            // ─── Spawn Buy & Retry Button ───
            if (customId.startsWith('spawn_buyretry_')) {
                return handleSpawnBuyRetry(interaction, client);
            }

            // ─── Summon Catch Button ───
            if (customId.startsWith('summon_catch_') && customId.endsWith('_active')) {
                return handleSummonCatch(interaction, client);
            }

            // ─── Summon Info Button ───
            if (customId.startsWith('summon_info_') && customId.endsWith('_active')) {
                return handleSummonInfo(interaction);
            }

            // ─── Summon Buy & Retry Button ───
            if (customId.startsWith('summon_buyretry_')) {
                return handleSummonBuyRetry(interaction, client);
            }

            // ─── Raid Join Button ───
            if (customId === 'raid_join') {
                return handleRaidJoin(interaction, client);
            }

            // ─── Raid Buy Pass Button ───
            if (customId === 'raid_buy_pass') {
                return handleRaidBuyPass(interaction, client);
            }

            // ─── Raid Status Button ───
            if (customId === 'raid_status_btn') {
                try {
                    const raidCmd = require('../commands/pokemon/raid');
                    await raidCmd.handleButton(interaction);
                } catch (err) { logInteractionError('Raid Status', err); }
                return;
            }

            // ─── Raid Refresh ───
            if (customId === 'raid_refresh') {
                try {
                    const raidSpawn = require('./raidSpawn');
                    await interaction.deferUpdate();
                    const raidDoc = await ActiveRaid.findOne({});
                    if (raidDoc) {
                        const container = raidSpawn.buildRaidContainer(raidDoc.boss, raidDoc.participants);
                        const buttons = raidSpawn.buildRaidButtons();
                        await interaction.editReply({
                            components: [container, buttons],
                            flags: MessageFlags.IsComponentsV2,
                        });
                    } else {
                        await interaction.editReply({
                            components: [errorContainer('No Active Raid', 'The raid has ended!')],
                            flags: MessageFlags.IsComponentsV2,
                        });
                    }
                } catch (err) { logInteractionError('Raid Refresh', err); }
                return;
            }

            // ─── Pokemon Collection / Market Pagination ───
            if (customId.startsWith('pkmn_') || customId.startsWith('pkdet_') || customId.startsWith('market_page_') || customId.startsWith('market_buy_')) {
                try { const pokemonCmd = require('../commands/pokemon/pokemon'); await pokemonCmd.handleButton(interaction); }
                catch (err) { logInteractionError('Pokemon Button', err); }
                return;
            }

            // ─── Shop Quick Buy / Pagination ───
            if (customId.startsWith('shop_buy_') || customId.startsWith('shop_page_')) {
                try { const shopCmd = require('../commands/pokemon/shop'); await shopCmd.handleButton(interaction); }
                catch (err) { logInteractionError('Shop Button', err); }
                return;
            }

            // ─── Level Orb Retry / Buy & Use ───
            if (customId.startsWith('orb_retry_') || customId.startsWith('orb_buyuse_')) {
                return handleOrbButton(interaction);
            }

            // ─── Wish Again ───
            if (customId.startsWith('wish_') || customId.startsWith('gacha_')) {
                try { const gachaCmd = require('../commands/pokemon/gacha'); await gachaCmd.handleButton(interaction, client); }
                catch (err) { logInteractionError('Wish Button', err); }
                return;
            }

            // ─── Leaderboards ───
            if (customId.startsWith('lb_')) {
                try { const lbCmd = require('../commands/pokemon/leaderboard'); await lbCmd.handleButton(interaction); }
                catch (err) { logInteractionError('Leaderboard Button', err); }
                return;
            }

            // ─── Raid Command Buttons ───
            if (customId.startsWith('raid_')) {
                try { const raidCmd = require('../commands/pokemon/raid'); await raidCmd.handleButton(interaction); }
                catch (err) { logInteractionError('Raid Button', err); }
                return;
            }

            // ─── Ticket System ───
            if (customId === 'ticket_info') {
                const container = new ContainerBuilder()
                    .setAccentColor(0x2ecc71)
                    .addTextDisplayComponents(new TextDisplayBuilder().setContent('## ℹ️  How Tickets Work'))
                    .addSeparatorComponents(new SeparatorBuilder().setSpacing(SeparatorSpacingSize.Small).setDivider(true))
                    .addTextDisplayComponents(new TextDisplayBuilder().setContent(
                        `**1.** Click **Open Ticket** to create your private support channel\n` +
                        `**2.** Describe your issue clearly in the ticket channel\n` +
                        `**3.** Staff will respond as soon as possible\n` +
                        `**4.** The channel will be closed and archived when resolved\n\n` +
                        `> ⚠️ Please only open tickets for genuine issues.`
                    ));
                await interaction.reply({ components: [container], flags: MessageFlags.IsComponentsV2 | MessageFlags.Ephemeral }).catch(() => { });
                return;
            }

            if (customId === 'open_ticket') {
                await interaction.reply({ content: '> 📩 Your ticket is being created... A staff member will be with you shortly.', flags: MessageFlags.Ephemeral }).catch(() => { });
                return;
            }

            if (customId.startsWith('hentai_img:') || customId.startsWith('hentai_vid:')) {
                if (!interaction.channel.nsfw) return interaction.reply({ content: '> 🔞 NSFW channels only!', flags: MessageFlags.Ephemeral });
                try { await interaction.deferUpdate(); } catch (e) { return; }
                const hentaiCmd = require('../commands/nsfw/hentai');
                if (customId.startsWith('hentai_img:')) await hentaiCmd.handleImage(interaction, true).catch(console.error);
                else await hentaiCmd.handleVideo(interaction, true).catch(console.error);
                return;
            }

            if (customId.startsWith('porn_img:') || customId.startsWith('porn_vid:')) {
                if (!interaction.channel.nsfw) return interaction.reply({ content: '> 🔞 NSFW channels only!', flags: MessageFlags.Ephemeral });
                try { await interaction.deferUpdate(); } catch (e) { return; }
                const pornCmd = require('../commands/nsfw/porn');
                if (customId.startsWith('porn_img:')) await pornCmd.handleImage(interaction, true).catch(console.error);
                else await pornCmd.handleVideo(interaction, true).catch(console.error);
                return;
            }

            return;
        }

        if (interaction.isStringSelectMenu()) {
            // ─── Raid Pokemon Select ───
            if (interaction.customId === 'raid_pokemon_select') {
                return handleRaidPokemonSelect(interaction, client);
            }
            return;
        }

        if (interaction.isModalSubmit()) {
            if (interaction.customId.startsWith('shop_modal_')) {
                try { const shopCmd = require('../commands/pokemon/shop'); await shopCmd.handleModal(interaction); }
                catch (err) { console.error('[Shop Modal]', err); }
                return;
            }
        }
    },
};

// ═══════════════════════════════════════════
// SPAWN CATCH — Button-based wild catch with ping tracking
// ═══════════════════════════════════════════

async function handleSpawnCatch(interaction, client) {
    const clickedAt = Date.now();
    const channelId = interaction.channel.id;
    const author = interaction.user;
    const userId = await accountStore.resolveUserId(author.id);

    try {
        await interaction.deferUpdate();
    } catch (error) {
        return; // Interaction expired or already handled
    }

    const spawn = pokemonStore.getActiveSpawn(channelId);
    if (!spawn) {
        return interaction.followUp({
            components: [errorContainer('Too Late!', 'This Pokémon has already fled or been caught!')],
            flags: MessageFlags.IsComponentsV2 | MessageFlags.Ephemeral,
        });
    }

    // ─── Record ping (reaction time in ms) ───
    const reactionTimeMs = clickedAt - spawn.spawnedAt;

    // Auto-catch: button press = correct name
    const result = await pokemonStore.attemptCatch(channelId, userId, spawn.name);

    if (result.success) {
        const p = result.pokemon;
        const typeColor = getTypeColor(p.types);
        const rankBadge = getRankBadge(p.level);
        let rarityTag = '⬜ Common';
        if (p.isLegendary) rarityTag = '👑 LEGENDARY';
        else if (p.isMythical) rarityTag = '✨ MYTHICAL';

        // ── Build premium catch card ──
        const container = new ContainerBuilder().setAccentColor(typeColor);

        // Title: POKÉMON NAME CAUGHT
        container.addTextDisplayComponents(
            new TextDisplayBuilder().setContent(`## 🎉 ${p.name} CAUGHT!`)
        );

        container.addSeparatorComponents(new SeparatorBuilder().setSpacing(SeparatorSpacingSize.Small).setDivider(true));

        // Trainer info with user avatar thumbnail
        const trainerSection = new SectionBuilder();
        trainerSection.addTextDisplayComponents(
            new TextDisplayBuilder().setContent(
                `👤 **Trainer:** ${author.username}\n` +
                `📊 **Level:** ${p.level} — ${rankBadge}\n` +
                `⭐ **Rarity:** ${rarityTag}\n` +
                `🔖 **Type:** ${(p.types || []).join(' / ')}\n` +
                `⏱️ **Ping:** \`${reactionTimeMs.toLocaleString()}ms\``
            )
        );
        trainerSection.setThumbnailAccessory(
            new ThumbnailBuilder().setURL(author.displayAvatarURL({ size: 128 }))
        );
        container.addSectionComponents(trainerSection);

        container.addSeparatorComponents(new SeparatorBuilder().setSpacing(SeparatorSpacingSize.Small).setDivider(true));

        // Pokemon card image
        if (p.cardImage) {
            container.addMediaGalleryComponents(
                new MediaGalleryBuilder().addItems(new MediaGalleryItemBuilder().setURL(p.cardImage))
            );
            container.addSeparatorComponents(new SeparatorBuilder().setSpacing(SeparatorSpacingSize.Small).setDivider(true));
        }

        // Description
        if (p.description) {
            container.addTextDisplayComponents(
                new TextDisplayBuilder().setContent(`> *${p.description.substring(0, 300)}*`)
            );
            container.addSeparatorComponents(new SeparatorBuilder().setSpacing(SeparatorSpacingSize.Small).setDivider(true));
        }

        // Footer: rewards + remaining
        let footerText = `💰 **+${result.coinReward} PokéCoins**`;
        if (result.crystalReward > 0) footerText += ` · <:Crystal:1508755711348445214> **+${result.crystalReward} Crystals**`;
        footerText += `\n💼 Wallet: ${result.totalCoins.toLocaleString()} coins · <:Pokemon:1508753880782209085> Pokéballs: ${result.remainingBalls}`;
        container.addTextDisplayComponents(new TextDisplayBuilder().setContent(footerText));

        // Buttons: Details + Pokemon List
        const row = new ActionRowBuilder().addComponents(
            new ButtonBuilder()
                .setCustomId(`pkdet_${author.id}_${encodeURIComponent(p.name)}`)
                .setEmoji('📋')
                .setLabel('Details')
                .setStyle(ButtonStyle.Secondary),
            new ButtonBuilder()
                .setCustomId(`pkmn_${author.id}_open`)
                .setEmoji('📦')
                .setLabel('Pokémon List')
                .setStyle(ButtonStyle.Secondary),
        );

        // Disable the original spawn message buttons
        try {
            await interaction.message.edit({
                components: [
                    interaction.message.components[0],
                    new ActionRowBuilder().addComponents(
                        new ButtonBuilder().setCustomId('spawn_caught_disabled').setEmoji('✅').setLabel(`Caught by ${author.username}! (${reactionTimeMs.toLocaleString()}ms)`).setStyle(ButtonStyle.Success).setDisabled(true),
                    ),
                ],
                flags: MessageFlags.IsComponentsV2,
            });
        } catch (e) { }

        await interaction.followUp({ components: [container.addActionRowComponents(row)], flags: MessageFlags.IsComponentsV2 });

    } else if (result.reason === 'no_pokeballs') {
        // ── Premium no-pokeball layout ──
        const container = new ContainerBuilder().setAccentColor(COLORS.DANGER);

        container.addTextDisplayComponents(
            new TextDisplayBuilder().setContent(`## <:Pokemon:1508753880782209085> No Pokéballs!`)
        );

        container.addSeparatorComponents(new SeparatorBuilder().setSpacing(SeparatorSpacingSize.Small).setDivider(true));

        // Trainer section with PFP
        const section = new SectionBuilder();
        section.addTextDisplayComponents(
            new TextDisplayBuilder().setContent(
                `👤 **${author.username}**, you have no Pokéballs left!\n\n` +
                `<:Pokemon:1508753880782209085> **Pokéballs:** 0 remaining\n` +
                `⏱️ **Ping:** \`${reactionTimeMs.toLocaleString()}ms\`\n\n` +
                `> Buy 10 Pokéballs for 250 coins and try again!`
            )
        );
        section.setThumbnailAccessory(
            new ThumbnailBuilder().setURL(author.displayAvatarURL({ size: 128 }))
        );
        container.addSectionComponents(section);

        container.addSeparatorComponents(new SeparatorBuilder().setSpacing(SeparatorSpacingSize.Small).setDivider(true));

        container.addTextDisplayComponents(
            new TextDisplayBuilder().setContent(`-# 🛒 The button below will buy Pokéballs and retry the catch automatically.`)
        );

        // Smart button: buy + retry
        const row = new ActionRowBuilder().addComponents(
            new ButtonBuilder()
                .setCustomId(`spawn_buyretry_${channelId}`)
                .setLabel('🛒 Buy Pokéballs & Catch (250 coins)')
                .setStyle(ButtonStyle.Primary),
        );

        await interaction.reply({ components: [container.addActionRowComponents(row)], flags: MessageFlags.IsComponentsV2 | MessageFlags.Ephemeral });

    } else if (result.reason === 'ball_failed') {
        // ── Premium pokeball break layout ──
        const container = new ContainerBuilder().setAccentColor(COLORS.WARNING);

        container.addTextDisplayComponents(
            new TextDisplayBuilder().setContent(`## 💥 Pokéball Break!`)
        );

        container.addSeparatorComponents(new SeparatorBuilder().setSpacing(SeparatorSpacingSize.Small).setDivider(true));

        // Trainer section with PFP thumbnail
        const section = new SectionBuilder();
        section.addTextDisplayComponents(
            new TextDisplayBuilder().setContent(
                `👤 **${author.username}**'s Pokéball shattered!\n\n` +
                `🏷️ **${result.pokemonName}** broke free and is still wild!\n` +
                `<:Pokemon:1508753880782209085> **Pokéballs:** ${result.remainingBalls} remaining\n` +
                `⏱️ **Ping:** \`${reactionTimeMs.toLocaleString()}ms\``
            )
        );
        section.setThumbnailAccessory(
            new ThumbnailBuilder().setURL(author.displayAvatarURL({ size: 128 }))
        );
        container.addSectionComponents(section);

        container.addSeparatorComponents(new SeparatorBuilder().setSpacing(SeparatorSpacingSize.Small).setDivider(true));

        // Smart button: if has balls → "Try Again", if no balls → "Buy & Try"
        let row;
        if (result.remainingBalls > 0) {
            container.addTextDisplayComponents(
                new TextDisplayBuilder().setContent(`-# 🎯 The Pokémon is still there! Click below to try again.`)
            );
            row = new ActionRowBuilder().addComponents(
                new ButtonBuilder()
                    .setCustomId(`spawn_catch_${channelId}_active`)
                    .setEmoji('<:Pokemon:1508753880782209085>')
                    .setLabel('Try Again!')
                    .setStyle(ButtonStyle.Success),
            );
        } else {
            container.addTextDisplayComponents(
                new TextDisplayBuilder().setContent(`-# 🛒 No balls left! Buy Pokéballs and retry automatically.`)
            );
            row = new ActionRowBuilder().addComponents(
                new ButtonBuilder()
                    .setCustomId(`spawn_buyretry_${channelId}`)
                    .setEmoji('<:Pokemon:1508753880782209085>')
                    .setLabel('Buy Pokéballs & Catch (250 coins)')
                    .setStyle(ButtonStyle.Primary),
            );
        }

        await interaction.followUp({ components: [container.addActionRowComponents(row)], flags: MessageFlags.IsComponentsV2 | MessageFlags.Ephemeral });

    } else if (result.reason === 'catch_cooldown') {
        await interaction.followUp({
            components: [errorContainer('Cooldown', `Skip **${result.skipsLeft}** more spawn(s) before catching again.\n⏱️ Ping: \`${reactionTimeMs.toLocaleString()}ms\``)],
            flags: MessageFlags.IsComponentsV2 | MessageFlags.Ephemeral,
        });
    } else {
        await interaction.followUp({
            components: [errorContainer('Failed', `Catch attempt failed.\n⏱️ Ping: \`${reactionTimeMs.toLocaleString()}ms\``)],
            flags: MessageFlags.IsComponentsV2 | MessageFlags.Ephemeral,
        });
    }
}

async function handleSpawnInfo(interaction) {
    const channelId = interaction.channel.id;
    const spawn = pokemonStore.getActiveSpawn(channelId);
    if (!spawn) {
        return interaction.reply({
            components: [errorContainer('No Spawn', 'No active Pokémon in this channel.')],
            flags: MessageFlags.IsComponentsV2 | MessageFlags.Ephemeral,
        });
    }

    const typeColor = getTypeColor(spawn.types);
    const container = new ContainerBuilder().setAccentColor(typeColor);
    container.addTextDisplayComponents(new TextDisplayBuilder().setContent(`## 📋 Wild Pokémon Details`));
    container.addSeparatorComponents(new SeparatorBuilder().setSpacing(SeparatorSpacingSize.Small).setDivider(true));

    let info = `📊 **Level:** ${spawn.level} — ${getRankBadge(spawn.level)}\n`;
    info += `🔖 **Type:** ${(spawn.types || []).join(' / ')}\n`;
    if (spawn.genus) info += `📖 **Species:** ${spawn.genus}\n`;
    if (spawn.baseStats) {
        const bs = spawn.baseStats;
        info += `\n**Base Stats:**\n`;
        info += `> ATK: \`${bs.atk}\` · DEF: \`${bs.def}\` · SPD: \`${bs.speed}\`\n`;
        info += `> SP.ATK: \`${bs.spAtk}\` · SP.DEF: \`${bs.spDef}\` · HP: \`${bs.hp}\`\n`;
    }

    container.addTextDisplayComponents(new TextDisplayBuilder().setContent(info));
    await interaction.reply({ components: [container], flags: MessageFlags.IsComponentsV2 | MessageFlags.Ephemeral });
}

// ═══════════════════════════════════════════
// SPAWN BUY & RETRY — Smart button: buys pokeballs then auto-retries catch
// ═══════════════════════════════════════════

async function handleSpawnBuyRetry(interaction, client) {
    const channelId = interaction.channel.id;
    const author = interaction.user;
    const userId = await accountStore.resolveUserId(author.id);

    try { await interaction.deferUpdate(); } catch (e) { return; }

    // Check spawn still active
    const spawn = pokemonStore.getActiveSpawn(channelId);
    if (!spawn) {
        return interaction.followUp({
            components: [errorContainer('Too Late!', 'The Pokémon has already fled or been caught!')],
            flags: MessageFlags.IsComponentsV2 | MessageFlags.Ephemeral,
        });
    }

    // Check if player already has balls (maybe they bought some via mart already)
    const currentBal = await economyStore.getBalance(userId);
    if (currentBal.pokeballs <= 0) {
        // Need to buy — attempt purchase (10 pokeballs for 250 coins)
        const buyResult = await economyStore.buyItem(userId, 'pokeball', 1);
        if (!buyResult.success) {
            const container = new ContainerBuilder().setAccentColor(COLORS.DANGER);
            container.addTextDisplayComponents(new TextDisplayBuilder().setContent(`## 💸 Not Enough Coins!`));
            container.addSeparatorComponents(new SeparatorBuilder().setSpacing(SeparatorSpacingSize.Small).setDivider(true));

            const section = new SectionBuilder();
            section.addTextDisplayComponents(
                new TextDisplayBuilder().setContent(
                    `👤 **${author.username}**, you can't afford Pokéballs!\n\n` +
                    `💰 **Need:** 250 PokéCoins\n` +
                    `💰 **Have:** ${(buyResult.have || 0).toLocaleString()} PokéCoins\n\n` +
                    `> Earn more coins by catching Pokémon or claiming \`/daily\`!`
                )
            );
            section.setThumbnailAccessory(new ThumbnailBuilder().setURL(author.displayAvatarURL({ size: 128 })));
            container.addSectionComponents(section);

            return interaction.reply({ components: [container], flags: MessageFlags.IsComponentsV2 | MessageFlags.Ephemeral });
        }
    }

    // Now attempt the catch
    const result = await pokemonStore.attemptCatch(channelId, userId, spawn.name);
    const reactionTimeMs = Date.now() - spawn.spawnedAt;

    if (result.success) {
        const p = result.pokemon;
        const typeColor = getTypeColor(p.types);
        const rankBadge = getRankBadge(p.level);
        let rarityTag = '⬜ Common';
        if (p.isLegendary) rarityTag = '👑 LEGENDARY';
        else if (p.isMythical) rarityTag = '✨ MYTHICAL';

        const container = new ContainerBuilder().setAccentColor(typeColor);
        container.addTextDisplayComponents(new TextDisplayBuilder().setContent(`## 🎉 ${p.name} CAUGHT!`));
        container.addSeparatorComponents(new SeparatorBuilder().setSpacing(SeparatorSpacingSize.Small).setDivider(true));

        const section = new SectionBuilder();
        section.addTextDisplayComponents(
            new TextDisplayBuilder().setContent(
                `👤 **Trainer:** ${author.username}\n` +
                `📊 **Level:** ${p.level} — ${rankBadge}\n` +
                `⭐ **Rarity:** ${rarityTag}\n` +
                `🔖 **Type:** ${(p.types || []).join(' / ')}\n` +
                `⏱️ **Ping:** \`${reactionTimeMs.toLocaleString()}ms\``
            )
        );
        section.setThumbnailAccessory(new ThumbnailBuilder().setURL(author.displayAvatarURL({ size: 128 })));
        container.addSectionComponents(section);

        container.addSeparatorComponents(new SeparatorBuilder().setSpacing(SeparatorSpacingSize.Small).setDivider(true));

        if (p.cardImage) {
            container.addMediaGalleryComponents(
                new MediaGalleryBuilder().addItems(new MediaGalleryItemBuilder().setURL(p.cardImage))
            );
            container.addSeparatorComponents(new SeparatorBuilder().setSpacing(SeparatorSpacingSize.Small).setDivider(true));
        }

        if (p.description) {
            container.addTextDisplayComponents(new TextDisplayBuilder().setContent(`> *${p.description.substring(0, 300)}*`));
            container.addSeparatorComponents(new SeparatorBuilder().setSpacing(SeparatorSpacingSize.Small).setDivider(true));
        }

        let footerText = `💰 **+${result.coinReward} PokéCoins**`;
        if (result.crystalReward > 0) footerText += ` · <:Crystal:1508755711348445214> **+${result.crystalReward} Crystals**`;
        footerText += `\n💼 Wallet: ${result.totalCoins.toLocaleString()} coins · <:Pokemon:1508753880782209085> Pokéballs: ${result.remainingBalls}`;
        container.addTextDisplayComponents(new TextDisplayBuilder().setContent(footerText));

        const row = new ActionRowBuilder().addComponents(
            new ButtonBuilder()
                .setCustomId(`pkdet_${author.id}_${encodeURIComponent(p.name)}`)
                .setEmoji('📋')
                .setLabel('Details')
                .setStyle(ButtonStyle.Secondary),
            new ButtonBuilder()
                .setCustomId(`pkmn_${author.id}_open`)
                .setEmoji('📦')
                .setLabel('Pokémon List')
                .setStyle(ButtonStyle.Secondary),
        );

        await interaction.reply({ components: [container.addActionRowComponents(row)], flags: MessageFlags.IsComponentsV2 });
    } else if (result.reason === 'ball_failed') {
        // Ball broke again — show same premium layout with smart button
        const container = new ContainerBuilder().setAccentColor(COLORS.WARNING);
        container.addTextDisplayComponents(new TextDisplayBuilder().setContent(`## 💥 Pokéball Break!`));
        container.addSeparatorComponents(new SeparatorBuilder().setSpacing(SeparatorSpacingSize.Small).setDivider(true));

        const section = new SectionBuilder();
        section.addTextDisplayComponents(
            new TextDisplayBuilder().setContent(
                `👤 **${author.username}**'s Pokéball shattered again!\n\n` +
                `🏷️ **${result.pokemonName}** broke free!\n` +
                `<:Pokemon:1508753880782209085> **Pokéballs:** ${result.remainingBalls} remaining`
            )
        );
        section.setThumbnailAccessory(new ThumbnailBuilder().setURL(author.displayAvatarURL({ size: 128 })));
        container.addSectionComponents(section);

        container.addSeparatorComponents(new SeparatorBuilder().setSpacing(SeparatorSpacingSize.Small).setDivider(true));

        let row;
        if (result.remainingBalls > 0) {
            container.addTextDisplayComponents(new TextDisplayBuilder().setContent(`-# 🎯 Try again!`));
            row = new ActionRowBuilder().addComponents(
                new ButtonBuilder().setCustomId(`spawn_catch_${channelId}_active`).setEmoji('<:Pokemon:1508753880782209085>').setLabel('Try Again!').setStyle(ButtonStyle.Success),
            );
        } else {
            container.addTextDisplayComponents(new TextDisplayBuilder().setContent(`-# 🛒 No balls left! Buy more and retry.`));
            row = new ActionRowBuilder().addComponents(
                new ButtonBuilder().setCustomId(`spawn_buyretry_${channelId}`).setEmoji('<:Pokemon:1508753880782209085>').setLabel('Buy Pokéballs & Catch (250 coins)').setStyle(ButtonStyle.Primary),
            );
        }

        await interaction.reply({ components: [container.addActionRowComponents(row)], flags: MessageFlags.IsComponentsV2 | MessageFlags.Ephemeral });
    } else {
        // Any other failure
        await interaction.reply({
            components: [errorContainer('Failed', `Catch failed: ${result.reason}`)],
            flags: MessageFlags.IsComponentsV2 | MessageFlags.Ephemeral,
        });
    }
}

// ═══════════════════════════════════════════
// RAID JOIN — Ephemeral flow: check pass → buy → select pokemon → join
// ═══════════════════════════════════════════

async function handleRaidJoin(interaction, client) {
    const author = interaction.user;
    const userId = await accountStore.resolveUserId(author.id);

    const raidDoc = await ActiveRaid.findOne({});
    if (!raidDoc) {
        return interaction.reply({
            components: [errorContainer('No Raid', 'No active raid right now!')],
            flags: MessageFlags.IsComponentsV2 | MessageFlags.Ephemeral,
        });
    }

    // Already entered?
    const already = raidDoc.participants.find(p => p.userId === userId);
    if (already) {
        return interaction.reply({
            components: [errorContainer('Already Entered', `You're already in this raid with **${already.pokemonName}**!`)],
            flags: MessageFlags.IsComponentsV2 | MessageFlags.Ephemeral,
        });
    }

    // Check raid pass
    const inventory = await economyStore.getInventory(userId);
    const raidPass = inventory.items.find(i => i.itemName === 'Raid Pass' && i.quantity > 0);

    if (!raidPass) {
        // ── No pass → offer to buy ──
        const balance = await economyStore.getBalance(userId);
        const container = new ContainerBuilder().setAccentColor(COLORS.WARNING);
        container.addTextDisplayComponents(new TextDisplayBuilder().setContent(`## <a:RaidPasses:1508756029259911239> No Raid Pass!`));
        container.addSeparatorComponents(new SeparatorBuilder().setSpacing(SeparatorSpacingSize.Small).setDivider(true));
        container.addTextDisplayComponents(new TextDisplayBuilder().setContent(
            `You need a **Raid Pass** to enter raids.\n\n` +
            `🏷️ **Price:** 2,000 PokéCoins\n` +
            `💰 **Your Balance:** ${balance.pokecoins.toLocaleString()} coins\n\n` +
            (balance.pokecoins >= 2000
                ? `> ✅ You can afford it! Click below to buy.`
                : `> ❌ Not enough coins! Earn more by catching Pokémon.`)
        ));

        const row = new ActionRowBuilder().addComponents(
            new ButtonBuilder()
                .setCustomId('raid_buy_pass')
                .setEmoji('<a:RaidPasses:1508756029259911239>')
                .setLabel('Buy Raid Pass (2,000 coins)')
                .setStyle(ButtonStyle.Primary)
                .setDisabled(balance.pokecoins < 2000),
        );

        return interaction.reply({
            components: [container.addActionRowComponents(row)],
            flags: MessageFlags.IsComponentsV2 | MessageFlags.Ephemeral,
        });
    }

    // ── Has pass → show pokemon select ──
    return showPokemonSelect(interaction, userId);
}

async function showPokemonSelect(interaction, userId) {
    const entries = await PokemonEntry.find({ userId }).sort({ level: -1 }).limit(25);

    if (entries.length === 0) {
        return interaction.reply({
            components: [errorContainer('No Pokémon', 'You need to catch some Pokémon first!')],
            flags: MessageFlags.IsComponentsV2 | MessageFlags.Ephemeral,
        });
    }

    const container = new ContainerBuilder().setAccentColor(COLORS.RAID);
    container.addTextDisplayComponents(new TextDisplayBuilder().setContent(`## ⚔️ Select Your Fighter`));
    container.addSeparatorComponents(new SeparatorBuilder().setSpacing(SeparatorSpacingSize.Small).setDivider(true));
    container.addTextDisplayComponents(new TextDisplayBuilder().setContent(
        `Choose a Pokémon to send into the raid!\n` +
        `> Higher level = more damage dealt.\n` +
        `> Your Raid Pass will be consumed upon entry.`
    ));

    // Build unique pokemon options (deduplicate by name, keep highest level)
    const seen = new Map();
    for (const e of entries) {
        if (!seen.has(e.pokemonName)) {
            seen.set(e.pokemonName, e);
        }
    }

    const options = [];
    for (const [name, entry] of seen) {
        if (options.length >= 25) break;
        const rankBadge = getRankBadge(entry.level);
        options.push(
            new StringSelectMenuOptionBuilder()
                .setLabel(`${name} (Lv. ${entry.level})`)
                .setDescription(`${rankBadge}`)
                .setValue(name)
        );
    }

    const selectRow = new ActionRowBuilder().addComponents(
        new StringSelectMenuBuilder()
            .setCustomId('raid_pokemon_select')
            .setPlaceholder('Choose your fighter Pokémon...')
            .addOptions(options)
    );

    const replied = interaction.replied || interaction.deferred;
    if (replied) {
        await interaction.followUp({ components: [container.addActionRowComponents(selectRow)], flags: MessageFlags.IsComponentsV2 | MessageFlags.Ephemeral });
    } else {
        await interaction.reply({ components: [container.addActionRowComponents(selectRow)], flags: MessageFlags.IsComponentsV2 | MessageFlags.Ephemeral });
    }
}

async function handleRaidBuyPass(interaction, client) {
    const author = interaction.user;
    const userId = await accountStore.resolveUserId(author.id);

    const result = await economyStore.buyItem(userId, 'raid pass', 1);

    if (!result.success) {
        return interaction.reply({
            components: [errorContainer('Purchase Failed', `Not enough coins! Need 2,000, have ${result.have?.toLocaleString() || 0}.`)],
            flags: MessageFlags.IsComponentsV2 | MessageFlags.Ephemeral,
        });
    }

    const container = new ContainerBuilder().setAccentColor(COLORS.SUCCESS);
    container.addTextDisplayComponents(new TextDisplayBuilder().setContent(`## ✅ Raid Pass Purchased!`));
    container.addSeparatorComponents(new SeparatorBuilder().setSpacing(SeparatorSpacingSize.Small).setDivider(true));
    container.addTextDisplayComponents(new TextDisplayBuilder().setContent(
        `<a:RaidPasses:1508756029259911239> **Raid Pass** ×1 acquired!\n` +
        `💰 Remaining: ${result.newBalance.toLocaleString()} coins\n\n` +
        `> Now select your fighter Pokémon below.`
    ));

    await interaction.reply({
        components: [container],
        flags: MessageFlags.IsComponentsV2 | MessageFlags.Ephemeral,
    });

    // Immediately show pokemon select
    await showPokemonSelect(interaction, userId);
}

async function handleRaidPokemonSelect(interaction, client) {
    const author = interaction.user;
    const userId = await accountStore.resolveUserId(author.id);
    const pokemonName = interaction.values[0];

    const raidDoc = await ActiveRaid.findOne({});
    if (!raidDoc) {
        return interaction.reply({
            components: [errorContainer('No Raid', 'The raid has ended!')],
            flags: MessageFlags.IsComponentsV2 | MessageFlags.Ephemeral,
        });
    }

    const already = raidDoc.participants.find(p => p.userId === userId);
    if (already) {
        return interaction.reply({
            components: [errorContainer('Already Entered', 'You already joined this raid!')],
            flags: MessageFlags.IsComponentsV2 | MessageFlags.Ephemeral,
        });
    }

    // Check raid pass again
    const inventory = await economyStore.getInventory(userId);
    const raidPass = inventory.items.find(i => i.itemName === 'Raid Pass' && i.quantity > 0);
    if (!raidPass) {
        return interaction.reply({
            components: [errorContainer('No Raid Pass', 'Your Raid Pass is missing! Buy one first.')],
            flags: MessageFlags.IsComponentsV2 | MessageFlags.Ephemeral,
        });
    }

    // Check pokemon ownership
    const ownedPokemon = await PokemonEntry.findOne({
        userId,
        pokemonName: { $regex: new RegExp(`^${pokemonName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`, 'i') }
    }).sort({ level: -1 });

    if (!ownedPokemon) {
        return interaction.reply({
            components: [errorContainer('Not Found', `You don't own **${pokemonName}**!`)],
            flags: MessageFlags.IsComponentsV2 | MessageFlags.Ephemeral,
        });
    }

    // Consume raid pass
    await economyStore.removeInventoryItem(userId, 'Raid Pass', 1);

    // Load pokemon data & build fighter
    const pkmnData = pokemonStore.getStaticData(ownedPokemon.pokemonName) || {
        hp: 70, baseStats: { atk: 60, def: 55, speed: 50 }, types: ['Normal'],
        attacks: [{ name: 'Tackle', power: 40, type: 'Normal' }]
    };

    const scale = (base, lvl) => Math.floor(base * (1 + lvl / 50));
    const maxHp = scale(parseInt(pkmnData.hp || 70), ownedPokemon.level);
    const displayName = `${author.username} [Discord]`;

    const newParticipant = {
        userId,
        senderName: displayName,
        pokemonName: ownedPokemon.pokemonName,
        damageDealt: 0,
        tries: 1,
        joinOrder: Date.now(),
        fighter: {
            name: ownedPokemon.pokemonName,
            level: ownedPokemon.level,
            maxHp, hp: maxHp,
            atk: scale(pkmnData.baseStats?.atk || 60, ownedPokemon.level),
            def: scale(pkmnData.baseStats?.def || 55, ownedPokemon.level),
            speed: scale(pkmnData.baseStats?.speed || 50, ownedPokemon.level),
            types: pkmnData.types || ['Normal'],
            attacks: pkmnData.attacks || [{ name: 'Tackle', power: 40, type: 'Normal' }],
        },
    };

    await ActiveRaid.findOneAndUpdate({}, { $push: { participants: newParticipant } });

    // ── Build confirmation ephemeral ──
    const container = new ContainerBuilder().setAccentColor(COLORS.SUCCESS);
    container.addTextDisplayComponents(new TextDisplayBuilder().setContent(`## <a:RaidPasses:1508756029259911239> Raid Entry Confirmed!`));
    container.addSeparatorComponents(new SeparatorBuilder().setSpacing(SeparatorSpacingSize.Small).setDivider(true));

    const section = new SectionBuilder();
    section.addTextDisplayComponents(
        new TextDisplayBuilder().setContent(
            `⚔️ **Fighter:** ${ownedPokemon.pokemonName} (Lv. ${ownedPokemon.level})\n` +
            `❤️ **HP:** ${maxHp}\n` +
            `⚔️ **ATK:** ${newParticipant.fighter.atk} · 🛡️ **DEF:** ${newParticipant.fighter.def}\n\n` +
            `> You've joined the Global Raid! Good luck, trainer!`
        )
    );
    section.setThumbnailAccessory(new ThumbnailBuilder().setURL(author.displayAvatarURL({ size: 128 })));
    container.addSectionComponents(section);

    await interaction.reply({ components: [container], flags: MessageFlags.IsComponentsV2 | MessageFlags.Ephemeral });

    // Update the raid message with new participant
    try {
        const raidSpawn = require('./raidSpawn');
        await raidSpawn.updateRaidMessage(client);
    } catch (e) { console.error('[Raid] Update after join:', e.message); }
}

// ═══════════════════════════════════════════
// LEVEL ORB BUTTON HANDLER
// ═══════════════════════════════════════════

async function handleOrbButton(interaction) {
    const customId = interaction.customId;
    const isRetry = customId.startsWith('orb_retry_');
    const isBuyUse = customId.startsWith('orb_buyuse_');

    if (!isRetry && !isBuyUse) return;

    const pokemonName = customId.replace('orb_retry_', '').replace('orb_buyuse_', '').replace(/_/g, ' ');
    const author = interaction.user;
    const userId = await accountStore.resolveUserId(author.id);

    // If it's a buy and use button, buy the orb first
    if (isBuyUse) {
        const buyResult = await economyStore.buyItem(userId, 'level orb', 1);
        if (!buyResult.success) {
            return interaction.reply({
                components: [errorContainer('Not Enough Coins', 'You do not have 800 PokéCoins to buy a Level Orb!')],
                flags: MessageFlags.IsComponentsV2 | MessageFlags.Ephemeral,
            });
        }
    }

    const pokeuse = require('../commands/pokemon/pokeuse');
    // Defer the interaction immediately to prevent timeout
    try { await interaction.deferUpdate(); } catch (e) { return; }

    try {
        await pokeuse.handleLevelOrb(interaction, userId, pokemonName, author);
    } catch (err) {
        console.error('[Orb Button]', err);
    }
}

async function handleSummonCatch(interaction, client) {
    const clickedAt = Date.now();
    const channelId = interaction.channel.id;
    const author = interaction.user;
    const userId = await accountStore.resolveUserId(author.id);

    try {
        await interaction.deferUpdate();
    } catch (error) {
        return; // Interaction expired or already handled
    }

    const summon = pokemonStore.getSummonedSpawn(channelId);
    if (!summon) {
        return interaction.followUp({
            components: [errorContainer('Too Late!', 'The summoned Pokémon has vanished or already been caught!')],
            flags: MessageFlags.IsComponentsV2,
        });
    }

    if (summon.summonerId !== userId) {
        return interaction.followUp({
            components: [errorContainer('Locked', `👤 **${author.username}**: Only the summoner can catch a summoned Pokémon!`)],
            flags: MessageFlags.IsComponentsV2,
        });
    }

    // Call attemptSummonCatch
    const result = await pokemonStore.attemptSummonCatch(channelId, userId, summon.name);

    if (result.success) {
        const p = result.pokemon;
        const typeColor = getTypeColor(p.types);
        const rankBadge = getRankBadge(p.level);
        let rarityTag = '⬜ Common';
        if (p.isLegendary) rarityTag = '👑 LEGENDARY';
        else if (p.isMythical) rarityTag = '✨ MYTHICAL';

        // Build premium catch card
        const container = new ContainerBuilder().setAccentColor(typeColor);
        container.addTextDisplayComponents(
            new TextDisplayBuilder().setContent(`## 🎉 ${p.name} CAUGHT!`)
        );
        container.addSeparatorComponents(new SeparatorBuilder().setSpacing(SeparatorSpacingSize.Small).setDivider(true));

        const trainerSection = new SectionBuilder();
        trainerSection.addTextDisplayComponents(
            new TextDisplayBuilder().setContent(
                `👤 **Trainer:** ${author.username}\n` +
                `📊 **Level:** ${p.level} — ${rankBadge}\n` +
                `⭐ **Rarity:** ${rarityTag}\n` +
                `🔖 **Type:** ${(p.types || []).join(' / ')}\n` +
                `🎲 **Catch Chance:** ${Math.round(result.catchChance * 100)}%`
            )
        );
        trainerSection.setThumbnailAccessory(
            new ThumbnailBuilder().setURL(author.displayAvatarURL({ size: 128 }))
        );
        container.addSectionComponents(trainerSection);
        container.addSeparatorComponents(new SeparatorBuilder().setSpacing(SeparatorSpacingSize.Small).setDivider(true));

        if (p.cardImage) {
            container.addMediaGalleryComponents(
                new MediaGalleryBuilder().addItems(new MediaGalleryItemBuilder().setURL(p.cardImage))
            );
            container.addSeparatorComponents(new SeparatorBuilder().setSpacing(SeparatorSpacingSize.Small).setDivider(true));
        }

        if (p.description) {
            container.addTextDisplayComponents(
                new TextDisplayBuilder().setContent(`> *${p.description.substring(0, 300)}*`)
            );
            container.addSeparatorComponents(new SeparatorBuilder().setSpacing(SeparatorSpacingSize.Small).setDivider(true));
        }

        // Footer
        let footerText = `💰 **+${result.coinReward} PokéCoins**`;
        footerText += `\n💼 Wallet: ${result.totalCoins.toLocaleString()} coins · <:Pokemon:1508753880782209085> Pokéballs: ${result.remainingBalls}`;
        container.addTextDisplayComponents(new TextDisplayBuilder().setContent(footerText));

        // Details / Pokemon List buttons
        const row = new ActionRowBuilder().addComponents(
            new ButtonBuilder()
                .setCustomId(`pkdet_${author.id}_${encodeURIComponent(p.name)}`)
                .setEmoji('📋')
                .setLabel('Details')
                .setStyle(ButtonStyle.Secondary),
            new ButtonBuilder()
                .setCustomId(`pkmn_${author.id}_open`)
                .setEmoji('📦')
                .setLabel('Pokémon List')
                .setStyle(ButtonStyle.Secondary),
        );

        // Edit the original summoning message
        try {
            await interaction.message.edit({
                components: [
                    new ActionRowBuilder().addComponents(
                        new ButtonBuilder().setCustomId('summon_caught_disabled').setEmoji('✅').setLabel(`Caught by ${author.username}!`).setStyle(ButtonStyle.Success).setDisabled(true),
                    ),
                ],
                flags: MessageFlags.IsComponentsV2,
            });
        } catch (e) {}

        await interaction.followUp({ components: [container.addActionRowComponents(row)], flags: MessageFlags.IsComponentsV2 });
    } else {
        // Failed attempt
        if (result.reason === 'no_pokeballs') {
            const container = new ContainerBuilder().setAccentColor(COLORS.DANGER);
            container.addTextDisplayComponents(
                new TextDisplayBuilder().setContent(`## <:Pokemon:1508753880782209085> No Pokéballs!`)
            );
            container.addSeparatorComponents(new SeparatorBuilder().setSpacing(SeparatorSpacingSize.Small).setDivider(true));

            const section = new SectionBuilder();
            section.addTextDisplayComponents(
                new TextDisplayBuilder().setContent(
                    `👤 **${author.username}**, you don't have enough Pokéballs to catch this summoned Pokémon!\n\n` +
                    `<:Pokemon:1508753880782209085> **Pokéballs:** ${result.have} remaining (2 needed)\n\n` +
                    `> Buy 10 Pokéballs for 250 coins and try again!`
                )
            );
            section.setThumbnailAccessory(
                new ThumbnailBuilder().setURL(author.displayAvatarURL({ size: 128 }))
            );
            container.addSectionComponents(section);
            container.addSeparatorComponents(new SeparatorBuilder().setSpacing(SeparatorSpacingSize.Small).setDivider(true));

            const buyRow = new ActionRowBuilder().addComponents(
                new ButtonBuilder()
                    .setCustomId(`summon_buyretry_${channelId}`)
                    .setEmoji('🛒')
                    .setLabel('Buy 10 Pokéballs & Retry')
                    .setStyle(ButtonStyle.Success),
            );

            await interaction.followUp({ components: [container.addActionRowComponents(buyRow)], flags: MessageFlags.IsComponentsV2 });
        } else if (result.reason === 'summon_ball_failed') {
            // Broke free or vanished
            if (result.despawned) {
                // Vanished! Disable original summon buttons
                try {
                    await interaction.message.edit({
                        components: [
                            new ActionRowBuilder().addComponents(
                                new ButtonBuilder().setCustomId('summon_vanished_disabled').setEmoji('💨').setLabel('Vanished!').setStyle(ButtonStyle.Danger).setDisabled(true),
                            ),
                        ],
                        flags: MessageFlags.IsComponentsV2,
                    });
                } catch (e) {}

                const container = errorContainer('Vanished', `👤 **${author.username}**: The summoned **${result.pokemonName}** broke free and vanished!\n<:Pokemon:1508753880782209085> Pokéballs remaining: ${result.remainingBalls}`);
                await interaction.followUp({ components: [container], flags: MessageFlags.IsComponentsV2 });
            } else {
                // Broke free but tries remain. We edit the original summon message to update tries left!
                const typeColor = getTypeColor(summon.types);
                const updatedContainer = new ContainerBuilder().setAccentColor(COLORS.CELESTIA)
                    .addTextDisplayComponents(new TextDisplayBuilder().setContent(`## <a:candle:1508754473680502855> Summoning Ritual`))
                    .addSeparatorComponents(new SeparatorBuilder().setSpacing(SeparatorSpacingSize.Small).setDivider(true));

                if (summon.cardImage) {
                    updatedContainer.addMediaGalleryComponents(new MediaGalleryBuilder().addItems(new MediaGalleryItemBuilder().setURL(summon.cardImage)));
                    updatedContainer.addSeparatorComponents(new SeparatorBuilder().setSpacing(SeparatorSpacingSize.Small).setDivider(true));
                }

                const section = new SectionBuilder();
                section.addTextDisplayComponents(
                    new TextDisplayBuilder().setContent(
                        `👤 **Summoner:** ${author.username}\n\n` +
                        `🏷️ **${summon.name}** has answered the call!\n` +
                        `📊 **Level:** ${summon.level}\n` +
                        `🔖 **Type:** ${(summon.types || []).join(' / ')}\n\n` +
                        `🎯 **Tries:** ${result.triesLeft}/3 · **Cost:** 2 balls per try\n\n` +
                        `> Only the summoner can catch this Pokémon.`
                    )
                );
                section.setThumbnailAccessory(new ThumbnailBuilder().setURL(author.displayAvatarURL({ size: 128 })));
                updatedContainer.addSectionComponents(section);

                const catchRow = new ActionRowBuilder().addComponents(
                    new ButtonBuilder()
                        .setCustomId(`summon_catch_${channelId}_active`)
                        .setEmoji('<:Pokemon:1508753880782209085>')
                        .setLabel(`Catch Pokémon! (${result.triesLeft} left)`)
                        .setStyle(ButtonStyle.Success),
                    new ButtonBuilder()
                        .setCustomId(`summon_info_${channelId}_active`)
                        .setEmoji('📋')
                        .setLabel('Details')
                        .setStyle(ButtonStyle.Secondary)
                );

                try {
                    await interaction.message.edit({
                        components: [updatedContainer.addActionRowComponents(catchRow)],
                        flags: MessageFlags.IsComponentsV2,
                    });
                } catch (e) {}

                const failContainer = errorContainer('Broke Free', `👤 **${author.username}**: The summoned **${result.pokemonName}** broke free!\n🎯 Tries Left: ${result.triesLeft}/3 · <:Pokemon:1508753880782209085> Pokéballs: ${result.remainingBalls}`);
                await interaction.followUp({ components: [failContainer], flags: MessageFlags.IsComponentsV2 });
            }
        }
    }
}

async function handleSummonInfo(interaction) {
    const channelId = interaction.channel.id;
    const summon = pokemonStore.getSummonedSpawn(channelId);
    if (!summon) {
        return interaction.reply({
            components: [errorContainer('No Summon', 'No active summoned Pokémon in this channel.')],
            flags: MessageFlags.IsComponentsV2 | MessageFlags.Ephemeral,
        });
    }

    const typeColor = getTypeColor(summon.types);
    const container = new ContainerBuilder().setAccentColor(typeColor);
    container.addTextDisplayComponents(new TextDisplayBuilder().setContent(`## 📋 Summoned Pokémon Details`));
    container.addSeparatorComponents(new SeparatorBuilder().setSpacing(SeparatorSpacingSize.Small).setDivider(true));

    let info = `📊 **Level:** ${summon.level} — ${getRankBadge(summon.level)}\n`;
    info += `🔖 **Type:** ${(summon.types || []).join(' / ')}\n`;
    if (summon.genus) info += `📖 **Species:** ${summon.genus}\n`;
    if (summon.baseStats) {
        const bs = summon.baseStats;
        info += `\n**Base Stats:**\n`;
        info += `> ATK: \`${bs.atk}\` · DEF: \`${bs.def}\` · SPD: \`${bs.speed}\`\n`;
        info += `> SP.ATK: \`${bs.spAtk}\` · SP.DEF: \`${bs.spDef}\` · HP: \`${bs.hp}\`\n`;
    }

    container.addTextDisplayComponents(new TextDisplayBuilder().setContent(info));
    await interaction.reply({ components: [container], flags: MessageFlags.IsComponentsV2 | MessageFlags.Ephemeral });
}

async function handleSummonBuyRetry(interaction, client) {
    const channelId = interaction.channel.id;
    const author = interaction.user;
    const userId = await accountStore.resolveUserId(author.id);

    try { await interaction.deferUpdate(); } catch (e) { return; }

    const summon = pokemonStore.getSummonedSpawn(channelId);
    if (!summon) {
        return interaction.followUp({
            components: [errorContainer('Too Late!', 'The summoned Pokémon has vanished!')],
            flags: MessageFlags.IsComponentsV2,
        });
    }

    if (summon.summonerId !== userId) {
        return interaction.followUp({
            components: [errorContainer('Locked', `👤 **${author.username}**: Only the summoner can catch a summoned Pokémon!`)],
            flags: MessageFlags.IsComponentsV2,
        });
    }

    // Try to buy 10 Pokéballs (cost 250 coins)
    const buyResult = await economyStore.buyItem(userId, 'Pokéball', 10);
    if (!buyResult.success) {
        return interaction.followUp({
            components: [errorContainer('Transaction Failed', `👤 **${author.username}**: You don't have enough PokéCoins! (Cost: 250)`)],
            flags: MessageFlags.IsComponentsV2,
        });
    }

    // Auto-retry catch
    const result = await pokemonStore.attemptSummonCatch(channelId, userId, summon.name);

    if (result.success) {
        // Edit original summoning message to show caught
        try {
            await interaction.message.edit({
                components: [
                    new ActionRowBuilder().addComponents(
                        new ButtonBuilder().setCustomId('summon_caught_disabled').setEmoji('✅').setLabel(`Caught by ${author.username}!`).setStyle(ButtonStyle.Success).setDisabled(true),
                    ),
                ],
                flags: MessageFlags.IsComponentsV2,
            });
        } catch (e) {}

        // Send catch card
        const p = result.pokemon;
        const typeColor = getTypeColor(p.types);
        const rankBadge = getRankBadge(p.level);
        let rarityTag = '⬜ Common';
        if (p.isLegendary) rarityTag = '👑 LEGENDARY';
        else if (p.isMythical) rarityTag = '✨ MYTHICAL';

        const container = new ContainerBuilder().setAccentColor(typeColor);
        container.addTextDisplayComponents(
            new TextDisplayBuilder().setContent(`## 🎉 ${p.name} CAUGHT!`)
        );
        container.addSeparatorComponents(new SeparatorBuilder().setSpacing(SeparatorSpacingSize.Small).setDivider(true));

        const trainerSection = new SectionBuilder();
        trainerSection.addTextDisplayComponents(
            new TextDisplayBuilder().setContent(
                `👤 **Trainer:** ${author.username}\n` +
                `📊 **Level:** ${p.level} — ${rankBadge}\n` +
                `⭐ **Rarity:** ${rarityTag}\n` +
                `🔖 **Type:** ${(p.types || []).join(' / ')}\n` +
                `📦 **Bought:** +10 Pokéballs (Auto-Buy)`
            )
        );
        trainerSection.setThumbnailAccessory(
            new ThumbnailBuilder().setURL(author.displayAvatarURL({ size: 128 }))
        );
        container.addSectionComponents(trainerSection);
        container.addSeparatorComponents(new SeparatorBuilder().setSpacing(SeparatorSpacingSize.Small).setDivider(true));

        if (p.cardImage) {
            container.addMediaGalleryComponents(
                new MediaGalleryBuilder().addItems(new MediaGalleryItemBuilder().setURL(p.cardImage))
            );
            container.addSeparatorComponents(new SeparatorBuilder().setSpacing(SeparatorSpacingSize.Small).setDivider(true));
        }

        let footerText = `💰 **+${result.coinReward} PokéCoins**`;
        footerText += `\n💼 Wallet: ${result.totalCoins.toLocaleString()} coins · <:Pokemon:1508753880782209085> Pokéballs: ${result.remainingBalls}`;
        container.addTextDisplayComponents(new TextDisplayBuilder().setContent(footerText));

        const row = new ActionRowBuilder().addComponents(
            new ButtonBuilder()
                .setCustomId(`pkdet_${author.id}_${encodeURIComponent(p.name)}`)
                .setEmoji('📋')
                .setLabel('Details')
                .setStyle(ButtonStyle.Secondary),
            new ButtonBuilder()
                .setCustomId(`pkmn_${author.id}_open`)
                .setEmoji('📦')
                .setLabel('Pokémon List')
                .setStyle(ButtonStyle.Secondary),
        );

        await interaction.followUp({ components: [container.addActionRowComponents(row)], flags: MessageFlags.IsComponentsV2 });
    } else {
        if (result.reason === 'summon_ball_failed') {
            if (result.despawned) {
                try {
                    await interaction.message.edit({
                        components: [
                            new ActionRowBuilder().addComponents(
                                new ButtonBuilder().setCustomId('summon_vanished_disabled').setEmoji('💨').setLabel('Vanished!').setStyle(ButtonStyle.Danger).setDisabled(true),
                            ),
                        ],
                        flags: MessageFlags.IsComponentsV2,
                    });
                } catch (e) {}

                const container = errorContainer('Vanished', `👤 **${author.username}**: The summoned **${result.pokemonName}** broke free and vanished!\n📦 **Bought:** +10 Pokéballs (Auto-Buy) · <:Pokemon:1508753880782209085> Pokéballs: ${result.remainingBalls}`);
                await interaction.followUp({ components: [container], flags: MessageFlags.IsComponentsV2 });
            } else {
                // Update summon message tries
                const typeColor = getTypeColor(summon.types);
                const updatedContainer = new ContainerBuilder().setAccentColor(COLORS.CELESTIA)
                    .addTextDisplayComponents(new TextDisplayBuilder().setContent(`## <a:candle:1508754473680502855> Summoning Ritual`))
                    .addSeparatorComponents(new SeparatorBuilder().setSpacing(SeparatorSpacingSize.Small).setDivider(true));

                if (summon.cardImage) {
                    updatedContainer.addMediaGalleryComponents(new MediaGalleryBuilder().addItems(new MediaGalleryItemBuilder().setURL(summon.cardImage)));
                    updatedContainer.addSeparatorComponents(new SeparatorBuilder().setSpacing(SeparatorSpacingSize.Small).setDivider(true));
                }

                const section = new SectionBuilder();
                section.addTextDisplayComponents(
                    new TextDisplayBuilder().setContent(
                        `👤 **Summoner:** ${author.username}\n\n` +
                        `🏷️ **${summon.name}** has answered the call!\n` +
                        `📊 **Level:** ${summon.level}\n` +
                        `🔖 **Type:** ${(summon.types || []).join(' / ')}\n\n` +
                        `🎯 **Tries:** ${result.triesLeft}/3 · **Cost:** 2 balls per try\n\n` +
                        `> Only the summoner can catch this Pokémon.`
                    )
                );
                section.setThumbnailAccessory(new ThumbnailBuilder().setURL(author.displayAvatarURL({ size: 128 })));
                updatedContainer.addSectionComponents(section);

                const catchRow = new ActionRowBuilder().addComponents(
                    new ButtonBuilder()
                        .setCustomId(`summon_catch_${channelId}_active`)
                        .setEmoji('<:Pokemon:1508753880782209085>')
                        .setLabel(`Catch Pokémon! (${result.triesLeft} left)`)
                        .setStyle(ButtonStyle.Success),
                    new ButtonBuilder()
                        .setCustomId(`summon_info_${channelId}_active`)
                        .setEmoji('📋')
                        .setLabel('Details')
                        .setStyle(ButtonStyle.Secondary)
                );

                try {
                    await interaction.message.edit({
                        components: [updatedContainer.addActionRowComponents(catchRow)],
                        flags: MessageFlags.IsComponentsV2,
                    });
                } catch (e) {}

                const failContainer = errorContainer('Broke Free', `👤 **${author.username}**: The summoned **${result.pokemonName}** broke free!\n📦 **Bought:** +10 Pokéballs (Auto-Buy)\n🎯 Tries Left: ${result.triesLeft}/3 · <:Pokemon:1508753880782209085> Pokéballs: ${result.remainingBalls}`);
                await interaction.followUp({ components: [failContainer], flags: MessageFlags.IsComponentsV2 });
            }
        }
    }
}
