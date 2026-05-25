/**
 * /wish — Gacha wishing system with Components V2.
 * Self-editing message that shows pulls one by one.
 */
const { SlashCommandBuilder, ContainerBuilder, TextDisplayBuilder, SeparatorBuilder, SeparatorSpacingSize, ActionRowBuilder, ButtonBuilder, ButtonStyle, MediaGalleryBuilder, MediaGalleryItemBuilder, MessageFlags } = require('discord.js');
const gachaStore = require('../../store/gachaStore');
const economyStore = require('../../store/economyStore');
const accountStore = require('../../store/accountStore');
const { COLORS, errorContainer } = require('../../utils/componentBuilder');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('wish')
        .setDescription('Use Wishing Compasses to pull on the Celestia Radiant Banner')
        .addIntegerOption(opt =>
            opt.setName('count').setDescription('Number of wishes (1-10)').setRequired(false).setMinValue(1).setMaxValue(10)
        ),
    aliases: ['gacha', 'pull'],

    async execute(interaction) {
        const wishCount = interaction.options?.getInteger?.('count') || 1;
        const userId = await accountStore.resolveUserId(interaction.user.id);

        // Check compasses
        const inventory = await economyStore.getInventory(userId);
        const compass = inventory.items.find(i => i.itemName === 'Wishing Compass');
        const compassCount = compass?.quantity || 0;

        if (compassCount < wishCount) {
            return interaction.reply({
                components: [errorContainer('Not Enough Compasses',
                    `You need **${wishCount}** Wishing Compass${wishCount > 1 ? 'es' : ''} but only have **${compassCount}**.\n\n` +
                    `> 🧭 Buy compasses: \`/pokemart buy item:wishing compass\`\n` +
                    `> 💎 Costs **160 Radiant Crystals** each`)],
                flags: MessageFlags.IsComponentsV2 | MessageFlags.Ephemeral,
            });
        }

        // Consume compasses
        for (let i = 0; i < wishCount; i++) {
            await economyStore.removeInventoryItem(userId, 'Wishing Compass', 1);
        }

        // Execute wishes
        const { results, profile } = await gachaStore.executeWishes(userId, wishCount, economyStore);
        const bannerInfo = gachaStore.getBannerInfo();

        // Build result display
        const container = new ContainerBuilder();
        let highestRarity = 3;
        for (const r of results) {
            if (r.rarity > highestRarity) highestRarity = r.rarity;
        }

        const accentColor = highestRarity === 5 ? COLORS.GACHA_5 : highestRarity === 4 ? COLORS.GACHA_4 : COLORS.GACHA_3;
        container.setAccentColor(accentColor);

        container.addTextDisplayComponents(
            new TextDisplayBuilder().setContent(
                `## ✨ ${bannerInfo.name}\n` +
                `> ${wishCount}× Wish${wishCount > 1 ? 'es' : ''} by **${interaction.user.username}**`
            )
        );

        container.addSeparatorComponents(new SeparatorBuilder().setSpacing(SeparatorSpacingSize.Small).setDivider(true));

        // Show card images for 4★ and 5★ pulls
        const imageUrls = results.filter(r => r.cardImage).map(r => r.cardImage);
        if (imageUrls.length > 0) {
            const gallery = new MediaGalleryBuilder();
            for (const url of imageUrls.slice(0, 10)) {
                gallery.addItems(new MediaGalleryItemBuilder().setURL(url));
            }
            container.addMediaGalleryComponents(gallery);
            container.addSeparatorComponents(new SeparatorBuilder().setSpacing(SeparatorSpacingSize.Small).setDivider(true));
        }

        // Results text
        let resultsText = '';
        for (const r of results) {
            if (r.rarity === 5) {
                const stars = '⭐⭐⭐⭐⭐';
                const featuredTag = r.isFeatured ? '🎯 **FEATURED**' : '🔮 Standard';
                resultsText += `${stars} **${r.pokemonName}** — ${featuredTag}`;
                if (r.isVariant) resultsText += ' 💫 Variant';
                resultsText += `\n> Lv. 100 · ${r.isFeatured ? 'Won 50/50!' : 'Lost 50/50'} · Pity: ${r.pityCount}\n\n`;
            } else if (r.rarity === 4) {
                const stars = '⭐⭐⭐⭐';
                resultsText += `${stars} **${r.pokemonName}**`;
                if (r.isVariant) resultsText += ' 💫 Variant';
                resultsText += `\n> Lv. 100 · Pity: ${r.pityCount}\n\n`;
            } else {
                resultsText += `⭐⭐⭐ **Level Orb** ×1\n> Added to inventory\n\n`;
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

        // Wish again buttons
        const row = new ActionRowBuilder().addComponents(
            new ButtonBuilder().setCustomId('wish_1').setLabel('Wish ×1').setEmoji('🧭').setStyle(ButtonStyle.Primary),
            new ButtonBuilder().setCustomId('wish_10').setLabel('Wish ×10').setEmoji('🧭').setStyle(ButtonStyle.Success),
        );

        await interaction.reply({ components: [container, row], flags: MessageFlags.IsComponentsV2 });
    },

    async handleButton(interaction) {
        const id = interaction.customId;
        if (!id.startsWith('wish_')) return;
        const count = parseInt(id.replace('wish_', ''));
        if (isNaN(count)) return;

        // Re-execute the wish
        interaction.options = { getInteger: (name) => name === 'count' ? count : null, getString: () => null, getUser: () => null };
        await this.execute(interaction);
    },
};
