/**
 * /pokeuse — Use items (Level Orb, Summoning Candle).
 */
const { SlashCommandBuilder, ContainerBuilder, TextDisplayBuilder, SeparatorBuilder, SeparatorSpacingSize, SectionBuilder, MediaGalleryBuilder, MediaGalleryItemBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, MessageFlags, ThumbnailBuilder } = require('discord.js');
const economyStore = require('../../store/economyStore');
const pokemonStore = require('../../store/pokemonStore');
const accountStore = require('../../store/accountStore');
const { COLORS, getRankBadge, errorContainer, successContainer } = require('../../utils/componentBuilder');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('pokeuse')
        .setDescription('Use an item from your inventory')
        .addStringOption(opt => opt.setName('item').setDescription('Item to use').setRequired(true)
            .addChoices({ name: 'Level Orb', value: 'level orb' }, { name: 'Summoning Candle', value: 'summoning candle' }))
        .addStringOption(opt => opt.setName('pokemon').setDescription('Pokémon name to use item on').setRequired(true)),
    aliases: ['use'],

    async execute(interaction, client, args) {
        const isInteraction = typeof interaction.isChatInputCommand === 'function' && interaction.isChatInputCommand();
        const author = isInteraction ? interaction.user : interaction.author;
        const userId = await accountStore.resolveUserId(author.id);

        let itemName = null;
        let pokemonName = null;

        if (isInteraction) {
            itemName = interaction.options.getString('item');
            pokemonName = interaction.options.getString('pokemon');
        } else if (args && args.length > 0) {
            const lowerArg = args.join(' ').toLowerCase();
            if (lowerArg.startsWith('level orb')) {
                itemName = 'level orb';
                pokemonName = args.slice(2).join(' ');
            } else if (lowerArg.startsWith('summoning candle')) {
                itemName = 'summoning candle';
                pokemonName = args.slice(2).join(' ');
            } else if (lowerArg.startsWith('candle')) {
                itemName = 'summoning candle';
                pokemonName = args.slice(1).join(' ');
            } else if (lowerArg.startsWith('orb')) {
                itemName = 'level orb';
                pokemonName = args.slice(1).join(' ');
            }
        }

        if (!itemName || !pokemonName) {
            return (interaction.replied || interaction.deferred) ? interaction.followUp({
                components: [errorContainer('Invalid Use', 'Specify an item (level orb / summoning candle) and a Pokémon: `!use <item> <pokemon>`')],
                flags: MessageFlags.IsComponentsV2 | MessageFlags.Ephemeral,
            }) : interaction.reply({
                components: [errorContainer('Invalid Use', 'Specify an item (level orb / summoning candle) and a Pokémon: `!use <item> <pokemon>`')],
                flags: MessageFlags.IsComponentsV2 | MessageFlags.Ephemeral,
            });
        }

        if (itemName === 'level orb') {
            return this.handleLevelOrb(interaction, userId, pokemonName, author);
        } else if (itemName === 'summoning candle') {
            return this.handleSummoningCandle(interaction, userId, pokemonName, author);
        }
    },

    async handleLevelOrb(interaction, userId, pokemonName, author) {
        const result = await economyStore.useLevelOrb(userId, pokemonName);

        if (!result.success) {
            if (result.reason === 'no_orbs') {
                // ── No orbs — offer buy & use ──
                const balance = await economyStore.getBalance(userId);
                const container = new ContainerBuilder().setAccentColor(COLORS.DANGER);
                container.addTextDisplayComponents(new TextDisplayBuilder().setContent(`## <a:crystal:1508755858211864596> No Level Orbs!`));
                container.addSeparatorComponents(new SeparatorBuilder().setSpacing(SeparatorSpacingSize.Small).setDivider(true));

                const section = new SectionBuilder();
                section.addTextDisplayComponents(
                    new TextDisplayBuilder().setContent(
                        `👤 **${author.username}**, you have no Level Orbs!\n\n` +
                        `🏷️ **Price:** 800 PokéCoins per orb\n` +
                        `💰 **Balance:** ${balance.pokecoins.toLocaleString()} coins\n\n` +
                        (balance.pokecoins >= 800
                            ? `> ✅ You can afford it! Click below to buy & use.`
                            : `> ❌ Not enough coins!`)
                    )
                );
                section.setThumbnailAccessory(new ThumbnailBuilder().setURL(author.displayAvatarURL({ size: 128 })));
                container.addSectionComponents(section);

                container.addSeparatorComponents(new SeparatorBuilder().setSpacing(SeparatorSpacingSize.Small).setDivider(true));
                container.addTextDisplayComponents(
                    new TextDisplayBuilder().setContent(`-# 🛒 The button will buy 1 Level Orb and use it automatically.`)
                );

                const row = new ActionRowBuilder().addComponents(
                    new ButtonBuilder()
                        .setCustomId(`orb_buyuse_${pokemonName.replace(/\s+/g, '_')}`)
                        .setEmoji('<a:crystal:1508755858211864596>')
                        .setLabel('Buy Level Orb & Use (800 coins)')
                        .setStyle(ButtonStyle.Primary)
                        .setDisabled(balance.pokecoins < 800),
                );

                return (interaction.replied || interaction.deferred) ? interaction.followUp({ components: [container.addActionRowComponents(row)], flags: MessageFlags.IsComponentsV2 | MessageFlags.Ephemeral }) : interaction.reply({ components: [container.addActionRowComponents(row)], flags: MessageFlags.IsComponentsV2 | MessageFlags.Ephemeral });

            } else if (result.reason === 'failed') {
                // ── Orb shattered — try again ──
                const inventory = await economyStore.getInventory(userId);
                const orbItem = inventory.items.find(i => i.itemName === 'Level Orb');
                const orbsLeft = orbItem ? orbItem.quantity : 0;

                const container = new ContainerBuilder().setAccentColor(COLORS.WARNING);
                container.addTextDisplayComponents(new TextDisplayBuilder().setContent(`## 💔 Level Orb Shattered!`));
                container.addSeparatorComponents(new SeparatorBuilder().setSpacing(SeparatorSpacingSize.Small).setDivider(true));

                const section = new SectionBuilder();
                section.addTextDisplayComponents(
                    new TextDisplayBuilder().setContent(
                        `👤 **${author.username}**'s Level Orb crumbled to dust!\n\n` +
                        `🏷️ **${result.pokemonName}** stays at **Lv. ${result.level}**\n` +
                        `<a:crystal:1508755858211864596> **Orbs remaining:** ${orbsLeft}\n\n` +
                        `> The orb's energy was too unstable... (40% fail chance)`
                    )
                );
                section.setThumbnailAccessory(new ThumbnailBuilder().setURL(author.displayAvatarURL({ size: 128 })));
                container.addSectionComponents(section);

                container.addSeparatorComponents(new SeparatorBuilder().setSpacing(SeparatorSpacingSize.Small).setDivider(true));

                let row;
                if (orbsLeft > 0) {
                    container.addTextDisplayComponents(
                        new TextDisplayBuilder().setContent(`-# 🎯 You still have orbs! Try again.`)
                    );
                    row = new ActionRowBuilder().addComponents(
                        new ButtonBuilder()
                            .setCustomId(`orb_retry_${pokemonName.replace(/\s+/g, '_')}`)
                            .setEmoji('<a:crystal:1508755858211864596>')
                            .setLabel('Try Again')
                            .setStyle(ButtonStyle.Success),
                    );
                } else {
                    container.addTextDisplayComponents(
                        new TextDisplayBuilder().setContent(`-# 🛒 No orbs left! Buy one and retry.`)
                    );
                    row = new ActionRowBuilder().addComponents(
                        new ButtonBuilder()
                            .setCustomId(`orb_buyuse_${pokemonName.replace(/\s+/g, '_')}`)
                            .setEmoji('<a:crystal:1508755858211864596>')
                            .setLabel('Buy Level Orb & Use (800 coins)')
                            .setStyle(ButtonStyle.Primary),
                    );
                }

                return (interaction.replied || interaction.deferred) ? interaction.followUp({ components: [container.addActionRowComponents(row)], flags: MessageFlags.IsComponentsV2 | MessageFlags.Ephemeral }) : interaction.reply({ components: [container.addActionRowComponents(row)], flags: MessageFlags.IsComponentsV2 | MessageFlags.Ephemeral });

            } else {
                // no_pokemon, max_level, etc.
                const msgs = {
                    no_pokemon: `You don't own **${pokemonName}**!`,
                    max_level: `**${pokemonName}** is already at max level (100)! 🎉`,
                };
                return (interaction.replied || interaction.deferred) ? interaction.followUp({
                    components: [errorContainer('Level Orb', msgs[result.reason] || 'Failed.')],
                    flags: MessageFlags.IsComponentsV2 | MessageFlags.Ephemeral,
                }) : interaction.reply({
                    components: [errorContainer('Level Orb', msgs[result.reason] || 'Failed.')],
                    flags: MessageFlags.IsComponentsV2 | MessageFlags.Ephemeral,
                });
            }
        }

        // ── Success! ──
        const inventory = await economyStore.getInventory(userId);
        const orbItem = inventory.items.find(i => i.itemName === 'Level Orb');
        const orbsLeft = orbItem ? orbItem.quantity : 0;
        const rankBadge = getRankBadge(result.newLevel);

        const container = new ContainerBuilder().setAccentColor(COLORS.SUCCESS);
        container.addTextDisplayComponents(new TextDisplayBuilder().setContent(`## <a:crystal:1508755858211864596> Level Orb Success!`));
        container.addSeparatorComponents(new SeparatorBuilder().setSpacing(SeparatorSpacingSize.Small).setDivider(true));

        const section = new SectionBuilder();
        section.addTextDisplayComponents(
            new TextDisplayBuilder().setContent(
                `👤 **Trainer:** ${author.username}\n` +
                `🏷️ **${result.pokemonName}**\n` +
                `📊 Lv. ${result.oldLevel} → **Lv. ${result.newLevel}** (+${result.levelsGained})\n` +
                `🏅 **Rank:** ${rankBadge}\n\n` +
                `> *The orb's energy flows into your Pokémon!* ✨`
            )
        );
        section.setThumbnailAccessory(new ThumbnailBuilder().setURL(author.displayAvatarURL({ size: 128 })));
        container.addSectionComponents(section);

        container.addSeparatorComponents(new SeparatorBuilder().setSpacing(SeparatorSpacingSize.Small).setDivider(true));

        // Smart button: if still below 100, show "Use Again" or "Buy & Use"
        if (result.newLevel < 100) {
            let row;
            if (orbsLeft > 0) {
                container.addTextDisplayComponents(
                    new TextDisplayBuilder().setContent(`-# <a:crystal:1508755858211864596> ${orbsLeft} orb(s) left · ${100 - result.newLevel} levels to max!`)
                );
                row = new ActionRowBuilder().addComponents(
                    new ButtonBuilder()
                        .setCustomId(`orb_retry_${pokemonName.replace(/\s+/g, '_')}`)
                        .setEmoji('<a:crystal:1508755858211864596>')
                        .setLabel(`Use Again (${orbsLeft} left)`)
                        .setStyle(ButtonStyle.Success),
                );
            } else {
                container.addTextDisplayComponents(
                    new TextDisplayBuilder().setContent(`-# 🛒 No orbs left! Buy one to keep leveling.`)
                );
                row = new ActionRowBuilder().addComponents(
                    new ButtonBuilder()
                        .setCustomId(`orb_buyuse_${pokemonName.replace(/\s+/g, '_')}`)
                        .setEmoji('<a:crystal:1508755858211864596>')
                        .setLabel('Buy Level Orb & Use (800 coins)')
                        .setStyle(ButtonStyle.Primary),
                );
            }
            await interaction.reply({ components: [container.addActionRowComponents(row)], flags: MessageFlags.IsComponentsV2 });
        } else {
            container.addTextDisplayComponents(
                new TextDisplayBuilder().setContent(`-# 🎉 MAX LEVEL REACHED! Your Pokémon is at its peak!`)
            );
            await interaction.reply({ components: [container], flags: MessageFlags.IsComponentsV2 });
        }
    },

    async handleSummoningCandle(interaction, userId, pokemonName, author) {
        const channelId = interaction.channelId;
        // Check candle in inventory
        const inventory = await economyStore.getInventory(userId);
        const candle = inventory.items.find(i => i.itemName === 'Summoning Candle');
        if (!candle || candle.quantity <= 0) {
            return interaction.reply({ components: [errorContainer('No Candle', "You don't have a Summoning Candle!\n> Buy one: `/pokemart buy item:summoning candle`")], flags: MessageFlags.IsComponentsV2 | MessageFlags.Ephemeral });
        }

        // Check cooldown
        const cooldown = await economyStore.checkSummonCooldown(userId);
        if (!cooldown.allowed) {
            return interaction.reply({ components: [errorContainer('Cooldown', `Wait **${cooldown.hours}h ${cooldown.minutes}m** before using another candle.`)], flags: MessageFlags.IsComponentsV2 | MessageFlags.Ephemeral });
        }

        // Check existing summon
        if (pokemonStore.getSummonedSpawn(channelId)) {
            return interaction.reply({ components: [errorContainer('Active Summon', 'A summoned Pokémon is already active in this channel!')], flags: MessageFlags.IsComponentsV2 | MessageFlags.Ephemeral });
        }

        // Consume candle
        await economyStore.removeInventoryItem(userId, 'Summoning Candle', 1);
        await economyStore.recordSummonUsage(userId);

        // Summon
        const summon = pokemonStore.summonPokemon(channelId, userId, pokemonName);
        if (!summon) {
            await economyStore.addInventoryItem(userId, 'Summoning Candle', 1); // Refund
            return interaction.reply({ components: [errorContainer('Not Found', `**${pokemonName}** is not a valid Pokémon!`)], flags: MessageFlags.IsComponentsV2 | MessageFlags.Ephemeral });
        }

        const section = new SectionBuilder();
        section.addTextDisplayComponents(
            new TextDisplayBuilder().setContent(
                `👤 **Summoner:** ${author.username}\n\n` +
                `🏷️ **${summon.name}** has answered the call!\n` +
                `📊 **Level:** ${summon.level}\n` +
                `🔖 **Type:** ${(summon.types || []).join(' / ')}\n\n` +
                `🎯 **Tries:** 3/3 · **Cost:** 2 balls per try\n\n` +
                `> Click the button below to catch it!\n` +
                `> Only the summoner can catch this Pokémon.`
            )
        );
        section.setThumbnailAccessory(new ThumbnailBuilder().setURL(author.displayAvatarURL({ size: 128 })));

        const container = new ContainerBuilder().setAccentColor(COLORS.CELESTIA)
            .addTextDisplayComponents(new TextDisplayBuilder().setContent(`## <a:candle:1508754473680502855> Summoning Ritual`))
            .addSeparatorComponents(new SeparatorBuilder().setSpacing(SeparatorSpacingSize.Small).setDivider(true));

        if (summon.cardImage) {
            container.addMediaGalleryComponents(new MediaGalleryBuilder().addItems(new MediaGalleryItemBuilder().setURL(summon.cardImage)));
            container.addSeparatorComponents(new SeparatorBuilder().setSpacing(SeparatorSpacingSize.Small).setDivider(true));
        }

        container.addSectionComponents(section);

        const catchRow = new ActionRowBuilder().addComponents(
            new ButtonBuilder()
                .setCustomId(`summon_catch_${channelId}_active`)
                .setEmoji('<:Pokemon:1508753880782209085>')
                .setLabel('Catch Pokémon!')
                .setStyle(ButtonStyle.Success),
            new ButtonBuilder()
                .setCustomId(`summon_info_${channelId}_active`)
                .setEmoji('📋')
                .setLabel('Details')
                .setStyle(ButtonStyle.Secondary)
        );

        await interaction.reply({ components: [container.addActionRowComponents(catchRow)], flags: MessageFlags.IsComponentsV2 });
    },
};
