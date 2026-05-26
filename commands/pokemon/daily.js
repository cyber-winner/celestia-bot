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

    async execute(interaction, client, args) {
        const isInteraction = typeof interaction.isChatInputCommand === 'function' && interaction.isChatInputCommand();
        const author = isInteraction ? interaction.user : interaction.author;
        const userId = await accountStore.resolveUserId(author.id);
        const result = await economyStore.claimDaily(userId);

        if (!result.success) {
            const container = cooldownContainer(
                'Daily Reward',
                `👤 **${author.username}**, you've already claimed your daily reward!\n\n` +
                `⏰ **Resets in:** ${result.hours}h ${result.minutes}m\n\n` +
                `> Come back later for your next reward!`
            );

            return interaction.reply({
                components: [container],
                flags: MessageFlags.IsComponentsV2,
            });
        }

        const { SectionBuilder, ThumbnailBuilder } = require('discord.js');

        const section = new SectionBuilder();
        section.addTextDisplayComponents(
            new TextDisplayBuilder().setContent(
                `👤 **Trainer:** ${author.username}\n\n` +
                `🎁 **Rewards received:**\n` +
                `> <:pokecoins:1508755286784086037> **+${result.coinsAwarded.toLocaleString()} PokéCoins**\n` +
                `> <:Pokemon:1508753880782209085> **+${result.ballsAwarded} Pokéballs**\n\n` +
                `💰 **Total Coins:** ${result.totalCoins.toLocaleString()}\n` +
                `<:Pokemon:1508753880782209085> **Total Balls:** ${result.totalBalls.toLocaleString()}`
            )
        );
        section.setThumbnailAccessory(new ThumbnailBuilder().setURL(author.displayAvatarURL({ size: 128 })));

        const container = new ContainerBuilder()
            .setAccentColor(COLORS.GOLD)
            .addTextDisplayComponents(
                new TextDisplayBuilder().setContent(`## 🌅 Daily Reward Claimed!`)
            )
            .addSeparatorComponents(
                new SeparatorBuilder().setSpacing(SeparatorSpacingSize.Small).setDivider(true)
            )
            .addSectionComponents(section)
            .addSeparatorComponents(
                new SeparatorBuilder().setSpacing(SeparatorSpacingSize.Small).setDivider(true)
            )
            .addTextDisplayComponents(
                new TextDisplayBuilder().setContent(`-# Come back tomorrow for more! ⏰`)
            );

        await interaction.reply({
            components: [container],
            flags: MessageFlags.IsComponentsV2,
        });
    },
};
