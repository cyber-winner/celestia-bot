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

        const raidSpawn = require('../../events/raidSpawn');
        const container = raidSpawn.buildRaidContainer(raidDoc.boss, raidDoc.participants);
        const buttons = raidSpawn.buildRaidButtons();

        const replyPayload = { components: [container, buttons], flags: MessageFlags.IsComponentsV2 };
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
