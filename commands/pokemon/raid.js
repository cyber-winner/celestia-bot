/**
 * /raid — Global Raid Boss system with Components V2.
 * Works alongside the raidSpawn event for auto-spawning.
 */
const {
    SlashCommandBuilder, ContainerBuilder, TextDisplayBuilder, SeparatorBuilder,
    SeparatorSpacingSize, ActionRowBuilder, ButtonBuilder, ButtonStyle,
    MediaGalleryBuilder, MediaGalleryItemBuilder, MessageFlags, SectionBuilder, ThumbnailBuilder,
} = require('discord.js');
const accountStore = require('../../store/accountStore');
const ActiveRaid = require('../../models/ActiveRaid');
const { COLORS, getTypeColor, getRankBadge, errorContainer } = require('../../utils/componentBuilder');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('raid')
        .setDescription('View or manage Global Raid Boss battles')
        .addSubcommand(sub => sub.setName('status').setDescription('View current raid status'))
        .addSubcommand(sub => sub.setName('spawn').setDescription('Admin: Force spawn a new raid in this channel')),
    aliases: [],

    async execute(interaction, client, args) {
        const isInteraction = typeof interaction.isChatInputCommand === 'function' && interaction.isChatInputCommand();
        let sub = 'status';
        if (isInteraction) {
            sub = interaction.options.getSubcommand();
        } else if (args && args[0]) {
            sub = args[0].toLowerCase();
        }

        if (sub === 'status') {
            return this.showStatus(interaction);
        } else if (sub === 'spawn') {
            // Admin only
            if (interaction.user.id !== '518465056711671808' && !interaction.member?.permissions?.has('Administrator')) {
                return interaction.reply({ content: '❌ Only admins can force-spawn a raid.', flags: MessageFlags.Ephemeral });
            }
            await interaction.reply({ content: '✅ Spawning a new raid...', flags: MessageFlags.Ephemeral });
            const raidSpawn = require('../../events/raidSpawn');
            await raidSpawn.forceSpawnRaid(client, interaction.channel.id);
        }
    },

    async showStatus(interaction) {
        const raidDoc = await ActiveRaid.findOne({});
        if (!raidDoc) {
            return interaction.reply({
                components: [errorContainer('No Active Raid', `👤 **${interaction.user.username}**: No Global Raid is currently active.\n\n> Raids spawn hourly across all platforms!`)],
                flags: MessageFlags.IsComponentsV2,
            });
        }

        const boss = raidDoc.boss;
        const hpPct = Math.round((boss.hp / boss.maxHp) * 100);
        const filled = Math.round((boss.hp / boss.maxHp) * 20);
        const empty = 20 - filled;
        const hpBar = '█'.repeat(Math.max(0, filled)) + '░'.repeat(Math.max(0, empty));
        const typeColor = getTypeColor(boss.types);

        const container = new ContainerBuilder().setAccentColor(typeColor);
        container.addTextDisplayComponents(new TextDisplayBuilder().setContent(`## 🏟️ Global Raid Status`));

        if (boss.cardImage) {
            container.addMediaGalleryComponents(new MediaGalleryBuilder().addItems(new MediaGalleryItemBuilder().setURL(boss.cardImage)));
        }

        container.addSeparatorComponents(new SeparatorBuilder().setSpacing(SeparatorSpacingSize.Small).setDivider(true));

        let rarityLabel = '';
        if (boss.isMythical) rarityLabel = '✨ MYTHICAL';
        else if (boss.isLegendary) rarityLabel = '👑 LEGENDARY';

        container.addTextDisplayComponents(new TextDisplayBuilder().setContent(
            `<:Pokemon:1508753880782209085> **Boss:** ${boss.name} (Lv. ${boss.level})\n` +
            (rarityLabel ? `⭐ **Rarity:** ${rarityLabel}\n` : '') +
            `❤️ **HP:** \`[${hpBar}]\` **${hpPct}%**\n` +
            `> ${boss.hp.toLocaleString()} / ${boss.maxHp.toLocaleString()} HP\n` +
            `🔖 **Type:** ${(boss.types || []).join(' / ')}`
        ));

        container.addSeparatorComponents(new SeparatorBuilder().setSpacing(SeparatorSpacingSize.Small).setDivider(true));

        // Participants
        const participants = raidDoc.participants || [];
        let participantsText = `### 👥 Participants (${participants.length})\n`;
        if (participants.length === 0) {
            participantsText += '> No participants yet!';
        } else {
            const sorted = [...participants].sort((a, b) => b.damageDealt - a.damageDealt);
            for (let i = 0; i < Math.min(sorted.length, 10); i++) {
                const p = sorted[i];
                const medal = i === 0 ? '🥇' : i === 1 ? '🥈' : i === 2 ? '🥉' : `\`${i + 1}.\``;
                participantsText += `${medal} **${p.senderName}** — ${p.pokemonName}\n`;
                participantsText += `> ⚔️ ${p.damageDealt.toLocaleString()} dmg · 🔄 ${p.tries - 1} faints\n\n`;
            }
        }
        container.addTextDisplayComponents(new TextDisplayBuilder().setContent(participantsText));

        container.addSeparatorComponents(new SeparatorBuilder().setSpacing(SeparatorSpacingSize.Small).setDivider(true));
        container.addTextDisplayComponents(new TextDisplayBuilder().setContent(
            `-# <a:RaidPasses:1508756029259911239> Use the Join Raid button in the raid channel to enter!`
        ));

        const row = new ActionRowBuilder().addComponents(
            new ButtonBuilder().setCustomId('raid_refresh').setEmoji('🔄').setLabel('Refresh').setStyle(ButtonStyle.Secondary),
        );

        const replyPayload = { components: [container.addActionRowComponents(row)], flags: MessageFlags.IsComponentsV2 };
        if (interaction.replied || interaction.deferred) {
            await interaction.editReply(replyPayload);
        } else {
            await interaction.reply(replyPayload);
        }
    },

    async handleButton(interaction) {
        if (interaction.customId === 'raid_refresh') {
            await interaction.deferUpdate();
            await this.showStatus(interaction);
        }
        if (interaction.customId === 'raid_status_btn') {
            await this.showStatus(interaction);
        }
    },
};
