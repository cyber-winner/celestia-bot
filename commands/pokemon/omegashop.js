/**
 * /omegashop — Celestia's Omega Shop with Components V2 and Modals.
 * Items locked behind Prestige requirements.
 */
const { SlashCommandBuilder, ContainerBuilder, TextDisplayBuilder, SeparatorBuilder, SeparatorSpacingSize, ActionRowBuilder, ButtonBuilder, ButtonStyle, MessageFlags, ModalBuilder, TextInputBuilder, TextInputStyle, SectionBuilder } = require('discord.js');
const economyStore = require('../../store/economyStore');
const accountStore = require('../../store/accountStore');
const { COLORS, errorContainer, successContainer, paginationRow, EMOJIS } = require('../../utils/componentBuilder');

const ITEMS_PER_PAGE = 4;

module.exports = {
    data: new SlashCommandBuilder()
        .setName('omegashop')
        .setDescription('Browse and buy exclusive items from the Omega Shop (Prestige 1+ required)'),
    aliases: ['omegamart', 'oshop', 'omegastore'],

    async execute(interaction, client, args) {
        const isInteraction = typeof interaction.isChatInputCommand === 'function' && interaction.isChatInputCommand();
        const author = isInteraction ? interaction.user : interaction.author;
        const userId = await accountStore.resolveUserId(author.id);

        const page = 1;
        await this.renderShop(interaction, userId, page, author);
    },

    async renderShop(interaction, userId, page, author, isUpdate = false) {
        const catalog = economyStore.getOmegaMarketCatalog();
        const items = Object.values(catalog);
        const totalPages = Math.ceil(items.length / ITEMS_PER_PAGE);
        const startIndex = (page - 1) * ITEMS_PER_PAGE;
        const pageItems = items.slice(startIndex, startIndex + ITEMS_PER_PAGE);

        const balance = await economyStore.getBalance(userId);
        const wallet = await economyStore.getWallet(userId);
        const prestigeLevel = wallet.prestigeLevel || 0;

        const container = new ContainerBuilder()
            .setAccentColor(0x8B00FF) // Deep purple for omega
            .addTextDisplayComponents(new TextDisplayBuilder().setContent(`## 🔮 Omega Shop`))
            .addSeparatorComponents(new SeparatorBuilder().setSpacing(SeparatorSpacingSize.Small).setDivider(true))
            .addTextDisplayComponents(new TextDisplayBuilder().setContent(
                `💰 **Your Balance:** ${balance.pokecoins.toLocaleString()} ${EMOJIS.COIN}\n` +
                `🌟 **Prestige Level:** ${prestigeLevel}\n` +
                `-# ⚠️ All items require Prestige 1 or above`
            ));

        for (const item of pageItems) {
            container.addSeparatorComponents(new SeparatorBuilder().setSpacing(SeparatorSpacingSize.Small).setDivider(true));

            const locked = prestigeLevel < (item.requiresPrestige || 0);
            const lockIcon = locked ? '🔒' : '🔓';
            const dailyTag = item.dailyLimit > 0 ? ' · 📅 *1/day*' : '';

            const itemSection = new SectionBuilder();
            itemSection.addTextDisplayComponents(new TextDisplayBuilder().setContent(
                `${item.emoji} **${item.displayName}** ${lockIcon}\n` +
                `🏷️ **Price:** ${item.price.toLocaleString()} ${EMOJIS.COIN}${dailyTag}\n` +
                `> ${item.description}`
            ));

            const safeId = item.id.replace(/\s+/g, '_');
            itemSection.setButtonAccessory(
                new ButtonBuilder()
                    .setCustomId(`oshop_buy_${safeId}`)
                    .setEmoji(item.emoji)
                    .setLabel('Buy')
                    .setStyle(locked ? ButtonStyle.Secondary : ButtonStyle.Success)
                    .setDisabled(locked)
            );

            container.addSectionComponents(itemSection);
        }

        container.addSeparatorComponents(new SeparatorBuilder().setSpacing(SeparatorSpacingSize.Small).setDivider(true));
        container.addTextDisplayComponents(new TextDisplayBuilder().setContent(`-# Page ${page}/${totalPages} · Use buttons to navigate`));

        const pagRow = paginationRow(`oshop_page_${author.id}`, page, totalPages);
        container.addActionRowComponents(pagRow);
        const components = [container];

        if (isUpdate) {
            if (interaction.replied) {
                await interaction.message.edit({ components, flags: MessageFlags.IsComponentsV2 }).catch(() => {});
            } else {
                await interaction.update({ components, flags: MessageFlags.IsComponentsV2 }).catch(() => {});
            }
        } else {
            if (interaction.deferred || interaction.replied) {
                await interaction.editReply({ components, flags: MessageFlags.IsComponentsV2 });
            } else {
                await interaction.reply({ components, flags: MessageFlags.IsComponentsV2 });
            }
        }
    },

    async handleButton(interaction) {
        const id = interaction.customId;

        // Pagination
        if (id.startsWith('oshop_page_')) {
            const parts = id.split('_');
            const targetUserId = parts[2];
            const action = parts[3];

            if (interaction.user.id !== targetUserId) {
                return interaction.reply({ components: [errorContainer('Unauthorized', `👤 **${interaction.user.username}**: You cannot navigate someone else's shop view.`)], flags: MessageFlags.IsComponentsV2 });
            }

            const catalog = economyStore.getOmegaMarketCatalog();
            const items = Object.values(catalog);
            const totalPages = Math.ceil(items.length / ITEMS_PER_PAGE);

            let currentPage = 1;
            const pageButton = interaction.message.components.find(c => c.components?.some(b => b.customId?.endsWith('_page')));
            if (pageButton) {
                const pageBtnComp = pageButton.components.find(b => b.customId?.endsWith('_page'));
                if (pageBtnComp?.label) {
                    currentPage = parseInt(pageBtnComp.label.split('/')[0].trim()) || 1;
                }
            }

            let newPage = currentPage;
            if (action === 'next') newPage = Math.min(totalPages, currentPage + 1);
            else if (action === 'prev') newPage = Math.max(1, currentPage - 1);
            else if (action === 'first') newPage = 1;
            else if (action === 'last') newPage = totalPages;

            const userId = await accountStore.resolveUserId(interaction.user.id);
            await this.renderShop(interaction, userId, newPage, interaction.user, true);
            return;
        }

        // Buy button triggers Modal
        if (id.startsWith('oshop_buy_')) {
            const itemId = id.replace('oshop_buy_', '').replace(/_/g, ' ');
            const catalog = economyStore.getOmegaMarketCatalog();
            let itemDetails = null;
            for (const key of Object.keys(catalog)) {
                if (key.toLowerCase() === itemId.toLowerCase()) {
                    itemDetails = catalog[key];
                    break;
                }
            }

            if (!itemDetails) return;

            const modal = new ModalBuilder()
                .setCustomId(`oshop_modal_${id.replace('oshop_buy_', '')}`)
                .setTitle(`Purchase ${itemDetails.displayName}`);

            const qtyInput = new TextInputBuilder()
                .setCustomId('quantity')
                .setLabel('How many do you want to buy?')
                .setStyle(TextInputStyle.Short)
                .setRequired(true)
                .setValue('1');

            const row = new ActionRowBuilder().addComponents(qtyInput);
            modal.addComponents(row);

            await interaction.showModal(modal);
        }
    },

    async handleModal(interaction) {
        const id = interaction.customId;
        if (!id.startsWith('oshop_modal_')) return;

        const itemId = id.replace('oshop_modal_', '').replace(/_/g, ' ');
        const qtyStr = interaction.fields.getTextInputValue('quantity');
        const quantity = parseInt(qtyStr);

        if (isNaN(quantity) || quantity <= 0) {
            return interaction.reply({ components: [errorContainer('Invalid Quantity', `👤 **${interaction.user.username}**: Please enter a valid positive number.`)], flags: MessageFlags.IsComponentsV2 });
        }

        const catalog = economyStore.getOmegaMarketCatalog();
        let itemDetails = null;
        for (const key of Object.keys(catalog)) {
            if (key.toLowerCase() === itemId.toLowerCase()) {
                itemDetails = catalog[key];
                break;
            }
        }

        if (!itemDetails) {
            return interaction.reply({ components: [errorContainer('Not Found', `👤 **${interaction.user.username}**: Item not found in Omega Shop.`)], flags: MessageFlags.IsComponentsV2 });
        }

        const userId = await accountStore.resolveUserId(interaction.user.id);
        const result = await economyStore.buyOmegaItem(userId, itemDetails.id, quantity);

        if (!result.success) {
            let msg = 'Purchase failed.';
            if (result.reason === 'insufficient_prestige') {
                msg = `🔒 **Prestige Required!** You need **Prestige ${result.needed}**, you have **Prestige ${result.have}**.`;
            } else if (result.reason === 'insufficient_coins') {
                msg = `Not enough PokéCoins! Need **${result.needed.toLocaleString()}**, have **${result.have.toLocaleString()}**.`;
            } else if (result.reason === 'daily_limit') {
                msg = `📅 **Daily Limit Reached!** You can only buy this item once per day.\n⏳ Try again in **${result.hours}h ${result.minutes}m**.`;
            }
            return interaction.reply({ components: [errorContainer('Purchase Failed', `👤 **${interaction.user.username}**: ${msg}`)], flags: MessageFlags.IsComponentsV2 });
        }

        const container = successContainer('Purchase Complete!',
            `👤 **Trainer:** ${interaction.user.username}\n\n` +
            `${itemDetails.emoji} **${result.item}** ×${result.quantity}\n\n` +
            `💸 **Spent:** ${result.spent.toLocaleString()} ${EMOJIS.COIN}\n` +
            `💰 **Remaining:** ${result.newBalance.toLocaleString()} ${EMOJIS.COIN}`
        );

        await interaction.reply({ components: [container], flags: MessageFlags.IsComponentsV2 });
    }
};
