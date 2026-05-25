/**
 * /weekly — Claim weekly rewards with Components V2.
 */

const { SlashCommandBuilder, ContainerBuilder, TextDisplayBuilder, SeparatorBuilder, SeparatorSpacingSize, MessageFlags } = require('discord.js');
const economyStore = require('../../store/economyStore');
const accountStore = require('../../store/accountStore');
const { COLORS, cooldownContainer } = require('../../utils/componentBuilder');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('weekly')
        .setDescription('Claim your weekly reward (10,000 coins + 50 Pokéballs + 3 Level Orbs)'),
    aliases: [],

    async execute(interaction, client, args) {
        const isInteraction = typeof interaction.isChatInputCommand === 'function' && interaction.isChatInputCommand();
        const author = isInteraction ? interaction.user : interaction.author;
        const userId = await accountStore.resolveUserId(author.id);
        const result = await economyStore.claimWeekly(userId);

        if (!result.success) {
            const container = cooldownContainer(
                'Weekly Reward',
                `You've already claimed your weekly reward!\n\n` +
                `⏰ **Resets in:** ${result.days}d ${result.hours}h ${result.minutes}m\n\n` +
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
                new TextDisplayBuilder().setContent(`## 🗓️ Weekly Reward Claimed!`)
            )
            .addSeparatorComponents(
                new SeparatorBuilder().setSpacing(SeparatorSpacingSize.Small).setDivider(true)
            )
            .addTextDisplayComponents(
                new TextDisplayBuilder().setContent(
                    `🎁 **Rewards received:**\n` +
                    `> 🪙 **+${result.coinsAwarded.toLocaleString()} PokéCoins**\n` +
                    `> 🔴 **+${result.ballsAwarded} Pokéballs**\n` +
                    `> 🔮 **+${result.orbsAwarded} Level Orbs**\n\n` +
                    `💰 **Total Coins:** ${result.totalCoins.toLocaleString()}\n` +
                    `🔴 **Total Balls:** ${result.totalBalls.toLocaleString()}\n\n` +
                    `-# Come back next week for more! ⏰`
                )
            );

        await interaction.reply({
            components: [container],
            flags: MessageFlags.IsComponentsV2,
        });
    },
};
