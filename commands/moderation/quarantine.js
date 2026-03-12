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
                await role.setPermissions(0n);
                if (role.position > 1) {
                    try { await role.setPosition(1); } catch (e) { }
                }

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
                        new TextDisplayBuilder().setContent('# ⚙️ Quarantine Role Set')
                    )
                    
                    .addSeparatorComponents(
                        new SeparatorBuilder().setSpacing(SeparatorSpacingSize.Small).setDivider(true)
                    )
                    
                    .addSectionComponents(
                        new SectionBuilder()
                            .addTextDisplayComponents(
                                new TextDisplayBuilder().setContent(
                                    `**Role:** ${role} \`(${role.id})\`\n` +
                                    `**Permissions Cleared:** ✅ All permissions removed from role.\n\n` +
                                    `-# Members assigned this role will not be able to see any channels.`
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
                        new TextDisplayBuilder().setContent(`-# ✅ Configuration saved  •  Channel overrides applied`)
                    );

                return interaction.reply({ components: [container], flags: MessageFlags.IsComponentsV2 });
            }

            if (sub === 'setchannel') {
                const channel = interaction.options.getChannel('channel');

                if (!settings.quarantineRoleId) {
                    return interaction.reply({ content: '> ❌ Quarantine role has not been set. Use `/quarantine setrole` first.', flags: MessageFlags.Ephemeral });
                }

                const permissionState = {
                    ViewChannel: { label: 'View Channel', desc: 'Allow quarantined users to see this channel', emoji: '👁️', value: true },
                    SendMessages: { label: 'Send Messages', desc: 'Allow quarantined users to send messages', emoji: '💬', value: false },
                    ReadMessageHistory: { label: 'Read History', desc: 'Allow quarantined users to read past messages', emoji: '📜', value: true },
                    AddReactions: { label: 'Add Reactions', desc: 'Allow quarantined users to add reactions', emoji: '😀', value: false },
                    AttachFiles: { label: 'Attach Files', desc: 'Allow quarantined users to attach files', emoji: '📎', value: false },
                    EmbedLinks: { label: 'Embed Links', desc: 'Allow quarantined users to embed links', emoji: '🔗', value: false },
                    UseExternalEmojis: { label: 'External Emojis', desc: 'Allow quarantined users to use external emojis', emoji: '🎭', value: false }
                };

                const permKeys = Object.keys(permissionState);

                const buildContainer = () => {
                    const container = new ContainerBuilder()
                        .setAccentColor(0xf1c40f)
                        
                        .addTextDisplayComponents(
                            new TextDisplayBuilder().setContent(`# ⚙️ Configure Quarantine Channel`)
                        )
                        
                        .addSeparatorComponents(
                            new SeparatorBuilder().setSpacing(SeparatorSpacingSize.Small).setDivider(true)
                        )
                        
                        .addSectionComponents(
                            new SectionBuilder()
                                .addTextDisplayComponents(
                                    new TextDisplayBuilder().setContent(
                                        `**Channel:** #${channel.name}\n` +
                                        `Toggle permissions for the quarantine role below.`
                                    )
                                )
                                .setThumbnailAccessory(
                                    new ThumbnailBuilder().setURL(guild.iconURL({ size: 64 }) || 'https://cdn.discordapp.com/embed/avatars/0.png')
                                )
                        )
                        
                        .addSeparatorComponents(
                            new SeparatorBuilder().setSpacing(SeparatorSpacingSize.Small).setDivider(true)
                        );

                    
                    for (const key of permKeys) {
                        const perm = permissionState[key];
                        container.addSectionComponents(
                            new SectionBuilder()
                                .addTextDisplayComponents(
                                    new TextDisplayBuilder().setContent(
                                        `${perm.emoji} **${perm.label}**\n-# ${perm.desc}`
                                    )
                                )
                                .setButtonAccessory(
                                    new ButtonBuilder()
                                        .setCustomId(`toggle_${key}`)
                                        .setLabel(perm.value ? 'True' : 'False')
                                        .setStyle(perm.value ? ButtonStyle.Success : ButtonStyle.Danger)
                                )
                        );
                    }

                    
                    container.addSeparatorComponents(
                        new SeparatorBuilder().setSpacing(SeparatorSpacingSize.Small).setDivider(true)
                    );

                    
                    container.addTextDisplayComponents(
                        new TextDisplayBuilder().setContent(`-# 💾 Click Save Config when done`)
                    );

                    
                    container.addActionRowComponents(
                        new ActionRowBuilder().addComponents(
                            new ButtonBuilder()
                                .setCustomId('save_perms')
                                .setLabel('Save Config')
                                .setStyle(ButtonStyle.Success)
                                .setEmoji('💾')
                        )
                    );

                    return container;
                };

                const response = await interaction.reply({
                    components: [buildContainer()],
                    flags: MessageFlags.IsComponentsV2,
                    withResponse: true
                });

                const message = response.resource?.message;
                if (!message) return;

                const collector = message.createMessageComponentCollector({ componentType: ComponentType.Button, time: 120000 });

                collector.on('collect', async i => {
                    if (i.user.id !== interaction.user.id) {
                        return i.reply({ content: '> ❌ These buttons are not for you!', flags: MessageFlags.Ephemeral }).catch(() => { });
                    }

                    if (i.customId === 'save_perms') {
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
                                new TextDisplayBuilder().setContent('# ✅ Quarantine Channel Configured')
                            )
                            .addSeparatorComponents(
                                new SeparatorBuilder().setSpacing(SeparatorSpacingSize.Small).setDivider(true)
                            )
                            .addSectionComponents(
                                new SectionBuilder()
                                    .addTextDisplayComponents(
                                        new TextDisplayBuilder().setContent(
                                            `**Channel:** ${channel}\n\n` +
                                            permKeys.map(k => {
                                                const p = permissionState[k];
                                                return `${p.emoji} **${p.label}:** ${p.value ? '✅ Allowed' : '❌ Denied'}`;
                                            }).join('\n')
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
                                new TextDisplayBuilder().setContent(`-# ✅ Configuration saved successfully`)
                            );

                        await i.update({
                            components: [finalContainer],
                            flags: MessageFlags.IsComponentsV2
                        }).catch(() => { });
                        return collector.stop('saved');
                    } else if (i.customId.startsWith('toggle_')) {
                        const key = i.customId.replace('toggle_', '');
                        if (permissionState[key] !== undefined) {
                            permissionState[key].value = !permissionState[key].value;
                        }
                    }

                    await i.update({
                        components: [buildContainer()],
                        flags: MessageFlags.IsComponentsV2
                    }).catch(() => { });
                });

                collector.on('end', (collected, reason) => {
                    if (reason !== 'saved') {
                        const timeoutContainer = new ContainerBuilder()
                            .setAccentColor(0x95a5a6)
                            .addTextDisplayComponents(
                                new TextDisplayBuilder().setContent('# ⏳ Configuration Timed Out')
                            )
                            .addSeparatorComponents(
                                new SeparatorBuilder().setSpacing(SeparatorSpacingSize.Small).setDivider(true)
                            )
                            .addTextDisplayComponents(
                                new TextDisplayBuilder().setContent(`-# Run \`/quarantine setchannel\` again to configure.`)
                            );
                        interaction.editReply({
                            components: [timeoutContainer],
                            flags: MessageFlags.IsComponentsV2
                        }).catch(() => { });
                    }
                });

                return;
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
                        new TextDisplayBuilder().setContent('# ⛓️ User Quarantined')
                    )
                    
                    .addSeparatorComponents(
                        new SeparatorBuilder().setSpacing(SeparatorSpacingSize.Small).setDivider(true)
                    )
                    
                    .addSectionComponents(
                        new SectionBuilder()
                            .addTextDisplayComponents(
                                new TextDisplayBuilder().setContent(
                                    `**User:** ${target.user.tag} \`(${target.id})\`\n` +
                                    `**Moderator:** ${interaction.user.tag}\n` +
                                    `**Reason:** ${reason}`
                                )
                            )
                            .setThumbnailAccessory(
                                new ThumbnailBuilder().setURL(target.user.displayAvatarURL({ size: 64 }))
                            )
                    )
                    
                    .addSeparatorComponents(
                        new SeparatorBuilder().setSpacing(SeparatorSpacingSize.Small).setDivider(true)
                    )
                    
                    .addTextDisplayComponents(
                        new TextDisplayBuilder().setContent(
                            `-# 📅 Since <t:${Math.floor(Date.now() / 1000)}:R>` +
                            (deleteDays > 0 ? `  •  🗑️ ~${messagesDeleted} messages deleted` : '') +
                            `  •  Use \`/quarantine remove\` to lift`
                        )
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
                    action: 'UNBAN',
                    reason: 'Quarantine Lifted',
                    color: 0x2ecc71,
                    emoji: '✅'
                });

                const container = new ContainerBuilder()
                    .setAccentColor(0x2ecc71)
                    
                    .addTextDisplayComponents(
                        new TextDisplayBuilder().setContent('# ✅ Quarantine Lifted')
                    )
                    
                    .addSeparatorComponents(
                        new SeparatorBuilder().setSpacing(SeparatorSpacingSize.Small).setDivider(true)
                    )
                    
                    .addSectionComponents(
                        new SectionBuilder()
                            .addTextDisplayComponents(
                                new TextDisplayBuilder().setContent(
                                    `**User:** ${target.user.tag} \`(${target.id})\`\n` +
                                    `**Lifted by:** ${interaction.user.tag}`
                                )
                            )
                            .setThumbnailAccessory(
                                new ThumbnailBuilder().setURL(target.user.displayAvatarURL({ size: 64 }))
                            )
                    )
                    
                    .addSeparatorComponents(
                        new SeparatorBuilder().setSpacing(SeparatorSpacingSize.Small).setDivider(true)
                    )
                    
                    .addTextDisplayComponents(
                        new TextDisplayBuilder().setContent(
                            `-# 📅 <t:${Math.floor(Date.now() / 1000)}:F>  •  🔓 User can now access the server normally`
                        )
                    );

                return interaction.reply({ components: [container], flags: MessageFlags.IsComponentsV2 });
            }
        }
    },
};
