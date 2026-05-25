const { SlashCommandBuilder, ContainerBuilder, TextDisplayBuilder, SeparatorBuilder, SeparatorSpacingSize, MessageFlags } = require('discord.js');
const pokemonStore = require('../../store/pokemonStore');
const accountStore = require('../../store/accountStore');
const { COLORS } = require('../../utils/componentBuilder');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('pokeboard')
        .setDescription('View the top Pokémon trainers leaderboard'),
    aliases: ['trainerboard', 'leaderboard'],

    async execute(interaction, client, args) {
        const isInteraction = typeof interaction.isChatInputCommand === 'function' && interaction.isChatInputCommand();
        if (isInteraction) {
            await interaction.deferReply({ flags: MessageFlags.IsComponentsV2 });
        }

        const leaderboard = await pokemonStore.getTrainerLeaderboard();

        if (leaderboard.length === 0) {
            const container = new ContainerBuilder()
                .setAccentColor(COLORS.WARNING)
                .addTextDisplayComponents(
                    new TextDisplayBuilder().setContent(
                        `## 🏆 Trainer Leaderboard\n\n> No trainers yet! Be the first!`
                    )
                );
            if (isInteraction) {
                return interaction.editReply({ components: [container], flags: MessageFlags.IsComponentsV2 });
            } else {
                return interaction.reply({ components: [container], flags: MessageFlags.IsComponentsV2 });
            }
        }

        let boardText = '';
        for (let i = 0; i < leaderboard.length; i++) {
            const entry = leaderboard[i];
            const medal = i === 0 ? '🥇' : i === 1 ? '🥈' : i === 2 ? '🥉' : `\`${i + 1}.\``;
            const name = await accountStore.getLeaderboardName(entry.userId);
            boardText += `${medal} **${name}**\n`;
            boardText += `> 🎯 ${entry.totalCaught} caught · 📖 ${entry.uniqueCount} unique · ⭐ Lv.${entry.bestLevel} · 🏅 **${entry.score.toLocaleString()}** pts\n\n`;
        }

        const container = new ContainerBuilder()
            .setAccentColor(COLORS.GOLD)
            .addTextDisplayComponents(new TextDisplayBuilder().setContent(`## 🏆 Trainer Leaderboard`))
            .addSeparatorComponents(new SeparatorBuilder().setSpacing(SeparatorSpacingSize.Small).setDivider(true))
            .addTextDisplayComponents(new TextDisplayBuilder().setContent(boardText))
            .addSeparatorComponents(new SeparatorBuilder().setSpacing(SeparatorSpacingSize.Small).setDivider(true))
            .addTextDisplayComponents(new TextDisplayBuilder().setContent(`-# Score = (Unique × 150) + (Caught × 35) + (Best Lv × 10) + Avg Lv`));

        if (isInteraction) {
            await interaction.editReply({ components: [container], flags: MessageFlags.IsComponentsV2 });
        } else {
            await interaction.reply({ components: [container], flags: MessageFlags.IsComponentsV2 });
        }
    },
};
