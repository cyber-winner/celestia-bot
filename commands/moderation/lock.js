const { SlashCommandBuilder, PermissionFlagsBits, ContainerBuilder, TextDisplayBuilder, MessageFlags, SeparatorBuilder, SeparatorSpacingSize, SectionBuilder, ThumbnailBuilder } = require('discord.js');
const { logModerationAction } = require('../../utils/modLogger');

module.exports = {
    category: 'moderation',
    data: new SlashCommandBuilder()
        .setName('lock')
        .setDescription('Locks the current channel.')
        .addStringOption(opt => opt.setName('locktype')
            .setDescription('The type of lock to assert')
            .setRequired(true)
            .addChoices(
                { name: 'View Lock (Hides channel)', value: 'viewlock' },
                { name: 'Message Lock (Disables sending)', value: 'msglock' }
            )
        )
        .addUserOption(opt => opt.setName('user').setDescription('The user to lock. If empty, locks the entire channel.'))
        .setDefaultMemberPermissions(PermissionFlagsBits.ManageChannels),
    aliases: ['lock'],
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
            overwritePayload = { ViewChannel: false };
            lockIcon = '👁️‍🗨️';
            actionStr = targetUser ? `Hidden from **${targetUser.tag}**` : `Hidden from **@everyone**`;
        } else if (locktype === 'msglock') {
            overwritePayload = { SendMessages: false };
            lockIcon = '💬';
            actionStr = targetUser ? `Messaging disabled for **${targetUser.tag}**` : `Messaging disabled for **@everyone**`;
        }

        try {
            await channel.permissionOverwrites.edit(targetId, overwritePayload);
        } catch (e) {
            console.error(e);
            return interaction.reply({ content: '> ❌ Failed to lock the channel. Please check my permissions and hierarchy.', flags: MessageFlags.Ephemeral });
        }

        const container = new ContainerBuilder()
            .setAccentColor(0xe74c3c)
            
            .addTextDisplayComponents(
                new TextDisplayBuilder().setContent('# 🔒 Channel Locked')
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
                    `-# 🔐 Use \`/unlock\` to reverse this action`
                )
            );

        return interaction.reply({
            components: [container],
            flags: MessageFlags.IsComponentsV2
        });
    },
};
