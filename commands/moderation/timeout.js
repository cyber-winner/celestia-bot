const { SlashCommandBuilder, PermissionFlagsBits, ContainerBuilder, TextDisplayBuilder, MessageFlags, SeparatorBuilder, SeparatorSpacingSize, SectionBuilder, ThumbnailBuilder } = require('discord.js');
const { logModerationAction } = require('../../utils/modLogger');
const ms = require('ms');

module.exports = {
    category: 'moderation',
    data: new SlashCommandBuilder()
        .setName('timeout')
        .setDescription('Timeouts a user in the server.')
        .addUserOption(option => option.setName('user').setDescription('The user to timeout').setRequired(true))
        .addStringOption(option => option.setName('duration').setDescription('Duration (e.g., 10m, 1h, 1d)').setRequired(true))
        .addStringOption(option => option.setName('reason').setDescription('The reason for the timeout'))
        .addIntegerOption(option => option.setName('delete_message_days').setDescription('Days of messages to manually delete').setMinValue(0).setMaxValue(7))
        .setDefaultMemberPermissions(PermissionFlagsBits.ModerateMembers),
    aliases: ['timeout', 'mute'],
    async execute(interaction, client, args) {
        const isInteraction = interaction.isChatInputCommand?.() || false;
        const guild = interaction.guild;
        const moderator = isInteraction ? interaction.user : interaction.author;

        let targetUser, durationStr, reason, deleteDays;

        if (isInteraction) {
            targetUser = interaction.options.getUser('user');
            durationStr = interaction.options.getString('duration');
            reason = interaction.options.getString('reason') || 'No reason provided';
            deleteDays = interaction.options.getInteger('delete_message_days') || 0;
        } else {
            const userId = args[0]?.replace(/[<@!>]/g, '');
            targetUser = client.users.cache.get(userId);
            durationStr = args[1];
            reason = args.slice(2).join(' ') || 'No reason provided';
            deleteDays = 0;
        }

        if (!targetUser) {
            return interaction.reply({ content: '> ❌ Please provide a valid user to timeout.', flags: MessageFlags.Ephemeral });
        }

        if (!durationStr) {
            return interaction.reply({ content: '> ❌ Please provide a valid duration.', flags: MessageFlags.Ephemeral });
        }

        const durationMs = ms(durationStr);
        if (!durationMs || durationMs < 10000 || durationMs > 2419200000) { // Discord max is 28 days
            return interaction.reply({ content: '> ❌ Invalid duration. Must be between 10 seconds and 28 days.', flags: MessageFlags.Ephemeral });
        }

        const targetMember = guild.members.cache.get(targetUser.id);

        if (targetMember) {
            if (targetMember.roles.highest.position >= guild.members.me.roles.highest.position) {
                return interaction.reply({ content: '> ❌ I cannot timeout someone with a higher or equal role than me!', flags: MessageFlags.Ephemeral });
            }
            if (targetMember.id === guild.ownerId) {
                return interaction.reply({ content: '> ❌ You cannot timeout the server owner!', flags: MessageFlags.Ephemeral });
            }
        } else {
            return interaction.reply({ content: '> ❌ That user is not in this server.', flags: MessageFlags.Ephemeral });
        }

        try {
            let messagesDeleted = 0;
            if (deleteDays > 0) {
                try {
                    const cutoffTime = Date.now() - (deleteDays * 24 * 60 * 60 * 1000);
                    if (interaction.channel) {
                        const fetched = await interaction.channel.messages.fetch({ limit: 100 });
                        const toDelete = fetched.filter(m => m.author.id === targetUser.id && m.createdTimestamp > cutoffTime);
                        if (toDelete.size > 0) {
                            await interaction.channel.bulkDelete(toDelete, true);
                            messagesDeleted = toDelete.size;
                        }
                    }
                } catch (e) {
                    console.error('[Timeout] Could not delete messages manually', e);
                }
            }

            await targetMember.timeout(durationMs, reason);

            await logModerationAction({
                guild,
                user: targetUser,
                moderator,
                action: 'TIMEOUT',
                reason,
                duration: ms(durationMs, { long: true }),
                color: 0x3498db,
                emoji: '⏳'
            });

            const container = new ContainerBuilder()
                .setAccentColor(0x3498db)
                .addTextDisplayComponents(
                    new TextDisplayBuilder().setContent('## ⏳  User Timed Out')
                )
                .addSeparatorComponents(
                    new SeparatorBuilder().setSpacing(SeparatorSpacingSize.Small).setDivider(false)
                )
                .addSectionComponents(
                    new SectionBuilder()
                        .addTextDisplayComponents(
                            new TextDisplayBuilder().setContent(
                                `**User:** ${targetUser.tag} \`(${targetUser.id})\`\n` +
                                `**Moderator:** ${moderator.tag}\n` +
                                `**Reason:** ${reason}\n` +
                                `**Duration:** ${ms(durationMs, { long: true })}`
                            )
                        )
                        .setThumbnailAccessory(
                            new ThumbnailBuilder().setURL(targetUser.displayAvatarURL({ size: 64 }))
                        )
                )
                .addSeparatorComponents(
                    new SeparatorBuilder().setSpacing(SeparatorSpacingSize.Small).setDivider(true)
                )
                .addTextDisplayComponents(
                    new TextDisplayBuilder().setContent(
                        `📅 **Ends:** <t:${Math.floor((Date.now() + durationMs) / 1000)}:R>` +
                        (deleteDays > 0 ? `\n🗑️ **Messages Deleted:** ~${messagesDeleted} (in current channel)` : '')
                    )
                );

            return await interaction.reply({
                components: [container],
                flags: MessageFlags.IsComponentsV2
            });

        } catch (error) {
            console.error(error);
            await interaction.reply({ content: '> ❌ I could not timeout that user. Check my permissions.', flags: MessageFlags.Ephemeral });
        }
    },
};
