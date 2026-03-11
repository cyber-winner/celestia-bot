const {
    SlashCommandBuilder,
    PermissionFlagsBits,
    ContainerBuilder,
    TextDisplayBuilder,
    MessageFlags,
    SeparatorBuilder,
    SeparatorSpacingSize,
    SectionBuilder,
    ThumbnailBuilder,
    ActionRowBuilder,
    ButtonBuilder,
    ButtonStyle
} = require('discord.js');
const Guild = require('../../models/Guild');

module.exports = {
    category: 'moderation',
    data: new SlashCommandBuilder()
        .setName('quarantine')
        .setDescription('Manage the quarantine system.')
        .addSubcommand(sub => sub.setName('setrole')
            .setDescription('Set the quarantine role')
            .addRoleOption(opt => opt.setName('role').setDescription('The quarantine role').setRequired(true)))
        .addSubcommand(sub => sub.setName('setchannel')
            .setDescription('Set the quarantine view channel')
            .addChannelOption(opt => opt.setName('channel').setDescription('The channel quarantined users can see').setRequired(true)))
        .addSubcommand(sub => sub.setName('add')
            .setDescription('Quarantine a user')
            .addUserOption(opt => opt.setName('user').setDescription('The user to quarantine').setRequired(true))
            .addStringOption(opt => opt.setName('reason').setDescription('The reason for quarantine')))
        .addSubcommand(sub => sub.setName('remove')
            .setDescription('Remove a user from quarantine')
            .addUserOption(opt => opt.setName('user').setDescription('The user to unquarantine').setRequired(true)))
        .setDefaultMemberPermissions(PermissionFlagsBits.ManageRoles),
    aliases: ['q'],
    async execute(interaction, client, args) {
        const isInteraction = interaction.isChatInputCommand?.() || false;
        const guild = interaction.guild;
        const settings = await Guild.findOne({ guildId: guild.id });

        if (!settings) {
            return interaction.reply({ content: '> ❌ Guild settings not found. Please try again.', flags: MessageFlags.Ephemeral });
        }

        if (isInteraction) {
            const sub = interaction.options.getSubcommand();

            
            if (sub === 'setrole') {
                const role = interaction.options.getRole('role');

                if (role.position >= guild.members.me.roles.highest.position) {
                    return interaction.reply({ content: '> ❌ That role is above or equal to my highest role.', flags: MessageFlags.Ephemeral });
                }

                settings.quarantineRoleId = role.id;
                await settings.save();
                await role.setPermissions(0n);

                const container = new ContainerBuilder()
                    .setAccentColor(0xf1c40f)
                    .addTextDisplayComponents(
                        new TextDisplayBuilder().setContent('## ⚙️  Quarantine Role Set')
                    )
                    .addSeparatorComponents(
                        new SeparatorBuilder().setSpacing(SeparatorSpacingSize.Small).setDivider(true)
                    )
                    .addTextDisplayComponents(
                        new TextDisplayBuilder().setContent(
                            `**Role:** ${role} \`(${role.id})\`\n` +
                            `**Permissions Cleared:** ✅ All permissions removed from role.\n\n` +
                            `-# Members assigned this role will not be able to see any channels.`
                        )
                    );

                return interaction.reply({ components: [container], flags: MessageFlags.IsComponentsV2 });
            }

            
            if (sub === 'setchannel') {
                const channel = interaction.options.getChannel('channel');
                settings.quarantineChannelId = channel.id;
                await settings.save();

                const container = new ContainerBuilder()
                    .setAccentColor(0xf1c40f)
                    .addTextDisplayComponents(
                        new TextDisplayBuilder().setContent('## ⚙️  Quarantine Channel Set')
                    )
                    .addSeparatorComponents(
                        new SeparatorBuilder().setSpacing(SeparatorSpacingSize.Small).setDivider(true)
                    )
                    .addTextDisplayComponents(
                        new TextDisplayBuilder().setContent(
                            `**Channel:** ${channel}\n\n` +
                            `-# Quarantined users will only be able to view this channel.`
                        )
                    );

                return interaction.reply({ components: [container], flags: MessageFlags.IsComponentsV2 });
            }

            
            if (sub === 'add') {
                const target = interaction.options.getMember('user');
                const reason = interaction.options.getString('reason') || 'No reason provided';

                if (!settings.quarantineRoleId) return interaction.reply({ content: '> ❌ Quarantine role has not been set. Use `/quarantine setrole` first.', flags: MessageFlags.Ephemeral });

                const qRole = guild.roles.cache.get(settings.quarantineRoleId);
                if (!qRole) return interaction.reply({ content: '> ❌ Quarantine role not found in server. Please re-set it.', flags: MessageFlags.Ephemeral });

                if (target.roles.cache.has(qRole.id)) {
                    return interaction.reply({ content: '> ⚠️ That user is already quarantined.', flags: MessageFlags.Ephemeral });
                }

                await target.roles.add(qRole, reason);

                const container = new ContainerBuilder()
                    .setAccentColor(0xf1c40f)
                    .addTextDisplayComponents(
                        new TextDisplayBuilder().setContent('## ⛓️  User Quarantined')
                    )
                    .addSeparatorComponents(
                        new SeparatorBuilder().setSpacing(SeparatorSpacingSize.Small).setDivider(false)
                    )
                    .addSectionComponents(
                        new SectionBuilder()
                            .addTextDisplayComponents(
                                new TextDisplayBuilder().setContent(
                                    `**User:** ${target.user.tag} \`(${target.id})\`\n` +
                                    `**Moderator:** ${interaction.user.tag}\n` +
                                    `**Reason:** ${reason}\n\n` +
                                    `📅 **Since:** <t:${Math.floor(Date.now() / 1000)}:R>`
                                )
                            )
                            .setThumbnailAccessory(
                                new ThumbnailBuilder().setURL(target.user.displayAvatarURL({ size: 64 }))
                            )
                    )
                    .addSeparatorComponents(
                        new SeparatorBuilder().setSpacing(SeparatorSpacingSize.Small).setDivider(false)
                    )
                    .addTextDisplayComponents(
                        new TextDisplayBuilder().setContent(`-# 🔒 User has been restricted. Use \`/quarantine remove\` to lift.`)
                    );

                return interaction.reply({ components: [container], flags: MessageFlags.IsComponentsV2 });
            }

            
            if (sub === 'remove') {
                const target = interaction.options.getMember('user');

                if (!settings.quarantineRoleId) return interaction.reply({ content: '> ❌ Quarantine role has not been set.', flags: MessageFlags.Ephemeral });

                const qRole = guild.roles.cache.get(settings.quarantineRoleId);
                if (!qRole) return interaction.reply({ content: '> ❌ Quarantine role not found in server.', flags: MessageFlags.Ephemeral });

                if (!target.roles.cache.has(qRole.id)) {
                    return interaction.reply({ content: '> ⚠️ That user is not currently quarantined.', flags: MessageFlags.Ephemeral });
                }

                await target.roles.remove(qRole, `Quarantine lifted by ${interaction.user.tag}`);

                const container = new ContainerBuilder()
                    .setAccentColor(0x2ecc71)
                    .addTextDisplayComponents(
                        new TextDisplayBuilder().setContent('## ✅  Quarantine Lifted')
                    )
                    .addSeparatorComponents(
                        new SeparatorBuilder().setSpacing(SeparatorSpacingSize.Small).setDivider(false)
                    )
                    .addSectionComponents(
                        new SectionBuilder()
                            .addTextDisplayComponents(
                                new TextDisplayBuilder().setContent(
                                    `**User:** ${target.user.tag} \`(${target.id})\`\n` +
                                    `**Lifted by:** ${interaction.user.tag}\n` +
                                    `📅 **Time:** <t:${Math.floor(Date.now() / 1000)}:R>`
                                )
                            )
                            .setThumbnailAccessory(
                                new ThumbnailBuilder().setURL(target.user.displayAvatarURL({ size: 64 }))
                            )
                    )
                    .addSeparatorComponents(
                        new SeparatorBuilder().setSpacing(SeparatorSpacingSize.Small).setDivider(false)
                    )
                    .addTextDisplayComponents(
                        new TextDisplayBuilder().setContent(`-# 🔓 User can now access the server normally.`)
                    );

                return interaction.reply({ components: [container], flags: MessageFlags.IsComponentsV2 });
            }
        }
    },
};
