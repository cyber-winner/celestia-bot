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
    ButtonStyle,
    ComponentType
} = require('discord.js');
const Guild = require('../../models/Guild');
const QuarantineUser = require('../../models/QuarantineUser');
const { logModerationAction } = require('../../utils/modLogger');

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
            .addStringOption(opt => opt.setName('reason').setDescription('The reason for quarantine'))
            .addIntegerOption(opt => opt.setName('delete_message_days').setDescription('Days of messages to delete').setMinValue(0).setMaxValue(7)))
        .addSubcommand(sub => sub.setName('remove')
            .setDescription('Remove a user from quarantine')
            .addUserOption(opt => opt.setName('user').setDescription('The user to unquarantine').setRequired(true))),
    aliases: ['q'],
    async execute(interaction, client, args) {
        const isInteraction = interaction.isChatInputCommand?.() || false;

        // Quarantine usually requires admin or specialized mod perms, keeping ManageRoles is fine as default
        if (isInteraction && !interaction.member.permissions.has(PermissionFlagsBits.ManageRoles)) {
            return interaction.reply({ content: '> ❌ You do not have permission to use this command.', flags: MessageFlags.Ephemeral });
        }

        const guild = interaction.guild;
        const settings = await Guild.findOne({ guildId: guild.id });
        const moderator = isInteraction ? interaction.user : interaction.author;

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
                // Set to bottom-ish and wipe basic perms
                await role.setPermissions(0n);
                if (role.position > 1) {
                    try { await role.setPosition(1); } catch (e) { }
                }

                // Background channel updates
                const viewChannelId = settings.quarantineViewChannelId;
                guild.channels.cache.forEach(async (ch) => {
                    if (viewChannelId && ch.id === viewChannelId) {
                        try {
                            await ch.permissionOverwrites.edit(role.id, {
                                ViewChannel: true,
                                ReadMessageHistory: true,
                                SendMessages: false,
                                AddReactions: false
                            });
                        } catch (e) { }
                    } else {
                        try {
                            await ch.permissionOverwrites.edit(role.id, {
                                ViewChannel: false
                            });
                        } catch (e) { }
                    }
                });

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

                if (!settings.quarantineRoleId) {
                    return interaction.reply({ content: '> ❌ Quarantine role has not been set. Use `/quarantine setrole` first.', flags: MessageFlags.Ephemeral });
                }

                // Temporary state for the interactive menu
                const permissionState = {
                    ViewChannel: { label: 'View Channel', value: true },
                    SendMessages: { label: 'Send Messages', value: false },
                    ReadMessageHistory: { label: 'Read Message History', value: true },
                    AddReactions: { label: 'Add Reactions', value: false },
                    AttachFiles: { label: 'Attach Files', value: false },
                    EmbedLinks: { label: 'Embed Links', value: false },
                    UseExternalEmojis: { label: 'Use External Emojis', value: false }
                };

                const permKeys = Object.keys(permissionState);
                let currentPage = 0;
                const itemsPerPage = 3;
                const maxPages = Math.ceil(permKeys.length / itemsPerPage);

                const getPageContainer = (page) => {
                    const start = page * itemsPerPage;
                    const end = start + itemsPerPage;
                    const pageKeys = permKeys.slice(start, end);

                    const container = new ContainerBuilder()
                        .setAccentColor(0xf1c40f)
                        .addTextDisplayComponents(
                            new TextDisplayBuilder().setContent(`## ⚙️  Configure Quarantine Channel: ${channel.name}`)
                        )
                        .addSeparatorComponents(
                            new SeparatorBuilder().setSpacing(SeparatorSpacingSize.Small).setDivider(true)
                        )
                        .addTextDisplayComponents(
                            new TextDisplayBuilder().setContent(
                                `Toggle permissions for the quarantine role in this channel.\n` +
                                `-# Page ${page + 1}/${maxPages}`
                            )
                        );

                    return container;
                };

                const getButtonsRow = (page) => {
                    const start = page * itemsPerPage;
                    const end = start + itemsPerPage;
                    const pageKeys = permKeys.slice(start, end);

                    const row = new ActionRowBuilder();

                    pageKeys.forEach(key => {
                        const state = permissionState[key].value;
                        row.addComponents(
                            new ButtonBuilder()
                                .setCustomId(`toggle_${key}`)
                                .setLabel(`${permissionState[key].label}: ${state ? '✅ Allow' : '❌ Deny'}`)
                                .setStyle(state ? ButtonStyle.Success : ButtonStyle.Danger)
                        );
                    });

                    return row;
                };

                const getNavigationRow = (page) => {
                    return new ActionRowBuilder().addComponents(
                        new ButtonBuilder()
                            .setCustomId('prev_page')
                            .setLabel('Previous')
                            .setStyle(ButtonStyle.Primary)
                            .setDisabled(page === 0),
                        new ButtonBuilder()
                            .setCustomId('next_page')
                            .setLabel('Next')
                            .setStyle(ButtonStyle.Primary)
                            .setDisabled(page === maxPages - 1),
                        new ButtonBuilder()
                            .setCustomId('save_perms')
                            .setLabel('💾 Save Configurations')
                            .setStyle(ButtonStyle.Success)
                    );
                };

                const response = await interaction.reply({
                    components: [getPageContainer(currentPage), getButtonsRow(currentPage), getNavigationRow(currentPage)],
                    flags: MessageFlags.IsComponentsV2,
                    fetchReply: true
                });

                const collector = response.createMessageComponentCollector({ componentType: ComponentType.Button, time: 120000 });

                collector.on('collect', async i => {
                    if (i.user.id !== interaction.user.id) {
                        return i.reply({ content: 'These buttons are not for you!', ephemeral: true });
                    }

                    if (i.customId === 'prev_page') {
                        currentPage--;
                    } else if (i.customId === 'next_page') {
                        currentPage++;
                    } else if (i.customId === 'save_perms') {
                        // Apply saves
                        settings.quarantineViewChannelId = channel.id;
                        await settings.save();

                        const overwrites = {};
                        for (const key of permKeys) {
                            overwrites[key] = permissionState[key].value;
                        }

                        try {
                            await channel.permissionOverwrites.edit(settings.quarantineRoleId, overwrites);
                        } catch (e) {
                            console.error('Failed setting channel overwrites for quarantine', e);
                        }

                        const finalContainer = new ContainerBuilder()
                            .setAccentColor(0x2ecc71)
                            .addTextDisplayComponents(
                                new TextDisplayBuilder().setContent('## ✅  Quarantine Channel Configured')
                            )
                            .addSeparatorComponents(
                                new SeparatorBuilder().setSpacing(SeparatorSpacingSize.Small).setDivider(true)
                            )
                            .addTextDisplayComponents(
                                new TextDisplayBuilder().setContent(
                                    `**Channel:** ${channel}\n\n` +
                                    `-# The custom permissions have been securely applied to the quarantine role.`
                                )
                            );

                        await i.update({
                            components: [finalContainer],
                            flags: MessageFlags.IsComponentsV2
                        });
                        return collector.stop('saved');
                    } else if (i.customId.startsWith('toggle_')) {
                        const key = i.customId.replace('toggle_', '');
                        if (permissionState[key] !== undefined) {
                            permissionState[key].value = !permissionState[key].value;
                        }
                    }

                    // Update UI
                    await i.update({
                        components: [getPageContainer(currentPage), getButtonsRow(currentPage), getNavigationRow(currentPage)],
                        flags: MessageFlags.IsComponentsV2
                    });
                });

                collector.on('end', (collected, reason) => {
                    if (reason !== 'saved') {
                        // Time out display
                        interaction.editReply({
                            components: [new ContainerBuilder().addTextDisplayComponents(new TextDisplayBuilder().setContent('⏳ Configuration timed out.'))],
                            flags: MessageFlags.IsComponentsV2
                        }).catch(() => { });
                    }
                });

                return; // Interaction replied internally
            }

            if (sub === 'add') {
                const target = interaction.options.getMember('user');
                const reason = interaction.options.getString('reason') || 'No reason provided';
                const deleteDays = interaction.options.getInteger('delete_message_days') || 0;

                if (!settings.quarantineRoleId) return interaction.reply({ content: '> ❌ Quarantine role has not been set. Use `/quarantine setrole` first.', flags: MessageFlags.Ephemeral });

                const qRole = guild.roles.cache.get(settings.quarantineRoleId);
                if (!qRole) return interaction.reply({ content: '> ❌ Quarantine role not found in server. Please re-set it.', flags: MessageFlags.Ephemeral });

                if (!target) return interaction.reply({ content: '> ❌ User not found in server.', flags: MessageFlags.Ephemeral });

                if (target.roles.cache.has(qRole.id)) {
                    return interaction.reply({ content: '> ⚠️ That user is already quarantined.', flags: MessageFlags.Ephemeral });
                }

                if (target.roles.highest.position >= guild.members.me.roles.highest.position) {
                    return interaction.reply({ content: '> ❌ I cannot quarantine someone with a higher or equal role than me!', flags: MessageFlags.Ephemeral });
                }

                let messagesDeleted = 0;
                if (deleteDays > 0) {
                    try {
                        const cutoffTime = Date.now() - (deleteDays * 24 * 60 * 60 * 1000);
                        if (interaction.channel) {
                            const fetched = await interaction.channel.messages.fetch({ limit: 100 });
                            const toDelete = fetched.filter(m => m.author.id === target.id && m.createdTimestamp > cutoffTime);
                            if (toDelete.size > 0) {
                                await interaction.channel.bulkDelete(toDelete, true);
                                messagesDeleted = toDelete.size;
                            }
                        }
                    } catch (e) {
                        console.error('[Quarantine] Could not delete messages manually', e);
                    }
                }

                const userRoles = target.roles.cache.filter(r => r.id !== guild.id && r.id !== qRole.id).map(r => r.id);
                await QuarantineUser.findOneAndUpdate(
                    { guildId: guild.id, userId: target.id },
                    { roles: userRoles, quarantinedAt: new Date() },
                    { upsert: true }
                );

                try {
                    await target.roles.set([qRole.id], reason);
                } catch (e) {
                    await target.roles.add(qRole, reason);
                }

                await logModerationAction({
                    guild,
                    user: target.user,
                    moderator,
                    action: 'QUARANTINE',
                    reason,
                    color: 0xf1c40f,
                    emoji: '⛓️'
                });

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
                                    `📅 **Since:** <t:${Math.floor(Date.now() / 1000)}:R>` +
                                    (deleteDays > 0 ? `\n🗑️ **Messages Deleted:** ~${messagesDeleted} (in current channel)` : '')
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

                if (!target) return interaction.reply({ content: '> ❌ User not found in server.', flags: MessageFlags.Ephemeral });

                if (!target.roles.cache.has(qRole.id)) {
                    return interaction.reply({ content: '> ⚠️ That user is not currently quarantined.', flags: MessageFlags.Ephemeral });
                }

                const qRecord = await QuarantineUser.findOne({ guildId: guild.id, userId: target.id });
                let restoredRoles = [];
                if (qRecord && qRecord.roles.length > 0) {
                    restoredRoles = qRecord.roles;
                    await QuarantineUser.deleteOne({ _id: qRecord._id });
                }

                try {
                    const rolesToSet = restoredRoles.filter(r => r !== qRole.id);
                    if (rolesToSet.length > 0) {
                        await target.roles.set(rolesToSet, `Quarantine lifted by ${interaction.user.tag}`);
                    } else {
                        await target.roles.remove(qRole, `Quarantine lifted by ${interaction.user.tag}`);
                    }
                } catch (e) {
                    await target.roles.remove(qRole, `Quarantine lifted by ${interaction.user.tag}`);
                }

                await logModerationAction({
                    guild,
                    user: target.user,
                    moderator,
                    action: 'UNBAN', // Or SANITIZE/UNQUARANTINE, using UNBAN for generic lifts per your schema enums, wait, schema has SANITIZE
                    reason: 'Quarantine Lifted',
                    color: 0x2ecc71,
                    emoji: '✅'
                });

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
