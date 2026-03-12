const { SlashCommandBuilder, PermissionFlagsBits, ContainerBuilder, TextDisplayBuilder, MessageFlags, SeparatorBuilder, SeparatorSpacingSize, SectionBuilder, ThumbnailBuilder } = require('discord.js');
const { logModerationAction } = require('../../utils/modLogger');

module.exports = {
    category: 'moderation',
    data: new SlashCommandBuilder()
        .setName('unlock')
        .setDescription('Unlocks the current channel from a previous lock.')
        .addStringOption(opt => opt.setName('locktype')
            .setDescription('The type of lock to lift')
            .setRequired(true)
            .addChoices(
                { name: 'View Lock (Hides channel)', value: 'viewlock' },
                { name: 'Message Lock (Disables sending)', value: 'msglock' }
            )
        )
        .addUserOption(opt => opt.setName('user').setDescription('The user to unlock. If empty, unlocks the entire channel.'))
        .setDefaultMemberPermissions(PermissionFlagsBits.ManageChannels),
    aliases: ['unlock'],
    async execute(interaction, client, args) {
        if (!interaction.isChatInputCommand?.()) return;

        const locktype = interaction.options.getString('locktype');
        const targetUser = interaction.options.getUser('user');
        const channel = interaction.channel;
        const guild = interaction.guild;
        const targetId = targetUser ? targetUser.id : guild.id;

        let overwritePayload = {};
        let actionStr = '';
        let lockIcon = '';

        if (locktype === 'viewlock') {
            overwritePayload = { ViewChannel: null };
            lockIcon = '👁️';
            actionStr = targetUser ? `Visibility restored for **${targetUser.tag}**` : `Visibility restored for **@everyone**`;
        } else if (locktype === 'msglock') {
            overwritePayload = { SendMessages: null };
            lockIcon = '💬';
            actionStr = targetUser ? `Messaging restored for **${targetUser.tag}**` : `Messaging restored for **@everyone**`;
        }

        try {
            await channel.permissionOverwrites.edit(targetId, overwritePayload);
        } catch (e) {
            console.error(e);
            return interaction.reply({ content: '> ❌ Failed to unlock the channel. Please check my permissions and hierarchy.', flags: MessageFlags.Ephemeral });
        }

        const container = new ContainerBuilder()
            .setAccentColor(0x2ecc71)
            
            .addTextDisplayComponents(
                new TextDisplayBuilder().setContent('# 🔓 Channel Unlocked')
            )
            
            .addSeparatorComponents(
                new SeparatorBuilder().setSpacing(SeparatorSpacingSize.Small).setDivider(true)
            )
            
            .addSectionComponents(
                new SectionBuilder()
                    .addTextDisplayComponents(
                        new TextDisplayBuilder().setContent(
                            `${lockIcon} **Type:** ${locktype === 'viewlock' ? 'View Lock' : 'Message Lock'}\n` +
                            `**Status:** ${actionStr}\n` +
                            `**Channel:** #${channel.name}`
                        )
                    )
                    .setThumbnailAccessory(
                        new ThumbnailBuilder().setURL(guild.iconURL({ size: 64 }) || 'https://cdn.discordapp.com/embed/avatars/0.png')
                    )
            )
            
            .addSeparatorComponents(
                new SeparatorBuilder().setSpacing(SeparatorSpacingSize.Small).setDivider(true)
            )
            
            .addTextDisplayComponents(
                new TextDisplayBuilder().setContent(
                    `-# ✅ Channel permissions have been restored`
                )
            );

        return interaction.reply({
            components: [container],
            flags: MessageFlags.IsComponentsV2
        });
    },
};
