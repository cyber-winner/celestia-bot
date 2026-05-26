/**
 * /leaderboard — Unified premium leaderboard for Trainers, Net Worth, Coins, and Crystals.
 */
const { SlashCommandBuilder, ContainerBuilder, TextDisplayBuilder, SeparatorBuilder, SeparatorSpacingSize, ActionRowBuilder, ButtonBuilder, ButtonStyle, MessageFlags, SectionBuilder, ThumbnailBuilder } = require('discord.js');
const economyStore = require('../../store/economyStore');
const pokemonStore = require('../../store/pokemonStore');
const accountStore = require('../../store/accountStore');
const { COLORS, EMOJIS } = require('../../utils/componentBuilder');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('leaderboard')
        .setDescription('View the global leaderboards')
        .addStringOption(opt => opt.setName('category').setDescription('Which leaderboard to view').setRequired(false)
            .addChoices(
                { name: '🏆 Top Trainers (Points)', value: 'points' },
                { name: '💎 Net Worth', value: 'networth' },
                { name: '🪙 PokéCoins', value: 'coins' },
                { name: '✨ Radiant Crystals', value: 'crystals' }
            )),
    aliases: ['lb', 'top', 'baltop', 'pokeboard', 'richest', 'trainerboard'],

    async execute(interaction, client, args) {
        const isInteraction = typeof interaction.isChatInputCommand === 'function' && interaction.isChatInputCommand();
        let category = 'points';

        if (isInteraction) {
            category = interaction.options?.getString?.('category') || 'points';
        } else if (args && args.length > 0) {
            const raw = args[0].toLowerCase();
            if (['points', 'networth', 'coins', 'crystals', 'crystal', 'coin', 'worth', 'trainer'].includes(raw)) {
                if (raw === 'trainer') category = 'points';
                else if (raw === 'worth') category = 'networth';
                else if (raw === 'coin') category = 'coins';
                else if (raw === 'crystal') category = 'crystals';
                else category = raw;
            }
        }

        const author = isInteraction ? interaction.user : interaction.author;
        await this.renderLeaderboard(interaction, category, author);
    },

    async handleButton(interaction) {
        const customId = interaction.customId;
        if (!customId.startsWith('lb_')) return;

        const category = customId.replace('lb_', '');
        await this.renderLeaderboard(interaction, category, interaction.user, true);
    },

    async renderLeaderboard(interaction, category, author, isUpdate = false) {
        if (isUpdate) {
            await interaction.deferUpdate();
        } else if (typeof interaction.isChatInputCommand === 'function' && interaction.isChatInputCommand()) {
            await interaction.deferReply({ flags: MessageFlags.IsComponentsV2 });
        }

        let title = '';
        let color = COLORS.GOLD;
        let boardText = '';
        
        if (category === 'points') {
            title = '🏆 Top Trainers (PokéPoints)';
            color = COLORS.CELESTIA;
            const top = await pokemonStore.getTrainerLeaderboard();
            if (top.length === 0) {
                boardText = '> No trainers have points yet!';
            } else {
                const names = await Promise.all(top.slice(0, 10).map(w => accountStore.getLeaderboardName(w.userId)));
                for (let i = 0; i < Math.min(top.length, 10); i++) {
                    const w = top[i];
                    const medal = i === 0 ? '🥇' : i === 1 ? '🥈' : i === 2 ? '🥉' : `\`${i + 1}.\``;
                    const name = names[i];
                    boardText += `${medal} **${name}**\n> 🎯 ${w.totalCaught} caught · 📖 ${w.uniqueCount} unique · 🏅 **${w.score.toLocaleString()} pts**\n\n`;
                }
            }
        } else if (category === 'networth') {
            title = '💎 Global Net Worth';
            color = COLORS.LEGENDARY;
            const top = await economyStore.getNetWorthTop(10);
            if (top.length === 0) {
                boardText = '> No data available!';
            } else {
                const names = await Promise.all(top.map(w => accountStore.getLeaderboardName(w.userId)));
                for (let i = 0; i < top.length; i++) {
                    const w = top[i];
                    const medal = i === 0 ? '🥇' : i === 1 ? '🥈' : i === 2 ? '🥉' : `\`${i + 1}.\``;
                    const name = names[i];
                    boardText += `${medal} **${name}** — 💰 **${(w.netWorth || 0).toLocaleString()}** Value\n`;
                }
            }
        } else if (category === 'coins') {
            title = '🪙 Richest Trainers (PokéCoins)';
            color = COLORS.GOLD;
            const top = await economyStore.getBalTop(10);
            if (top.length === 0) {
                boardText = '> No data available!';
            } else {
                const names = await Promise.all(top.map(w => accountStore.getLeaderboardName(w.userId)));
                for (let i = 0; i < top.length; i++) {
                    const w = top[i];
                    const medal = i === 0 ? '🥇' : i === 1 ? '🥈' : i === 2 ? '🥉' : `\`${i + 1}.\``;
                    const name = names[i];
                    boardText += `${medal} **${name}** — ${EMOJIS.COIN} **${(w.pokecoins || 0).toLocaleString()}**\n`;
                }
            }
        } else if (category === 'crystals') {
            title = '✨ Radiant Crystal Hoarders';
            color = COLORS.CRYSTAL;
            const top = await economyStore.getCrystalTop(10);
            if (top.length === 0) {
                boardText = '> No data available!';
            } else {
                const names = await Promise.all(top.map(w => accountStore.getLeaderboardName(w.userId)));
                for (let i = 0; i < top.length; i++) {
                    const w = top[i];
                    const medal = i === 0 ? '🥇' : i === 1 ? '🥈' : i === 2 ? '🥉' : `\`${i + 1}.\``;
                    const name = names[i];
                    boardText += `${medal} **${name}** — ${EMOJIS.CRYSTAL} **${(w.radiantCrystals || 0).toLocaleString()}**\n`;
                }
            }
        }

        const section = new SectionBuilder();
        section.addTextDisplayComponents(
            new TextDisplayBuilder().setContent(
                `👤 **Viewer:** ${author.username}\n\n` +
                boardText
            )
        );
        section.setThumbnailAccessory(new ThumbnailBuilder().setURL(author.displayAvatarURL({ size: 128 })));

        const container = new ContainerBuilder().setAccentColor(color)
            .addTextDisplayComponents(new TextDisplayBuilder().setContent(`## ${title}`))
            .addSeparatorComponents(new SeparatorBuilder().setSpacing(SeparatorSpacingSize.Small).setDivider(true))
            .addSectionComponents(section);

        if (category === 'points') {
            container.addSeparatorComponents(new SeparatorBuilder().setSpacing(SeparatorSpacingSize.Small).setDivider(true));
            container.addTextDisplayComponents(new TextDisplayBuilder().setContent(`-# Points = (Unique × 150) + (Caught × 35) + (Best Lv × 10) + Avg Lv`));
        } else if (category === 'networth') {
            container.addSeparatorComponents(new SeparatorBuilder().setSpacing(SeparatorSpacingSize.Small).setDivider(true));
            container.addTextDisplayComponents(new TextDisplayBuilder().setContent(`-# Value = Coins + (Crystals × 1500) + (Pokéballs × 25)`));
        }

        const row = new ActionRowBuilder().addComponents(
            new ButtonBuilder().setCustomId('lb_points').setLabel('Top Trainers').setEmoji('🏆').setStyle(category === 'points' ? ButtonStyle.Success : ButtonStyle.Secondary).setDisabled(category === 'points'),
            new ButtonBuilder().setCustomId('lb_networth').setLabel('Net Worth').setEmoji('💎').setStyle(category === 'networth' ? ButtonStyle.Primary : ButtonStyle.Secondary).setDisabled(category === 'networth'),
            new ButtonBuilder().setCustomId('lb_coins').setLabel('PokéCoins').setEmoji(EMOJIS.COIN).setStyle(category === 'coins' ? ButtonStyle.Primary : ButtonStyle.Secondary).setDisabled(category === 'coins'),
            new ButtonBuilder().setCustomId('lb_crystals').setLabel('Crystals').setEmoji(EMOJIS.CRYSTAL).setStyle(category === 'crystals' ? ButtonStyle.Primary : ButtonStyle.Secondary).setDisabled(category === 'crystals'),
        );

        const payload = { components: [container.addActionRowComponents(row)], flags: MessageFlags.IsComponentsV2 };

        if (isUpdate || interaction.replied || interaction.deferred) {
            await interaction.editReply(payload).catch(() => {});
        } else {
            await interaction.reply(payload).catch(() => {});
        }
    }
};
