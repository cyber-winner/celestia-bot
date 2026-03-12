const { SlashCommandBuilder, PermissionFlagsBits, ContainerBuilder, TextDisplayBuilder, MessageFlags, SeparatorBuilder, SeparatorSpacingSize, SectionBuilder } = require('discord.js');
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

        // Target ID is the given user, or the @everyone role to lock the whole channel
        const targetId = targetUser ? targetUser.id : guild.id;

        let overwritePayload = {};
        let actionStr = '';

        if (locktype === 'viewlock') {
            overwritePayload = { ViewChannel: false };
            actionStr = targetUser ? `🔒 Locked viewing access for ${targetUser.tag}` : `🔒 Channel completely hidden from @everyone`;
        } else if (locktype === 'msglock') {
            overwritePayload = { SendMessages: false };
            actionStr = targetUser ? `🔒 Locked message sending for ${targetUser.tag}` : `🔒 Channel locked for messaging from @everyone`;
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
                new TextDisplayBuilder().setContent(`## 🔒  Channel Locked`)
            )
            .addSeparatorComponents(
                new SeparatorBuilder().setSpacing(SeparatorSpacingSize.Small).setDivider(true)
            )
            .addSectionComponents(
                new SectionBuilder()
                    .addTextDisplayComponents(
                        new TextDisplayBuilder().setContent(`**Status:** ${actionStr}`)
                    )
            );

        return interaction.reply({
            components: [container],
            flags: MessageFlags.IsComponentsV2
        });
    },
};
