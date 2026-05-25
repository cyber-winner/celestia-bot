/**
 * /inventory — View your inventory with Components V2.
 */
const { SlashCommandBuilder, ContainerBuilder, TextDisplayBuilder, SeparatorBuilder, SeparatorSpacingSize, MessageFlags } = require('discord.js');
const economyStore = require('../../store/economyStore');
const accountStore = require('../../store/accountStore');
const { COLORS, errorContainer } = require('../../utils/componentBuilder');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('inventory')
        .setDescription('View your item inventory'),
    aliases: ['inv', 'items'],

    async execute(interaction, client, args) {
        const isInteraction = typeof interaction.isChatInputCommand === 'function' && interaction.isChatInputCommand();
        const author = isInteraction ? interaction.user : interaction.author;
        const userId = await accountStore.resolveUserId(author.id);
        const inventory = await economyStore.getInventory(userId);

        if (inventory.items.length === 0) {
            return interaction.reply({
                components: [errorContainer('Empty Inventory', 'You have no items yet!\n> Buy items at the PokéMart: `/pokemart`')],
                flags: MessageFlags.IsComponentsV2 | MessageFlags.Ephemeral,
            });
        }

        const catalog = economyStore.getMarketCatalog();
        let itemsText = '';
        for (const item of inventory.items) {
            if (item.quantity <= 0) continue;
            // Find emoji from catalog
            let emoji = '📦';
            for (const [id, details] of Object.entries(catalog)) {
                if (details.displayName === item.itemName) {
                    emoji = details.emoji;
                    break;
                }
            }
            itemsText += `${emoji} **${item.itemName}** — ×${item.quantity}\n`;
        }

        const container = new ContainerBuilder()
            .setAccentColor(COLORS.CELESTIA)
            .addTextDisplayComponents(new TextDisplayBuilder().setContent(`## 🎒 Your Inventory`))
            .addSeparatorComponents(new SeparatorBuilder().setSpacing(SeparatorSpacingSize.Small).setDivider(true))
            .addTextDisplayComponents(new TextDisplayBuilder().setContent(
                `🪙 **PokéCoins:** ${inventory.pokecoins.toLocaleString()}\n` +
                `🔴 **Pokéballs:** ${inventory.pokeballs.toLocaleString()}\n\n` +
                `### Items\n${itemsText}`
            ));

        await interaction.reply({ components: [container], flags: MessageFlags.IsComponentsV2 });
    },
};
