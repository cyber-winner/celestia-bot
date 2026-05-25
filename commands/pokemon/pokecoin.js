/**
 * /pokecoin — Transfer PokéCoins to another trainer.
 */
const { SlashCommandBuilder, MessageFlags } = require('discord.js');
const economyStore = require('../../store/economyStore');
const accountStore = require('../../store/accountStore');
const { errorContainer, successContainer } = require('../../utils/componentBuilder');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('pokecoin')
        .setDescription('Transfer PokéCoins to another trainer')
        .addUserOption(opt => opt.setName('user').setDescription('Who to send coins to').setRequired(true))
        .addIntegerOption(opt => opt.setName('amount').setDescription('Amount of coins').setRequired(true).setMinValue(1)),
    aliases: ['sendcoins', 'transfer'],

    async execute(interaction) {
        const targetUser = interaction.options.getUser('user');
        const amount = interaction.options.getInteger('amount');
        if (targetUser.id === interaction.user.id) {
            return interaction.reply({ components: [errorContainer('Error', "You can't send coins to yourself!")], flags: MessageFlags.IsComponentsV2 | MessageFlags.Ephemeral });
        }

        const fromId = await accountStore.resolveUserId(interaction.user.id);
        const toId = await accountStore.resolveUserId(targetUser.id);
        const result = await economyStore.transferCoins(fromId, toId, amount);

        if (!result.success) {
            const msg = result.reason === 'insufficient' ? `Not enough coins! You have **${result.balance.toLocaleString()}**.` : 'Transfer failed.';
            return interaction.reply({ components: [errorContainer('Transfer Failed', msg)], flags: MessageFlags.IsComponentsV2 | MessageFlags.Ephemeral });
        }

        const container = successContainer('Coins Transferred! 💸',
            `🪙 **${amount.toLocaleString()} PokéCoins**\n` +
            `👤 **From:** ${interaction.user.username} (${result.fromBalance.toLocaleString()} remaining)\n` +
            `👤 **To:** ${targetUser.username}`
        );
        await interaction.reply({ components: [container], flags: MessageFlags.IsComponentsV2 });
    },
};
