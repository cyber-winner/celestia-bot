/**
 * /baltop — Richest players leaderboard.
 */
const { SlashCommandBuilder, ContainerBuilder, TextDisplayBuilder, SeparatorBuilder, SeparatorSpacingSize, ActionRowBuilder, ButtonBuilder, ButtonStyle, MessageFlags } = require('discord.js');
const economyStore = require('../../store/economyStore');
const accountStore = require('../../store/accountStore');
const { COLORS } = require('../../utils/componentBuilder');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('baltop')
        .setDescription('View the richest trainers leaderboard')
        .addStringOption(opt => opt.setName('type').setDescription('coins or crystals').setRequired(false)
            .addChoices({ name: 'PokéCoins', value: 'coins' }, { name: 'Radiant Crystals', value: 'crystals' })),
    aliases: ['richest'],

    async execute(interaction, client, args) {
        const isInteraction = typeof interaction.isChatInputCommand === 'function' && interaction.isChatInputCommand();
        if (isInteraction) {
            await interaction.deferReply({ flags: MessageFlags.IsComponentsV2 });
        }

        const type = isInteraction ? (interaction.options?.getString?.('type') || 'coins') : (args?.[0]?.toLowerCase() === 'crystals' ? 'crystals' : 'coins');
        const isCrystals = type === 'crystals';
        const top = isCrystals ? await economyStore.getCrystalTop(10) : await economyStore.getBalTop(10);

        if (top.length === 0) {
            const container = new ContainerBuilder().setAccentColor(COLORS.WARNING)
                .addTextDisplayComponents(new TextDisplayBuilder().setContent(`## 💰 No data yet!`));
            if (isInteraction) {
                return interaction.editReply({ components: [container], flags: MessageFlags.IsComponentsV2 });
            } else {
                return interaction.reply({ components: [container], flags: MessageFlags.IsComponentsV2 });
            }
        }

        let boardText = '';
        for (let i = 0; i < top.length; i++) {
            const w = top[i];
            const medal = i === 0 ? '🥇' : i === 1 ? '🥈' : i === 2 ? '🥉' : `\`${i + 1}.\``;
            const name = await accountStore.getLeaderboardName(w.userId);
            const val = isCrystals ? (w.radiantCrystals || 0) : w.pokecoins;
            const icon = isCrystals ? '💎' : '🪙';
            boardText += `${medal} **${name}** — ${icon} **${val.toLocaleString()}**\n`;
        }

        const title = isCrystals ? '💎 Radiant Crystal Leaderboard' : '💰 Richest Trainers';
        const container = new ContainerBuilder().setAccentColor(isCrystals ? COLORS.CRYSTAL : COLORS.GOLD)
            .addTextDisplayComponents(new TextDisplayBuilder().setContent(`## ${title}`))
            .addSeparatorComponents(new SeparatorBuilder().setSpacing(SeparatorSpacingSize.Small).setDivider(true))
            .addTextDisplayComponents(new TextDisplayBuilder().setContent(boardText));

        const row = new ActionRowBuilder().addComponents(
            new ButtonBuilder().setCustomId('baltop_coins').setLabel('PokéCoins').setEmoji('🪙').setStyle(isCrystals ? ButtonStyle.Secondary : ButtonStyle.Primary),
            new ButtonBuilder().setCustomId('baltop_crystals').setLabel('Crystals').setEmoji('💎').setStyle(isCrystals ? ButtonStyle.Primary : ButtonStyle.Secondary),
        );

        if (isInteraction) {
            await interaction.editReply({ components: [container, row], flags: MessageFlags.IsComponentsV2 });
        } else {
            await interaction.reply({ components: [container, row], flags: MessageFlags.IsComponentsV2 });
        }
    },

    async handleButton(interaction) {
        const type = interaction.customId === 'baltop_crystals' ? 'crystals' : 'coins';
        interaction.options = { getString: () => type, getInteger: () => null, getUser: () => null };
        await interaction.deferUpdate();
        const isCrystals = type === 'crystals';
        const top = isCrystals ? await economyStore.getCrystalTop(10) : await economyStore.getBalTop(10);

        let boardText = '';
        for (let i = 0; i < top.length; i++) {
            const w = top[i];
            const medal = i === 0 ? '🥇' : i === 1 ? '🥈' : i === 2 ? '🥉' : `\`${i + 1}.\``;
            const name = await accountStore.getLeaderboardName(w.userId);
            const val = isCrystals ? (w.radiantCrystals || 0) : w.pokecoins;
            const icon = isCrystals ? '💎' : '🪙';
            boardText += `${medal} **${name}** — ${icon} **${val.toLocaleString()}**\n`;
        }

        const title = isCrystals ? '💎 Radiant Crystal Leaderboard' : '💰 Richest Trainers';
        const container = new ContainerBuilder().setAccentColor(isCrystals ? COLORS.CRYSTAL : COLORS.GOLD)
            .addTextDisplayComponents(new TextDisplayBuilder().setContent(`## ${title}`))
            .addSeparatorComponents(new SeparatorBuilder().setSpacing(SeparatorSpacingSize.Small).setDivider(true))
            .addTextDisplayComponents(new TextDisplayBuilder().setContent(boardText));

        const row = new ActionRowBuilder().addComponents(
            new ButtonBuilder().setCustomId('baltop_coins').setLabel('PokéCoins').setEmoji('🪙').setStyle(isCrystals ? ButtonStyle.Secondary : ButtonStyle.Primary),
            new ButtonBuilder().setCustomId('baltop_crystals').setLabel('Crystals').setEmoji('💎').setStyle(isCrystals ? ButtonStyle.Primary : ButtonStyle.Secondary),
        );

        await interaction.editReply({ components: [container, row], flags: MessageFlags.IsComponentsV2 });
    },
};
