const {
    SlashCommandBuilder,
    PermissionFlagsBits,
    ContainerBuilder,
    TextDisplayBuilder,
    MessageFlags,
    SeparatorBuilder,
    SeparatorSpacingSize,
    SectionBuilder,
    ThumbnailBuilder
} = require('discord.js');
const ModLog = require('../../models/ModLog');

module.exports = {
    category: 'moderation',
    data: new SlashCommandBuilder()
        .setName('ban')
        .setDescription('Bans a user from the server.')
        .addUserOption(option => option.setName('user').setDescription('The user to ban').setRequired(true))
        .addStringOption(option => option.setName('reason').setDescription('The reason for the ban'))
        .addIntegerOption(option => option.setName('days').setDescription('Days of messages to delete').setMinValue(0).setMaxValue(7))
        .setDefaultMemberPermissions(PermissionFlagsBits.BanMembers),
    aliases: ['ban'],
    async execute(interaction, client, args) {
        const isInteraction = interaction.isChatInputCommand?.() || false;
        const guild = interaction.guild;
        const moderator = isInteraction ? interaction.user : interaction.author;

        let targetUser, reason, deleteDays;

        if (isInteraction) {
            targetUser = interaction.options.getUser('user');
            reason = interaction.options.getString('reason') || 'No reason provided';
            deleteDays = interaction.options.getInteger('days') || 0;
        } else {
            const userId = args[0]?.replace(/[<@!>]/g, '');
            targetUser = client.users.cache.get(userId);
            reason = args.slice(1).join(' ') || 'No reason provided';
            deleteDays = 0;
        }

        if (!targetUser) {
            return interaction.reply({ content: '> ❌ Please provide a valid user to ban.', flags: MessageFlags.Ephemeral });
        }

        const targetMember = guild.members.cache.get(targetUser.id);

        
        if (targetMember) {
            if (targetMember.roles.highest.position >= guild.members.me.roles.highest.position) {
                return interaction.reply({ content: '> ❌ I cannot ban someone with a higher or equal role than me!', flags: MessageFlags.Ephemeral });
            }
            if (targetMember.id === guild.ownerId) {
                return interaction.reply({ content: '> ❌ You cannot ban the server owner!', flags: MessageFlags.Ephemeral });
            }
        }

        try {
            await guild.members.ban(targetUser, { deleteMessageSeconds: deleteDays * 86400, reason });

            await ModLog.create({
                guildId: guild.id,
                userId: targetUser.id,
                moderatorId: moderator.id,
                action: 'BAN',
                reason: reason
            });

            const container = new ContainerBuilder()
                .setAccentColor(0xed4245)
                .addTextDisplayComponents(
                    new TextDisplayBuilder().setContent('## 🔨  User Banned')
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
                        `📅 **Date:** <t:${Math.floor(Date.now() / 1000)}:F>\n` +
                        `🗑️ **Messages Deleted:** ${deleteDays > 0 ? `${deleteDays} day(s)` : 'None'}`
                    )
                )
                .addSeparatorComponents(
                    new SeparatorBuilder().setSpacing(SeparatorSpacingSize.Small).setDivider(false)
                )
                .addTextDisplayComponents(
                    new TextDisplayBuilder().setContent(`-# ✅ Action logged to the moderation database.`)
                );

            return await interaction.reply({
                components: [container],
                flags: MessageFlags.IsComponentsV2
            });

        } catch (error) {
            console.error(error);
            await interaction.reply({ content: '> ❌ I could not ban that user. Check my permissions and role hierarchy.', flags: MessageFlags.Ephemeral });
        }
    },
};
