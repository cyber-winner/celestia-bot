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
            .addChoices(
                { name: 'Level Orb', value: 'level orb' },
                { name: 'Summoning Candle', value: 'summoning candle' },
                { name: 'Enchanted Stardust', value: 'enchanted stardust' },
                { name: 'Enchanted Wand', value: 'enchanted wand' },
                { name: 'Dirty Diaper', value: 'dirty diaper' },
                { name: 'Literally Karen', value: 'literally karen' }
            ))
        .addStringOption(opt => opt.setName('pokemon').setDescription('Pokémon name (for Level Orb, Summon, Stardust)').setRequired(false))
        .addUserOption(opt => opt.setName('target').setDescription('User to target (for Enchanted Wand/Dirty Diaper)').setRequired(false)),
    aliases: ['use'],

    async execute(interaction, client, args) {
        const isInteraction = typeof interaction.isChatInputCommand === 'function' && interaction.isChatInputCommand();
        const author = isInteraction ? interaction.user : interaction.author;
        const userId = await accountStore.resolveUserId(author.id);

        let itemName = null;
        let pokemonName = null;
        let targetUser = null;

        if (isInteraction) {
            itemName = interaction.options.getString('item');
            pokemonName = interaction.options.getString('pokemon');
            targetUser = interaction.options.getUser('target');
        } else if (args && args.length > 0) {
            const lowerArg = args.join(' ').toLowerCase();
            const mentioned = interaction.mentions ? interaction.mentions.users.first() : null;
            if (mentioned) {
                targetUser = mentioned;
            }

            if (lowerArg.startsWith('level orb') || lowerArg.startsWith('orb')) {
                itemName = 'level orb';
                pokemonName = args.slice(lowerArg.startsWith('level orb') ? 2 : 1).filter(a => !a.startsWith('<@')).join(' ');
            } else if (lowerArg.startsWith('summoning candle') || lowerArg.startsWith('candle')) {
                itemName = 'summoning candle';
                pokemonName = args.slice(lowerArg.startsWith('summoning candle') ? 2 : 1).filter(a => !a.startsWith('<@')).join(' ');
            } else if (lowerArg.startsWith('enchanted stardust') || lowerArg.startsWith('stardust')) {
                itemName = 'enchanted stardust';
                pokemonName = args.slice(lowerArg.startsWith('enchanted stardust') ? 2 : 1).filter(a => !a.startsWith('<@')).join(' ');
            } else if (lowerArg.startsWith('enchanted wand') || lowerArg.startsWith('wand')) {
                itemName = 'enchanted wand';
            } else if (lowerArg.startsWith('dirty diaper') || lowerArg.startsWith('diaper')) {
                itemName = 'dirty diaper';
            } else if (lowerArg.startsWith('literally karen') || lowerArg.startsWith('karen')) {
                itemName = 'literally karen';
            }
        }

        if (!itemName) {
            return (interaction.replied || interaction.deferred) ? interaction.followUp({
                components: [errorContainer('Invalid Use', 'Specify an item: `/pokeuse item:<name>`')],
                flags: MessageFlags.IsComponentsV2 | MessageFlags.Ephemeral,
            }) : interaction.reply({
                components: [errorContainer('Invalid Use', 'Specify an item: `/pokeuse item:<name>`')],
                flags: MessageFlags.IsComponentsV2 | MessageFlags.Ephemeral,
            });
        }

        if (itemName === 'level orb') {
            if (!pokemonName) {
                return interaction.reply({ components: [errorContainer('Missing Option', 'Specify a Pokémon name to use Level Orb on.')], flags: MessageFlags.IsComponentsV2 | MessageFlags.Ephemeral });
            }
            return this.handleLevelOrb(interaction, userId, pokemonName, author);
        } else if (itemName === 'summoning candle') {
            if (!pokemonName) {
                return interaction.reply({ components: [errorContainer('Missing Option', 'Specify a Pokémon name to summon.')], flags: MessageFlags.IsComponentsV2 | MessageFlags.Ephemeral });
            }
            return this.handleSummoningCandle(interaction, userId, pokemonName, author);
        } else if (itemName === 'enchanted stardust') {
            if (!pokemonName) {
                return interaction.reply({ components: [errorContainer('Missing Option', 'Specify a Pokémon name to use Enchanted Stardust on.')], flags: MessageFlags.IsComponentsV2 | MessageFlags.Ephemeral });
            }
            return this.handleEnchantedStardust(interaction, userId, pokemonName, author);
        } else if (itemName === 'enchanted wand') {
            return this.handleEnchantedWand(interaction, userId, targetUser, author);
        } else if (itemName === 'dirty diaper') {
            return this.handleDirtyDiaper(interaction, userId, targetUser, author);
        } else if (itemName === 'literally karen') {
            return this.handleLiterallyKaren(interaction, userId, author);
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

    async handleEnchantedStardust(interaction, userId, pokemonName, author) {
        const result = await economyStore.useEnchantedStardust(userId, pokemonName);

        if (!result.success) {
            const msgs = {
                no_stardust: "You don't have any Enchanted Stardust! Buy it from `/omegashop`",
                no_pokemon: `You don't own **${pokemonName}**!`,
                too_close_to_cap: `**${pokemonName}** is too close to its level cap. It must be at least 10 levels below its cap (**Lv. ${result.cap}**) to use Enchanted Stardust. (Current: Lv. ${result.level})`,
            };
            return interaction.reply({
                components: [errorContainer('Enchanted Stardust', msgs[result.reason] || 'Failed.')],
                flags: MessageFlags.IsComponentsV2 | MessageFlags.Ephemeral,
            });
        }

        const rankBadge = getRankBadge(result.newLevel);
        const container = new ContainerBuilder().setAccentColor(COLORS.SUCCESS);
        container.addTextDisplayComponents(new TextDisplayBuilder().setContent(`## ✨ Enchanted Stardust Success!`));
        container.addSeparatorComponents(new SeparatorBuilder().setSpacing(SeparatorSpacingSize.Small).setDivider(true));

        const section = new SectionBuilder();
        section.addTextDisplayComponents(
            new TextDisplayBuilder().setContent(
                `👤 **Trainer:** ${author.username}\n` +
                `🏷️ **${result.pokemonName}**\n` +
                `📊 Lv. ${result.oldLevel} → **Lv. ${result.newLevel}** (+${result.levelsGained})\n` +
                `🏅 **Rank:** ${rankBadge}\n\n` +
                `> *The stardust guarantees a massive level boost with 100% success rate!* 🌟`
            )
        );
        section.setThumbnailAccessory(new ThumbnailBuilder().setURL(author.displayAvatarURL({ size: 128 })));
        container.addSectionComponents(section);

        await interaction.reply({ components: [container], flags: MessageFlags.IsComponentsV2 });
    },

    async handleEnchantedWand(interaction, userId, targetUser, author) {
        if (!targetUser) {
            return interaction.reply({
                components: [errorContainer('Invalid Target', 'Specify a user to target: `/pokeuse item:Enchanted Wand target:@User`')],
                flags: MessageFlags.IsComponentsV2 | MessageFlags.Ephemeral,
            });
        }

        const targetId = await accountStore.resolveUserId(targetUser.id);
        const result = await economyStore.useEnchantedWand(userId, targetId);

        if (!result.success) {
            const msgs = {
                no_wand: "You don't have an Enchanted Wand! Buy it from `/omegashop`",
                invalid_target: "You cannot hex yourself!",
                target_not_found: "Target user's wallet could not be found.",
            };
            return interaction.reply({
                components: [errorContainer('Enchanted Wand', msgs[result.reason] || 'Failed.')],
                flags: MessageFlags.IsComponentsV2 | MessageFlags.Ephemeral,
            });
        }

        const container = new ContainerBuilder();
        if (result.backfired) {
            container.setAccentColor(COLORS.DANGER);
            container.addTextDisplayComponents(new TextDisplayBuilder().setContent(`## 🪄 Wand Backfired!`));
            container.addSeparatorComponents(new SeparatorBuilder().setSpacing(SeparatorSpacingSize.Small).setDivider(true));
            container.addTextDisplayComponents(new TextDisplayBuilder().setContent(
                `👤 **${author.username}** tried to use an **Enchanted Wand** on **${targetUser.username}**, but it backfired!\n\n` +
                `💀 You are locked out of catching Pokémon for the next **5** global spawns!`
            ));
        } else {
            container.setAccentColor(COLORS.SUCCESS);
            container.addTextDisplayComponents(new TextDisplayBuilder().setContent(`## 🪄 Wand Success!`));
            container.addSeparatorComponents(new SeparatorBuilder().setSpacing(SeparatorSpacingSize.Small).setDivider(true));
            container.addTextDisplayComponents(new TextDisplayBuilder().setContent(
                `👤 **${author.username}** hexed **${targetUser.username}** with an **Enchanted Wand**!\n\n` +
                `🔒 **${targetUser.username}** cannot catch Pokémon for the next **5** global spawns!`
            ));
        }

        await interaction.reply({ components: [container], flags: MessageFlags.IsComponentsV2 });
    },

    async handleDirtyDiaper(interaction, userId, targetUser, author) {
        if (!targetUser) {
            return interaction.reply({
                components: [errorContainer('Invalid Target', 'Specify a user to target: `/pokeuse item:Dirty Diaper target:@User`')],
                flags: MessageFlags.IsComponentsV2 | MessageFlags.Ephemeral,
            });
        }

        const targetId = await accountStore.resolveUserId(targetUser.id);
        const result = await economyStore.useDirtyDiaper(userId, targetId);

        if (!result.success) {
            const msgs = {
                no_diaper: "You don't have a Dirty Diaper! Buy it from `/omegashop`",
                invalid_target: "You cannot put a diaper on yourself!",
                target_not_found: "Target user's wallet could not be found.",
            };
            return interaction.reply({
                components: [errorContainer('Dirty Diaper', msgs[result.reason] || 'Failed.')],
                flags: MessageFlags.IsComponentsV2 | MessageFlags.Ephemeral,
            });
        }

        const container = new ContainerBuilder().setAccentColor(COLORS.SUCCESS);
        container.addTextDisplayComponents(new TextDisplayBuilder().setContent(`## 💩 Diaper Mode Activated!`));
        container.addSeparatorComponents(new SeparatorBuilder().setSpacing(SeparatorSpacingSize.Small).setDivider(true));
        container.addTextDisplayComponents(new TextDisplayBuilder().setContent(
            `👤 **${author.username}** tossed a **Dirty Diaper** onto **${targetUser.username}**!\n\n` +
            `💩 **${targetUser.username}** is diapered! They must use the text command \`celestia catch\` to catch Pokémon for the next **20** global spawns!`
        ));

        await interaction.reply({ components: [container], flags: MessageFlags.IsComponentsV2 });
    },

    async handleLiterallyKaren(interaction, userId, author) {
        const result = await economyStore.useLiterallyKaren(userId);

        if (!result.success) {
            const msgs = {
                no_karen: "You don't have a Literally Karen! Buy it from `/omegashop`",
            };
            return interaction.reply({
                components: [errorContainer('Literally Karen', msgs[result.reason] || 'Failed.')],
                flags: MessageFlags.IsComponentsV2 | MessageFlags.Ephemeral,
            });
        }

        const container = new ContainerBuilder().setAccentColor(COLORS.SUCCESS);
        container.addTextDisplayComponents(new TextDisplayBuilder().setContent(`## 🗣️ Literally Karen Activated!`));
        container.addSeparatorComponents(new SeparatorBuilder().setSpacing(SeparatorSpacingSize.Small).setDivider(true));
        container.addTextDisplayComponents(new TextDisplayBuilder().setContent(
            `👤 **${author.username}** activated **Literally Karen**!\n\n` +
            `📢 Catch cooldowns will be completely bypassed for the next **30 minutes**!\n` +
            `⏰ Expiry: <t:${Math.floor(result.expiry.getTime() / 1000)}:R>`
        ));

        await interaction.reply({ components: [container], flags: MessageFlags.IsComponentsV2 });
    },
};
