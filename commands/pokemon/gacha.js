/**
 * /gacha — View active gacha banners, rates, pity status, and pull wishes.
 */
const { SlashCommandBuilder, ContainerBuilder, TextDisplayBuilder, SeparatorBuilder, SeparatorSpacingSize, ActionRowBuilder, ButtonBuilder, ButtonStyle, MediaGalleryBuilder, MediaGalleryItemBuilder, MessageFlags, SectionBuilder, ThumbnailBuilder } = require('discord.js');
const gachaStore = require('../../store/gachaStore');
const economyStore = require('../../store/economyStore');
const accountStore = require('../../store/accountStore');
const { COLORS, errorContainer } = require('../../utils/componentBuilder');

async function sendReply(interaction, payload) {
    if (interaction.replied || interaction.deferred) {
        return await interaction.editReply(payload).catch(() => {});
    }
    if (typeof interaction.reply === 'function') {
        return await interaction.reply(payload).catch(() => {});
    }
    return await interaction.channel.send(payload).catch(() => {});
}

module.exports = {
    data: new SlashCommandBuilder()
        .setName('gacha')
        .setDescription('Interact with the Celestia Gacha system')
        .addSubcommand(sub => sub.setName('banner').setDescription('View active banner and your pity status'))
        .addSubcommand(sub => sub.setName('info').setDescription('View the wishing guide, rates, and mechanics'))
        .addSubcommand(sub => sub.setName('wish')
            .setDescription('Use Wishing Compasses to pull on the banner')
            .addIntegerOption(opt => opt.setName('count').setDescription('Number of wishes (1-10)').setRequired(false).setMinValue(1).setMaxValue(10))
        ),
    aliases: ['wish', 'pull', 'banner', 'banners'],

    async execute(interaction, client, args) {
        const isCommand = typeof interaction.isChatInputCommand === 'function' && interaction.isChatInputCommand();
        const isButton = typeof interaction.isButton === 'function' && interaction.isButton();
        const isInteraction = isCommand || isButton;
        const author = interaction.user || interaction.author;
        const userId = await accountStore.resolveUserId(author.id);

        let subcommand = 'banner';
        if (isCommand || isButton) {
            subcommand = interaction.options.getSubcommand(false) || 'banner';
        } else if (args && args.length > 0) {
            const sub = args[0].toLowerCase();
            if (['info', 'help', 'guide'].includes(sub)) subcommand = 'info';
            else if (['wish', 'pull'].includes(sub)) subcommand = 'wish';
        } else if (!isInteraction && interaction.content) {
            const cmdName = interaction.content.split(' ')[0].toLowerCase().replace(/^!/, '');
            if (['wish', 'pull'].includes(cmdName)) subcommand = 'wish';
        }

        // Defer reply immediately for all command interactions to prevent 3s timeout
        if (isCommand && !interaction.deferred && !interaction.replied) {
            try {
                await interaction.deferReply({ flags: MessageFlags.IsComponentsV2 });
            } catch (err) {
                console.error('[Gacha Defer Command]', err);
            }
        }

        const banner = gachaStore.getBannerInfo();

        if (subcommand === 'info') {
            const container = new ContainerBuilder()
                .setAccentColor(COLORS.CELESTIA)
                .addTextDisplayComponents(new TextDisplayBuilder().setContent(`## <:compass:1508756257840824340> Celestia Wishing Guide`))
                .addSeparatorComponents(new SeparatorBuilder().setSpacing(SeparatorSpacingSize.Small).setDivider(true))
                .addTextDisplayComponents(new TextDisplayBuilder().setContent(
                    `Welcome to the Celestia Gacha Wishing Guide. Here is a breakdown of the mathematical probabilities, pity mechanics, and currencies.\n\n` +
                    `### <:Crystal:1508755711348445214> 1. Currency & Wishing Cost\n` +
                    `* **Wishing Compass** (<:compass:1508756257840824340>): Required to make a wish pull.\n` +
                    `  * Cost: **160 Radiant Crystals** (<:Crystal:1508755711348445214>) per Compass.\n` +
                    `  * Purchase: \`/pokemart buy item:wishing compass\`\n\n` +
                    `* **How to earn Radiant Crystals (<:Crystal:1508755711348445214>):**\n` +
                    `  * Catch a **Legendary Pokémon** in the wild: **+80** <:Crystal:1508755711348445214>\n` +
                    `  * Catch a **Mythical / Ultra Beast** in the wild: **+160** <:Crystal:1508755711348445214>\n` +
                    `  * Win a **Global Raid Battle**: **+480** <:Crystal:1508755711348445214> (all active winners)\n\n` +
                    `### 📊 2. Rates & Pity Calculations\n` +
                    `Celestia uses a custom piece-wise probability distribution with a Soft Pity system and a Hard Pity cap.\n\n` +
                    `🌟 **5-Star Pokémon (Legendary/Mythical):**\n` +
                    `  * **Base Probability:** **0.6%** (Pulls 1 to 73)\n` +
                    `  * **Soft Pity:** Begins at pull **74**. Rate increases by **+6.0%** per pull (e.g., pull 74 has a 6.6% rate, pull 75 has 12.6%, etc.).\n` +
                    `  * **Hard Pity:** **100%** guaranteed at pull **90**.\n\n` +
                    `💜 **4-Star Pokémon (Featured Pool):**\n` +
                    `  * **Base Probability:** **5.1%** (Pulls 1 to 8)\n` +
                    `  * **Soft Pity:** Pull **9** has a boosted **56.1%** rate.\n` +
                    `  * **Hard Pity:** **100%** guaranteed at pull **10**.\n\n` +
                    `### ⚖️ 3. Featured 50/50 Guarantee System\n` +
                    `When you hit a 5-star Pokémon:\n` +
                    `* There is a **55%** chance it will be the **Featured Pokémon Variant** (e.g., *${banner.featured5Star}* variants like GX/EX/LV.X).\n` +
                    `* There is a **45%** chance it will be the **Standard Base Pokémon** (e.g., standard *${banner.featured5Star}*).\n` +
                    `* **The Guarantee:** If you lose the 50/50 and get the Standard Base Pokémon, your **next 5-star is 100% guaranteed** to be the Featured Pokémon Variant.\n\n` +
                    `### ✨ 4. Gacha Boosts & Variants\n` +
                    `* **Variant Form Chance:** Any 4-star Pokémon won from wishing has a **50%** chance to be a premium **Variant card** instead of its base form.\n` +
                    `* **Max Level & Double Stats:** All Pokémon obtained via wishes are pre-trained to your **Max Level Cap** with **2× Max Stats** permanently!`
                ));

            const row = new ActionRowBuilder().addComponents(
                new ButtonBuilder().setCustomId('gacha_view_banner').setLabel('View Active Banner').setStyle(ButtonStyle.Primary).setEmoji('<:compass:1508756257840824340>')
            );

            return sendReply(interaction, { components: [container.addActionRowComponents(row)], flags: MessageFlags.IsComponentsV2 });
        }

        if (subcommand === 'banner') {
            const profile = await gachaStore.getProfileStats(userId);
            const current5Rate = gachaStore.get5StarRate(profile.pity5 + 1);
            const current4Rate = gachaStore.get4StarRate(profile.pity4 + 1);

            const section = new SectionBuilder();
            section.addTextDisplayComponents(
                new TextDisplayBuilder().setContent(
                    `👤 **Trainer:** ${author.username}\n\n` +
                    `### 📈 Pity Status\n` +
                    `* ⭐ 5★ Pity Counter: **${profile.pity5}/90**\n` +
                    `* 💜 4★ Pity Counter: **${profile.pity4}/10**\n` +
                    `* 🎯 Next 5★: ${profile.guaranteed5 ? '✅ **GUARANTEED VARIANT**' : '🎲 50/50 Coin Flip'}\n\n` +
                    `### 📊 Lifetime Stats\n` +
                    `* 🎰 Total Wishes: ${profile.totalWishes} · 5★: ${profile.total5Stars} · 4★: ${profile.total4Stars}`
                )
            );
            section.setThumbnailAccessory(new ThumbnailBuilder().setURL(author.displayAvatarURL({ size: 128 })));

            const container = new ContainerBuilder()
                .setAccentColor(COLORS.CELESTIA)
                .addTextDisplayComponents(new TextDisplayBuilder().setContent(`## <:compass:1508756257840824340> Active Banner: ${banner.name}`))
                .addSeparatorComponents(new SeparatorBuilder().setSpacing(SeparatorSpacingSize.Small).setDivider(true))
                .addSectionComponents(section)
                .addSeparatorComponents(new SeparatorBuilder().setSpacing(SeparatorSpacingSize.Small).setDivider(true))
                .addTextDisplayComponents(new TextDisplayBuilder().setContent(
                    `### ⭐⭐⭐⭐⭐ 5-STAR POOL:\n` +
                    `* 👑 **${banner.featured5Star}** — Legendary Deity of Time\n` +
                    `  *(Standard Base Form or premium Variant Form)*\n\n` +
                    `### ⭐⭐⭐⭐ 4-STAR POOL:\n` +
                    `* 🔥 ${banner.pool4Star.join(' | ')}\n\n` +
                    `### ⭐⭐⭐ 3-STAR REWARDS & CHANCES:\n` +
                    (banner.pool3StarPool && banner.pool3StarPool.length > 0 
                        ? banner.pool3StarPool.map(item => {
                            const emojis = { 'Level Orb': '🔮', 'Raid Pass': '🎟️', 'Enchanted Stardust': '✨', 'Dirty Diaper': '💩' };
                            return `  ${emojis[item.itemName] || '⬜'} ${item.itemName} (${item.chance}%)`;
                          }).join('\n') + '\n\n'
                        : `  🔮 Level Orb (100%)\n\n`
                    ) +
                    `### 📊 Current Rates (Next Pull)\n` +
                    `* ⭐ 5★ Rate: **${(current5Rate * 100).toFixed(1)}%**${profile.pity5 >= 73 ? ' 🔥 SOFT PITY!' : ''}\n` +
                    `* 💜 4★ Rate: **${(current4Rate * 100).toFixed(1)}%**${profile.pity4 >= 8 ? ' 🔥 SOFT PITY!' : ''}\n\n` +
                    `> _All gacha Pokémon are pulled at your MAX level cap with 2× boosted stats!_ 🔥`
                ));

            const row = new ActionRowBuilder().addComponents(
                new ButtonBuilder().setCustomId('gacha_view_guide').setLabel('Wishing Guide').setStyle(ButtonStyle.Secondary).setEmoji('📖'),
                new ButtonBuilder().setCustomId('wish_1').setLabel('Wish ×1').setEmoji('<:compass:1508756257840824340>').setStyle(ButtonStyle.Primary),
                new ButtonBuilder().setCustomId('wish_10').setLabel('Wish ×10').setEmoji('<:compass:1508756257840824340>').setStyle(ButtonStyle.Success)
            );

            return sendReply(interaction, { components: [container.addActionRowComponents(row)], flags: MessageFlags.IsComponentsV2 });
        }

        if (subcommand === 'wish') {
            let wishCount = 1;
            if (isInteraction && typeof interaction.options?.getInteger === 'function') {
                wishCount = interaction.options.getInteger('count') || 1;
            } else if (args && args.length > 0) {
                wishCount = parseInt(args[1] || args[0]) || 1;
            }
            if (isNaN(wishCount) || wishCount < 1) wishCount = 1;
            if (wishCount > 10) wishCount = 10;

            const inventory = await economyStore.getInventory(userId);
            const compass = inventory.items.find(i => i.itemName === 'Wishing Compass');
            const compassCount = compass?.quantity || 0;

            if (compassCount < wishCount) {
                return sendReply(interaction, {
                    components: [errorContainer('Not Enough Compasses',
                        `👤 **${author.username}**, you need **${wishCount}** Wishing Compass${wishCount > 1 ? 'es' : ''} but only have **${compassCount}**.\n\n` +
                        `> <:compass:1508756257840824340> Buy compasses: \`/pokemart buy item:wishing compass\`\n` +
                        `> <:Crystal:1508755711348445214> Costs **160 Radiant Crystals** each`)],
                    flags: MessageFlags.IsComponentsV2,
                });
            }

            for (let i = 0; i < wishCount; i++) {
                await economyStore.removeInventoryItem(userId, 'Wishing Compass', 1);
            }

            const { results, profile } = await gachaStore.executeWishes(userId, wishCount, economyStore);
            const bannerInfo = gachaStore.getBannerInfo();

            const container = new ContainerBuilder();
            let highestRarity = 3;
            for (const r of results) {
                if (r.rarity > highestRarity) highestRarity = r.rarity;
            }

            const accentColor = highestRarity === 5 ? COLORS.GACHA_5 : highestRarity === 4 ? COLORS.GACHA_4 : COLORS.GACHA_3;
            container.setAccentColor(accentColor);

            const section = new SectionBuilder();
            section.addTextDisplayComponents(
                new TextDisplayBuilder().setContent(
                    `👤 **Trainer:** ${author.username}\n\n` +
                    `> ${wishCount}× Wish${wishCount > 1 ? 'es' : ''} on ${bannerInfo.name}!`
                )
            );
            section.setThumbnailAccessory(new ThumbnailBuilder().setURL(author.displayAvatarURL({ size: 128 })));

            container.addTextDisplayComponents(new TextDisplayBuilder().setContent(`## ✨ Celestia Wishing Results`));
            container.addSeparatorComponents(new SeparatorBuilder().setSpacing(SeparatorSpacingSize.Small).setDivider(true));
            container.addSectionComponents(section);
            container.addSeparatorComponents(new SeparatorBuilder().setSpacing(SeparatorSpacingSize.Small).setDivider(true));

            const imageUrls = results.filter(r => r.cardImage).map(r => r.cardImage);
            if (imageUrls.length > 0) {
                const gallery = new MediaGalleryBuilder();
                for (const url of imageUrls.slice(0, 10)) {
                    gallery.addItems(new MediaGalleryItemBuilder().setURL(url));
                }
                container.addMediaGalleryComponents(gallery);
                container.addSeparatorComponents(new SeparatorBuilder().setSpacing(SeparatorSpacingSize.Small).setDivider(true));
            }

            let resultsText = '';
            const threeStarCounts = {};
            for (const r of results) {
                if (r.rarity === 3) {
                    threeStarCounts[r.item] = (threeStarCounts[r.item] || 0) + 1;
                }
            }

            const threeStarEntries = Object.entries(threeStarCounts);
            if (threeStarEntries.length > 0) {
                const emojis = { 'Level Orb': '🔮', 'Raid Pass': '🎟️', 'Enchanted Stardust': '✨', 'Dirty Diaper': '💩' };
                const itemsText = threeStarEntries.map(([name, count]) => {
                    const emoji = emojis[name] || '⬜';
                    return `**${emoji} ${name} ×${count}**`;
                }).join(' · ');
                resultsText += `### <a:crystal:1508755858211864596> 3★ Results\n> ${itemsText} added to your bag!\n\n`;
            }

            for (const r of results) {
                if (r.rarity === 5) {
                    const stats = r.doubledStats;
                    const variantTag = r.isVariant ? '🏆 **FEATURED VARIANT**' : '🔹 **STANDARD BASE FORM**';
                    resultsText += `### ⭐⭐⭐⭐⭐ 5-STAR PULL!\n` +
                        `🏷️ **Pokémon:** ${r.pokemonName}\n` +
                        `${variantTag}\n` +
                        `📊 **Level:** ✨ ${r.level} (MAX)\n` +
                        `🔖 **Type:** ${(r.types || []).join(' / ')}\n\n` +
                        `⚔️ **GACHA BOOSTED STATS (2× MAX):**\n` +
                        `* ❤️ HP: ${stats.hp} | ⚔️ ATK: ${stats.atk} | 🛡️ DEF: ${stats.def}\n` +
                        `* <a:crystal:1508755858211864596> SP.ATK: ${stats.spAtk} | 🔰 SP.DEF: ${stats.spDef} | 💨 SPEED: ${stats.speed}\n\n` +
                        `🎯 **Pity Count:** Pull #${r.pityCount}\n`;
                    if (r.isFeatured) {
                        resultsText += `> 🏆 *You won the 50/50 and pulled the Variant Pokémon! Next 5★ is a coin flip again.*\n\n`;
                    } else {
                        resultsText += `> 🔄 *Lost the 50/50 and pulled the Standard Base Pokémon! Next 5★ is GUARANTEED to be a Variant Pokémon next time!* 🎯\n\n`;
                    }
                } else if (r.rarity === 4) {
                    const stats = r.doubledStats;
                    const variantTag = r.isVariant ? '✨ **VARIANT FORM**' : '🔹 **BASE FORM**';
                    resultsText += `### ⭐⭐⭐⭐ 4-STAR PULL!\n` +
                        `🏷️ **Pokémon:** ${r.pokemonName}\n` +
                        `${variantTag}\n` +
                        `📊 **Level:** ✨ ${r.level} (MAX)\n` +
                        `🔖 **Type:** ${(r.types || []).join(' / ')}\n\n` +
                        `⚔️ **GACHA BOOSTED STATS (2× MAX):**\n` +
                        `* ❤️ HP: ${stats.hp} | ⚔️ ATK: ${stats.atk} | 🛡️ DEF: ${stats.def}\n` +
                        `* <a:crystal:1508755858211864596> SP.ATK: ${stats.spAtk} | 🔰 SP.DEF: ${stats.spDef} | 💨 SPEED: ${stats.speed}\n\n` +
                        `🎯 **Pity Count:** Pull #${r.pityCount}\n\n`;
                }
            }

            container.addTextDisplayComponents(new TextDisplayBuilder().setContent(resultsText));
            container.addSeparatorComponents(new SeparatorBuilder().setSpacing(SeparatorSpacingSize.Small).setDivider(true));
            container.addTextDisplayComponents(
                new TextDisplayBuilder().setContent(
                    `📊 **Pity Status**\n` +
                    `> 5★ Pity: ${profile.pity5}/90 ${profile.guaranteed5 ? '🎯 Guaranteed Featured' : ''}\n` +
                    `> 4★ Pity: ${profile.pity4}/10\n` +
                    `> Total Wishes: ${profile.totalWishes} · 5★: ${profile.total5Stars} · 4★: ${profile.total4Stars}`
                )
            );

            const row = new ActionRowBuilder().addComponents(
                new ButtonBuilder().setCustomId('wish_1').setLabel('Wish ×1').setEmoji('<:compass:1508756257840824340>').setStyle(ButtonStyle.Primary),
                new ButtonBuilder().setCustomId('wish_10').setLabel('Wish ×10').setEmoji('<:compass:1508756257840824340>').setStyle(ButtonStyle.Success),
            );

            return sendReply(interaction, { components: [container.addActionRowComponents(row)], flags: MessageFlags.IsComponentsV2 });
        }
    },

    async handleButton(interaction, client) {
        const id = interaction.customId;
        if (id === 'gacha_view_banner' || id === 'gacha_view_guide' || id.startsWith('wish_')) {
            try {
                if (!interaction.deferred && !interaction.replied) {
                    await interaction.deferUpdate();
                }
            } catch (err) {
                console.error('[Gacha Defer Button]', err);
            }
        }
        if (id === 'gacha_view_banner') {
            interaction.options = { getSubcommand: () => 'banner' };
            await this.execute(interaction, client, []);
        } else if (id === 'gacha_view_guide') {
            interaction.options = { getSubcommand: () => 'info' };
            await this.execute(interaction, client, []);
        } else if (id.startsWith('wish_')) {
            const count = parseInt(id.replace('wish_', ''));
            if (!isNaN(count)) {
                interaction.options = { getSubcommand: () => 'wish', getInteger: (name) => name === 'count' ? count : null, getString: () => null, getUser: () => null };
                await this.execute(interaction, client, []);
            }
        }
    }
};
