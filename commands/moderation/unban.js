const { SlashCommandBuilder, PermissionFlagsBits, ContainerBuilder, TextDisplayBuilder, MessageFlags, SeparatorBuilder, SeparatorSpacingSize, SectionBuilder, ThumbnailBuilder } = require('discord.js');
const { logModerationAction } = require('../../utils/modLogger');

module.exports = {
    category: 'moderation',
    data: new SlashCommandBuilder()
        .setName('unban')
        .setDescription('Unbans a user from the server.')
        .addStringOption(option => option.setName('user_id').setDescription('The ID of the user to unban').setRequired(true))
        .addStringOption(option => option.setName('reason').setDescription('The reason for the unban'))
        .setDefaultMemberPermissions(PermissionFlagsBits.BanMembers),
    aliases: ['unban'],
    async execute(interaction, client, args) {
        const isInteraction = interaction.isChatInputCommand?.() || false;
        const guild = interaction.guild;
        const moderator = isInteraction ? interaction.user : interaction.author;

        let userId, reason;

        if (isInteraction) {
            userId = interaction.options.getString('user_id');
            reason = interaction.options.getString('reason') || 'No reason provided';
        } else {
            userId = args[0];
            reason = args.slice(1).join(' ') || 'No reason provided';
        }

        if (!userId || isNaN(userId)) {
            return interaction.reply({ content: '> ❌ Please provide a valid user ID to unban.', flags: MessageFlags.Ephemeral });
        }

        try {
            const bans = await guild.bans.fetch();
            const banInfo = bans.get(userId);

            if (!banInfo) {
                return interaction.reply({ content: '> ❌ That user is not banned.', flags: MessageFlags.Ephemeral });
            }

            let targetUser = banInfo.user;

            await guild.members.unban(userId, reason);

            await logModerationAction({
                guild,
                user: targetUser,
                moderator,
                action: 'UNBAN',
                reason,
                color: 0x2ecc71,
                emoji: '🕊️'
            });

            const container = new ContainerBuilder()
                .setAccentColor(0x2ecc71)
                
                .addTextDisplayComponents(
                    new TextDisplayBuilder().setContent('# 🕊️ User Unbanned')
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
                        `-# 📅 <t:${Math.floor(Date.now() / 1000)}:F>  •  ✅ User can now rejoin the server`
                    )
                );

            return await interaction.reply({
                components: [container],
                flags: MessageFlags.IsComponentsV2
            });

        } catch (error) {
            console.error(error);
            await interaction.reply({ content: '> ❌ I could not unban that user. Check my permissions.', flags: MessageFlags.Ephemeral });
        }
    },
};
