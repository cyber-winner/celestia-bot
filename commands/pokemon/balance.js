/**
 * /balance — View your Pokémon economy wallet with Components V2.
 */

const { SlashCommandBuilder, ContainerBuilder, TextDisplayBuilder, SeparatorBuilder, SeparatorSpacingSize, MessageFlags } = require('discord.js');
const economyStore = require('../../store/economyStore');
const accountStore = require('../../store/accountStore');
const { COLORS } = require('../../utils/componentBuilder');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('balance')
        .setDescription('View your wallet and economy status')
        .addUserOption(opt =>
            opt.setName('user')
                .setDescription('Check another trainer\'s balance')
                .setRequired(false)
        ),
    aliases: ['bal', 'wallet'],

    async execute(interaction) {
        const targetUser = interaction.options?.getUser?.('user') || interaction.user;
        const userId = await accountStore.resolveUserId(targetUser.id);
        const isSelf = targetUser.id === interaction.user.id;

        const balance = await economyStore.getBalance(userId);
        const inventory = await economyStore.getInventory(userId);

        let itemsText = '';
        if (inventory.items.length > 0) {
            itemsText = inventory.items
                .filter(i => i.quantity > 0)
                .map(i => `> ${i.itemName} — ×${i.quantity}`)
                .join('\n');
        } else {
            itemsText = '> *No items yet*';
        }

        const container = new ContainerBuilder()
            .setAccentColor(COLORS.ECONOMY)
            .addTextDisplayComponents(
                new TextDisplayBuilder().setContent(
                    `## 💰 ${isSelf ? 'Your' : `${targetUser.username}'s`} Wallet`
                )
            )
            .addSeparatorComponents(
                new SeparatorBuilder().setSpacing(SeparatorSpacingSize.Small).setDivider(true)
            )
            .addTextDisplayComponents(
                new TextDisplayBuilder().setContent(
                    `🪙 **PokéCoins:** ${balance.pokecoins.toLocaleString()}\n` +
                    `🔴 **Pokéballs:** ${balance.pokeballs.toLocaleString()}\n` +
                    `💎 **Radiant Crystals:** ${(balance.radiantCrystals || 0).toLocaleString()}`
                )
            )
            .addSeparatorComponents(
                new SeparatorBuilder().setSpacing(SeparatorSpacingSize.Small).setDivider(true)
            )
            .addTextDisplayComponents(
                new TextDisplayBuilder().setContent(
                    `### 🎒 Inventory\n${itemsText}`
                )
            );

        await interaction.reply({
            components: [container],
            flags: MessageFlags.IsComponentsV2,
        });
    },
};
