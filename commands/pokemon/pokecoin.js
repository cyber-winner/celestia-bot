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

    async execute(interaction, client, args) {
        const isInteraction = typeof interaction.isChatInputCommand === 'function' && interaction.isChatInputCommand();
        const author = isInteraction ? interaction.user : interaction.author;
        const targetUser = isInteraction ? interaction.options.getUser('user') : interaction.mentions?.users?.first();

        let amount = null;
        if (isInteraction) {
            amount = interaction.options.getInteger('amount');
        } else if (args && args.length > 0) {
            const num = args.find(a => !isNaN(a) && a.trim() !== '');
            if (num) amount = parseInt(num);
        }

        if (!targetUser || !amount || amount <= 0) {
            return interaction.reply({
                components: [errorContainer('Invalid Transfer', 'Specify a trainer and a valid amount: `!pokecoin @User <amount>`')],
                flags: MessageFlags.IsComponentsV2 | MessageFlags.Ephemeral,
            });
        }

        if (targetUser.id === author.id) {
            return interaction.reply({ components: [errorContainer('Error', "You can't send coins to yourself!")], flags: MessageFlags.IsComponentsV2 | MessageFlags.Ephemeral });
        }

        const fromId = await accountStore.resolveUserId(author.id);
        const toId = await accountStore.resolveUserId(targetUser.id);
        const result = await economyStore.transferCoins(fromId, toId, amount);

        if (!result.success) {
            const msg = result.reason === 'insufficient' ? `Not enough coins! You have **${result.balance.toLocaleString()}**.` : 'Transfer failed.';
            return interaction.reply({ components: [errorContainer('Transfer Failed', msg)], flags: MessageFlags.IsComponentsV2 | MessageFlags.Ephemeral });
        }

        const container = successContainer('Coins Transferred! 💸',
            `🪙 **${amount.toLocaleString()} PokéCoins**\n` +
            `👤 **From:** ${author.username} (${result.fromBalance.toLocaleString()} remaining)\n` +
            `👤 **To:** ${targetUser.username}`
        );
        await interaction.reply({ components: [container], flags: MessageFlags.IsComponentsV2 });
    },
};
