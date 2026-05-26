/**
 * /shop — Celestia's Shop with Components V2 and Modals.
 */
const { SlashCommandBuilder, ContainerBuilder, TextDisplayBuilder, SeparatorBuilder, SeparatorSpacingSize, ActionRowBuilder, ButtonBuilder, ButtonStyle, MessageFlags, ModalBuilder, TextInputBuilder, TextInputStyle, SectionBuilder } = require('discord.js');
const economyStore = require('../../store/economyStore');
const accountStore = require('../../store/accountStore');
const { COLORS, errorContainer, successContainer, paginationRow, EMOJIS } = require('../../utils/componentBuilder');

const ITEMS_PER_PAGE = 5;

module.exports = {
    data: new SlashCommandBuilder()
        .setName('shop')
        .setDescription('Browse and buy items from Celestia\'s Shop'),
    aliases: ['store', 'market'],

    async execute(interaction, client, args) {
        const isInteraction = typeof interaction.isChatInputCommand === 'function' && interaction.isChatInputCommand();
        const author = isInteraction ? interaction.user : interaction.author;
        const userId = await accountStore.resolveUserId(author.id);

        const page = 1;
        await this.renderShop(interaction, userId, page, author);
    },

    async renderShop(interaction, userId, page, author, isUpdate = false) {
        const catalog = economyStore.getMarketCatalog();
        const items = Object.values(catalog);
        const totalPages = Math.ceil(items.length / ITEMS_PER_PAGE);
        const startIndex = (page - 1) * ITEMS_PER_PAGE;
        const pageItems = items.slice(startIndex, startIndex + ITEMS_PER_PAGE);
        
        const balance = await economyStore.getBalance(userId);

        const container = new ContainerBuilder()
            .setAccentColor(COLORS.CELESTIA)
            .addTextDisplayComponents(new TextDisplayBuilder().setContent(`## 🏪 Celestia's Shop`))
            .addSeparatorComponents(new SeparatorBuilder().setSpacing(SeparatorSpacingSize.Small).setDivider(true))
            .addTextDisplayComponents(new TextDisplayBuilder().setContent(
                `💰 **Your Balance:** ${balance.pokecoins.toLocaleString()} ${EMOJIS.COIN} · ${(balance.radiantCrystals || 0).toLocaleString()} ${EMOJIS.CRYSTAL}`
            ));

        for (const item of pageItems) {
            container.addSeparatorComponents(new SeparatorBuilder().setSpacing(SeparatorSpacingSize.Small).setDivider(true));
            
            const actualCurrency = item.id === 'wishing compass' ? EMOJIS.CRYSTAL : EMOJIS.COIN;

            const itemSection = new SectionBuilder();
            itemSection.addTextDisplayComponents(new TextDisplayBuilder().setContent(
                `${item.emoji} **${item.displayName}**\n` +
                `🏷️ **Price:** ${item.price.toLocaleString()} ${actualCurrency}${item.quantity > 1 ? ` (×${item.quantity})` : ''}\n` +
                `> ${item.description}`
            ));

            const safeId = item.id.replace(/\s+/g, '_');
            itemSection.setButtonAccessory(
                new ButtonBuilder()
                    .setCustomId(`shop_buy_${safeId}`)
                    .setEmoji(item.emoji)
                    .setLabel('Buy')
                    .setStyle(ButtonStyle.Success)
            );

            container.addSectionComponents(itemSection);
        }

        container.addSeparatorComponents(new SeparatorBuilder().setSpacing(SeparatorSpacingSize.Small).setDivider(true));
        container.addTextDisplayComponents(new TextDisplayBuilder().setContent(`-# Page ${page}/${totalPages} · Use buttons to navigate`));

        const pagRow = paginationRow(`shop_page_${author.id}`, page, totalPages);
        container.addActionRowComponents(pagRow);
        const components = [container];

        if (isUpdate && interaction.update) {
            await interaction.update({ components, flags: MessageFlags.IsComponentsV2 });
        } else if (interaction.editReply && !interaction.replied) {
            await interaction.reply({ components, flags: MessageFlags.IsComponentsV2 });
        } else {
            await interaction.reply({ components, flags: MessageFlags.IsComponentsV2 });
        }
    },

    async handleButton(interaction) {
        const id = interaction.customId;
        
        // Pagination
        if (id.startsWith('shop_page_')) {
            const parts = id.split('_');
            const targetUserId = parts[2];
            const action = parts[3];

            if (interaction.user.id !== targetUserId) {
                return interaction.reply({ components: [errorContainer('Unauthorized', 'You cannot navigate someone else\'s shop view.')], flags: MessageFlags.IsComponentsV2 | MessageFlags.Ephemeral });
            }

            const catalog = economyStore.getMarketCatalog();
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
        if (id.startsWith('shop_buy_')) {
            const itemId = id.replace('shop_buy_', '').replace(/_/g, ' ');
            const catalog = economyStore.getMarketCatalog();
            let itemDetails = null;
            for (const key of Object.keys(catalog)) {
                if (key.toLowerCase() === itemId.toLowerCase()) {
                    itemDetails = catalog[key];
                    break;
                }
            }

            if (!itemDetails) return;

            const modal = new ModalBuilder()
                .setCustomId(`shop_modal_${id.replace('shop_buy_', '')}`)
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
        if (!id.startsWith('shop_modal_')) return;

        const itemId = id.replace('shop_modal_', '').replace(/_/g, ' ');
        const qtyStr = interaction.fields.getTextInputValue('quantity');
        const quantity = parseInt(qtyStr);

        if (isNaN(quantity) || quantity <= 0) {
            return interaction.reply({ components: [errorContainer('Invalid Quantity', 'Please enter a valid positive number.')], flags: MessageFlags.IsComponentsV2 | MessageFlags.Ephemeral });
        }

        const catalog = economyStore.getMarketCatalog();
        let itemDetails = null;
        for (const key of Object.keys(catalog)) {
            if (key.toLowerCase() === itemId.toLowerCase()) {
                itemDetails = catalog[key];
                break;
            }
        }

        if (!itemDetails) {
            return interaction.reply({ components: [errorContainer('Not Found', 'Item not found in shop.')], flags: MessageFlags.IsComponentsV2 | MessageFlags.Ephemeral });
        }

        const userId = await accountStore.resolveUserId(interaction.user.id);
        const result = await economyStore.buyItem(userId, itemDetails.id, quantity);

        if (!result.success) {
            const currency = itemDetails.id === 'wishing compass' ? 'crystals' : 'coins';
            const msg = result.reason === `insufficient_${currency}`
                ? `Not enough ${currency}! Need **${result.needed.toLocaleString()}**, have **${result.have.toLocaleString()}**.`
                : 'Purchase failed.';
            return interaction.reply({ components: [errorContainer('Purchase Failed', msg)], flags: MessageFlags.IsComponentsV2 | MessageFlags.Ephemeral });
        }

        const currencyEmoji = itemDetails.id === 'wishing compass' ? EMOJIS.CRYSTAL : EMOJIS.COIN;

        const container = successContainer('Purchase Complete!',
            `${itemDetails.emoji} **${result.item}** ×${result.quantity}\n\n` +
            `💸 **Spent:** ${result.spent.toLocaleString()} ${currencyEmoji}\n` +
            `💰 **Remaining:** ${result.newBalance.toLocaleString()} ${currencyEmoji}`
        );

        await interaction.reply({ components: [container], flags: MessageFlags.IsComponentsV2 | MessageFlags.Ephemeral });
    }
};
