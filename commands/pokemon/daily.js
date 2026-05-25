/**
 * /daily — Claim daily rewards with Components V2.
 */

const { SlashCommandBuilder, ContainerBuilder, TextDisplayBuilder, SeparatorBuilder, SeparatorSpacingSize, MessageFlags } = require('discord.js');
const economyStore = require('../../store/economyStore');
const accountStore = require('../../store/accountStore');
const { COLORS, cooldownContainer, successContainer } = require('../../utils/componentBuilder');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('daily')
        .setDescription('Claim your daily reward (800 coins + 10 Pokéballs)'),
    aliases: [],

    async execute(interaction) {
        const userId = await accountStore.resolveUserId(interaction.user.id);
        const result = await economyStore.claimDaily(userId);

        if (!result.success) {
            const container = cooldownContainer(
                'Daily Reward',
                `You've already claimed your daily reward!\n\n` +
                `⏰ **Resets in:** ${result.hours}h ${result.minutes}m\n\n` +
                `> Come back later for your next reward!`
            );

            return interaction.reply({
                components: [container],
                flags: MessageFlags.IsComponentsV2 | MessageFlags.Ephemeral,
            });
        }

        const container = new ContainerBuilder()
            .setAccentColor(COLORS.GOLD)
            .addTextDisplayComponents(
                new TextDisplayBuilder().setContent(`## 🌅 Daily Reward Claimed!`)
            )
            .addSeparatorComponents(
                new SeparatorBuilder().setSpacing(SeparatorSpacingSize.Small).setDivider(true)
            )
            .addTextDisplayComponents(
                new TextDisplayBuilder().setContent(
                    `🎁 **Rewards received:**\n` +
                    `> 🪙 **+${result.coinsAwarded.toLocaleString()} PokéCoins**\n` +
                    `> 🔴 **+${result.ballsAwarded} Pokéballs**\n\n` +
                    `💰 **Total Coins:** ${result.totalCoins.toLocaleString()}\n` +
                    `🔴 **Total Balls:** ${result.totalBalls.toLocaleString()}\n\n` +
                    `-# Come back tomorrow for more! ⏰`
                )
            );

        await interaction.reply({
            components: [container],
            flags: MessageFlags.IsComponentsV2,
        });
    },
};
