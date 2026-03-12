const { SlashCommandBuilder, PermissionFlagsBits, ContainerBuilder, TextDisplayBuilder, MessageFlags, SeparatorBuilder, SeparatorSpacingSize, SectionBuilder, ThumbnailBuilder } = require('discord.js');
const { logModerationAction } = require('../../utils/modLogger');

module.exports = {
    category: 'moderation',
    data: new SlashCommandBuilder()
        .setName('kick')
        .setDescription('Kicks a user from the server.')
        .addUserOption(option => option.setName('user').setDescription('The user to kick').setRequired(true))
        .addStringOption(option => option.setName('reason').setDescription('The reason for the kick'))
        .addIntegerOption(option => option.setName('delete_message_days').setDescription('Days of messages to manually delete').setMinValue(0).setMaxValue(7))
        .setDefaultMemberPermissions(PermissionFlagsBits.KickMembers),
    aliases: ['kick'],
    async execute(interaction, client, args) {
        const isInteraction = interaction.isChatInputCommand?.() || false;
        const guild = interaction.guild;
        const moderator = isInteraction ? interaction.user : interaction.author;

        let targetUser, reason, deleteDays;

        if (isInteraction) {
            targetUser = interaction.options.getUser('user');
            reason = interaction.options.getString('reason') || 'No reason provided';
            deleteDays = interaction.options.getInteger('delete_message_days') || 0;
        } else {
            const userId = args[0]?.replace(/[<@!>]/g, '');
            targetUser = client.users.cache.get(userId);
            reason = args.slice(1).join(' ') || 'No reason provided';
            deleteDays = 0;
        }

        if (!targetUser) {
            return interaction.reply({ content: '> ❌ Please provide a valid user to kick.', flags: MessageFlags.Ephemeral });
        }

        const targetMember = guild.members.cache.get(targetUser.id);

        if (targetMember) {
            if (targetMember.roles.highest.position >= guild.members.me.roles.highest.position) {
                return interaction.reply({ content: '> ❌ I cannot kick someone with a higher or equal role than me!', flags: MessageFlags.Ephemeral });
            }
            if (targetMember.id === guild.ownerId) {
                return interaction.reply({ content: '> ❌ You cannot kick the server owner!', flags: MessageFlags.Ephemeral });
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
                    console.error('[Kick] Could not delete messages manually', e);
                }
            }

            await targetMember.kick(reason);

            await logModerationAction({
                guild,
                user: targetUser,
                moderator,
                action: 'KICK',
                reason,
                color: 0xe67e22,
                emoji: '👢'
            });

            const container = new ContainerBuilder()
                .setAccentColor(0xe67e22)
                
                .addTextDisplayComponents(
                    new TextDisplayBuilder().setContent('# 👢 User Kicked')
                )
                
                .addSeparatorComponents(
                    new SeparatorBuilder().setSpacing(SeparatorSpacingSize.Small).setDivider(true)
                )
                
                .addSectionComponents(
                    new SectionBuilder()
                        .addTextDisplayComponents(
                            new TextDisplayBuilder().setContent(
                                `**User:** ${targetUser.tag} \`(${targetUser.id})\`\n` +
                                `**Moderator:** ${moderator.tag}\n` +
                                `**Reason:** ${reason}`
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
                        `-# 📅 <t:${Math.floor(Date.now() / 1000)}:F>` +
                        (deleteDays > 0 ? `  •  🗑️ ~${messagesDeleted} messages deleted` : '')
                    )
                );

            return await interaction.reply({
                components: [container],
                flags: MessageFlags.IsComponentsV2
            });

        } catch (error) {
            console.error(error);
            await interaction.reply({ content: '> ❌ I could not kick that user. Check my permissions and role hierarchy.', flags: MessageFlags.Ephemeral });
        }
    },
};
