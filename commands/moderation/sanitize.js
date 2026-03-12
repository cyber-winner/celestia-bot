const { SlashCommandBuilder, PermissionFlagsBits, ContainerBuilder, TextDisplayBuilder, MessageFlags, SeparatorBuilder, SeparatorSpacingSize, SectionBuilder, ThumbnailBuilder, MediaGalleryBuilder, MediaGalleryItemBuilder } = require('discord.js');
const Guild = require('../../models/Guild');
const QuarantineUser = require('../../models/QuarantineUser');
const { logModerationAction } = require('../../utils/modLogger');

module.exports = {
    category: 'moderation',
    data: new SlashCommandBuilder()
        .setName('sanitize')
        .setDescription('Unquarantines a user with proper proof.')
        .addUserOption(option => option.setName('user').setDescription('The user to sanitize').setRequired(true))
        .addStringOption(option => option.setName('reason').setDescription('The reason for sanitization').setRequired(true))
        .addAttachmentOption(option => option.setName('proof').setDescription('Proof image/video').setRequired(true))
        .setDefaultMemberPermissions(PermissionFlagsBits.ManageRoles),
    aliases: ['sanitize'],
    async execute(interaction, client, args) {
        if (!interaction.isChatInputCommand?.()) return;

        const guild = interaction.guild;
        const moderator = interaction.user;
        const settings = await Guild.findOne({ guildId: guild.id });

        if (!settings || !settings.quarantineRoleId) {
            return interaction.reply({ content: '> ❌ Quarantine system is not configured. Run `/quarantine setrole` first.', flags: MessageFlags.Ephemeral });
        }

        const targetMember = interaction.options.getMember('user');
        const reason = interaction.options.getString('reason');
        const proofAttachment = interaction.options.getAttachment('proof');

        if (!targetMember) {
            return interaction.reply({ content: '> ❌ User not found in server.', flags: MessageFlags.Ephemeral });
        }

        const qRole = guild.roles.cache.get(settings.quarantineRoleId);
        if (!qRole || !targetMember.roles.cache.has(qRole.id)) {
            return interaction.reply({ content: '> ⚠️ That user is not currently quarantined.', flags: MessageFlags.Ephemeral });
        }

        const qRecord = await QuarantineUser.findOne({ guildId: guild.id, userId: targetMember.id });
        let restoredRoles = [];
        if (qRecord && qRecord.roles.length > 0) {
            restoredRoles = qRecord.roles;
            await QuarantineUser.deleteOne({ _id: qRecord._id });
        }

        try {
            const rolesToSet = restoredRoles.filter(r => r !== qRole.id);
            if (rolesToSet.length > 0) {
                await targetMember.roles.set(rolesToSet, `Sanitized by ${moderator.tag}`);
            } else {
                await targetMember.roles.remove(qRole, `Sanitized by ${moderator.tag}`);
            }
        } catch (e) {
            await targetMember.roles.remove(qRole, `Sanitized by ${moderator.tag}`);
        }

        await logModerationAction({
            guild,
            user: targetMember.user,
            moderator,
            action: 'SANITIZE',
            reason,
            proof: proofAttachment.url,
            color: 0x1abc9c,
            emoji: '🧼'
        });

        const container = new ContainerBuilder()
            .setAccentColor(0x1abc9c)
            .addTextDisplayComponents(
                new TextDisplayBuilder().setContent('## 🧼  User Sanitized')
            )
            .addSeparatorComponents(
                new SeparatorBuilder().setSpacing(SeparatorSpacingSize.Small).setDivider(false)
            )
            .addSectionComponents(
                new SectionBuilder()
                    .addTextDisplayComponents(
                        new TextDisplayBuilder().setContent(
                            `**User:** ${targetMember.user.tag} \`(${targetMember.id})\`\n` +
                            `**Moderator:** ${moderator.tag}\n` +
                            `**Reason:** ${reason}`
                        )
                    )
                    .setThumbnailAccessory(
                        new ThumbnailBuilder().setURL(targetMember.user.displayAvatarURL({ size: 64 }))
                    )
            )
            .addSeparatorComponents(
                new SeparatorBuilder().setSpacing(SeparatorSpacingSize.Small).setDivider(true)
            )
            .addMediaGalleryComponents(
                new MediaGalleryBuilder().addItems(
                    new MediaGalleryItemBuilder().setURL(proofAttachment.url)
                )
            );

        return await interaction.reply({
            components: [container],
            flags: MessageFlags.IsComponentsV2
        });
    },
};
