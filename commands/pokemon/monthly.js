/**
 * /monthly — Claim monthly rewards with Components V2.
 */

const { SlashCommandBuilder, ContainerBuilder, TextDisplayBuilder, SeparatorBuilder, SeparatorSpacingSize, MessageFlags, SectionBuilder, ThumbnailBuilder } = require('discord.js');
const economyStore = require('../../store/economyStore');
const accountStore = require('../../store/accountStore');
const { COLORS, cooldownContainer } = require('../../utils/componentBuilder');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('monthly')
        .setDescription('Claim your monthly reward (100k coins, 100 balls, 15 orbs, 15 passes, 30 compasses)'),
    aliases: [],

    async execute(interaction, client, args) {
        const isInteraction = typeof interaction.isChatInputCommand === 'function' && interaction.isChatInputCommand();
        const author = isInteraction ? interaction.user : interaction.author;
        const userId = await accountStore.resolveUserId(author.id);
        const result = await economyStore.claimMonthly(userId);

        if (!result.success) {
            const container = cooldownContainer(
                'Monthly Reward',
                `👤 **${author.username}**, you've already claimed your monthly reward!\n\n` +
                `⏰ **Resets in:** ${result.days}d ${result.hours}h ${result.minutes}m\n\n` +
                `> Come back later for your next reward!`
            );

            return interaction.reply({
                components: [container],
                flags: MessageFlags.IsComponentsV2,
            });
        }

        const section = new SectionBuilder();
        section.addTextDisplayComponents(
            new TextDisplayBuilder().setContent(
                `👤 **Trainer:** ${author.username}\n\n` +
                `🎁 **Rewards received:**\n` +
                `> <:pokecoins:1508755286784086037> **+${result.coinsAwarded.toLocaleString()} PokéCoins**\n` +
                `> <:Pokemon:1508753880782209085> **+${result.ballsAwarded} Pokéballs**\n` +
                `> <a:crystal:1508755858211864596> **+${result.orbsAwarded} Level Orbs**\n` +
                `> <a:RaidPasses:1508756029259911239> **+${result.passesAwarded} Raid Passes**\n` +
                `> <:compass:1508756257840824340> **+${result.compassesAwarded} Wishing Compasses**\n\n` +
                `💰 **Total Coins:** ${result.totalCoins.toLocaleString()}\n` +
                `<:Pokemon:1508753880782209085> **Total Balls:** ${result.totalBalls.toLocaleString()}`
            )
        );
        section.setThumbnailAccessory(new ThumbnailBuilder().setURL(author.displayAvatarURL({ size: 128 })));

        const container = new ContainerBuilder()
            .setAccentColor(COLORS.CELESTIA)
            .addTextDisplayComponents(
                new TextDisplayBuilder().setContent(`## 🌙 Monthly Reward Claimed!`)
            )
            .addSeparatorComponents(
                new SeparatorBuilder().setSpacing(SeparatorSpacingSize.Small).setDivider(true)
            )
            .addSectionComponents(section)
            .addSeparatorComponents(
                new SeparatorBuilder().setSpacing(SeparatorSpacingSize.Small).setDivider(true)
            )
            .addTextDisplayComponents(
                new TextDisplayBuilder().setContent(`-# Come back next month for more! ⏰`)
            );

        await interaction.reply({
            components: [container],
            flags: MessageFlags.IsComponentsV2,
        });
    },
};
