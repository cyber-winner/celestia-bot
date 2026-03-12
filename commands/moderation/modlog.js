const { SlashCommandBuilder, PermissionFlagsBits, ContainerBuilder, TextDisplayBuilder, MessageFlags, SeparatorBuilder, SeparatorSpacingSize, SectionBuilder, ThumbnailBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, ComponentType } = require('discord.js');
const ModLog = require('../../models/ModLog');
const Guild = require('../../models/Guild');

module.exports = {
    category: 'moderation',
    data: new SlashCommandBuilder()
        .setName('modlog')
        .setDescription('Manage and view moderation logs.')
        .addSubcommand(sub => sub.setName('setchannel')
            .setDescription('Set the channel where mod actions are logged')
            .addChannelOption(opt => opt.setName('channel').setDescription('The modlog channel').setRequired(true)))
        .addSubcommand(sub => sub.setName('show')
            .setDescription('View the moderation history of a user')
            .addUserOption(opt => opt.setName('user').setDescription('The user to check').setRequired(true)))
        .setDefaultMemberPermissions(PermissionFlagsBits.ModerateMembers),
    aliases: ['ml'],
    async execute(interaction, client, args) {
        if (!interaction.isChatInputCommand?.()) return;

        const guild = interaction.guild;
        const sub = interaction.options.getSubcommand();

        if (sub === 'setchannel') {
            if (!interaction.member.permissions.has(PermissionFlagsBits.ManageGuild)) {
                return interaction.reply({ content: '> ❌ You need Manage Server permission to set the modlog channel.', flags: MessageFlags.Ephemeral });
            }

            const channel = interaction.options.getChannel('channel');
            let settings = await Guild.findOne({ guildId: guild.id });
            if (!settings) settings = new Guild({ guildId: guild.id });
            settings.modLogChannel = channel.id;
            await settings.save();

            const container = new ContainerBuilder()
                .setAccentColor(0x3498db)
                
                .addTextDisplayComponents(
                    new TextDisplayBuilder().setContent('# ⚙️ Modlog Channel Set')
                )
                
                .addSeparatorComponents(
                    new SeparatorBuilder().setSpacing(SeparatorSpacingSize.Small).setDivider(true)
                )
                
                .addSectionComponents(
                    new SectionBuilder()
                        .addTextDisplayComponents(
                            new TextDisplayBuilder().setContent(
                                `All future moderation actions will be logged to ${channel}.\n\n` +
                                `-# Actions include: bans, kicks, timeouts, quarantines, and sanitizations.`
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

            return interaction.reply({ components: [container], flags: MessageFlags.IsComponentsV2 });
        }

        if (sub === 'show') {
            const user = interaction.options.getUser('user');
            const logs = await ModLog.find({ guildId: guild.id, userId: user.id }).sort({ timestamp: -1 });

            if (!logs || logs.length === 0) {
                return interaction.reply({ content: `> 🔍 No moderation history found for **${user.tag}**.`, flags: MessageFlags.Ephemeral });
            }

            let currentPage = 0;
            const itemsPerPage = 5;
            const maxPages = Math.ceil(logs.length / itemsPerPage);

            const getRow = (page) => {
                if (maxPages <= 1) return null;
                return new ActionRowBuilder().addComponents(
                    new ButtonBuilder()
                        .setCustomId('first_modlog')
                        .setStyle(ButtonStyle.Secondary)
                        .setEmoji('⏪')
                        .setDisabled(page === 0),
                    new ButtonBuilder()
                        .setCustomId('prev_modlog')
                        .setStyle(ButtonStyle.Secondary)
                        .setEmoji('◀️')
                        .setDisabled(page === 0),
                    new ButtonBuilder()
                        .setCustomId('page_modlog')
                        .setStyle(ButtonStyle.Secondary)
                        .setLabel(`${page + 1}/${maxPages}`)
                        .setDisabled(true),
                    new ButtonBuilder()
                        .setCustomId('next_modlog')
                        .setStyle(ButtonStyle.Secondary)
                        .setEmoji('▶️')
                        .setDisabled(page === maxPages - 1),
                    new ButtonBuilder()
                        .setCustomId('last_modlog')
                        .setStyle(ButtonStyle.Secondary)
                        .setEmoji('⏩')
                        .setDisabled(page === maxPages - 1)
                );
            };

            const generatePageContainer = (page) => {
                const start = page * itemsPerPage;
                const end = start + itemsPerPage;
                const pageLogs = logs.slice(start, end);

                const actionEmojis = {
                    'BAN': '🔨', 'UNBAN': '🕊️', 'KICK': '👢',
                    'TIMEOUT': '⏳', 'QUARANTINE': '⛓️', 'SANITIZE': '🧼'
                };

                const container = new ContainerBuilder()
                    .setAccentColor(0x9b59b6);

                
                container.addTextDisplayComponents(
                    new TextDisplayBuilder().setContent(`# 📋 Moderation History`)
                );

                
                container.addSeparatorComponents(
                    new SeparatorBuilder().setSpacing(SeparatorSpacingSize.Small).setDivider(true)
                );

                
                container.addSectionComponents(
                    new SectionBuilder()
                        .addTextDisplayComponents(
                            new TextDisplayBuilder().setContent(
                                `**User:** ${user.tag} \`(${user.id})\`\n` +
                                `**Total Actions:** ${logs.length}\n\n` +
                                `-# Showing ${pageLogs.length} of ${logs.length} entries`
                            )
                        )
                        .setThumbnailAccessory(
                            new ThumbnailBuilder().setURL(user.displayAvatarURL({ size: 64 }))
                        )
                );

                
                container.addSeparatorComponents(
                    new SeparatorBuilder().setSpacing(SeparatorSpacingSize.Small).setDivider(true)
                );

                
                let logContent = '';
                for (const log of pageLogs) {
                    const emoji = actionEmojis[log.action] || '🛡️';
                    logContent += `${emoji} **[${log.action}]** <t:${Math.floor(log.timestamp.getTime() / 1000)}:d>\n`;
                    logContent += `> Moderator: <@${log.moderatorId}>\n`;
                    logContent += `> Reason: ${log.reason}`;
                    if (log.duration) logContent += `\n> Duration: ${log.duration}`;
                    if (log.proof) logContent += `\n> Proof: [Link](${log.proof})`;
                    logContent += '\n\n';
                }

                container.addTextDisplayComponents(
                    new TextDisplayBuilder().setContent(logContent.trim())
                );

                
                container.addSeparatorComponents(
                    new SeparatorBuilder().setSpacing(SeparatorSpacingSize.Small).setDivider(true)
                );

                
                container.addTextDisplayComponents(
                    new TextDisplayBuilder().setContent(
                        `-# 📄 Page ${page + 1} of ${maxPages}  •  ${logs.length} total records`
                    )
                );

                
                const row = getRow(page);
                if (row) container.addActionRowComponents(row);

                return container;
            };

            const firstContainer = generatePageContainer(currentPage);

            const response = await interaction.reply({
                components: [firstContainer],
                flags: MessageFlags.IsComponentsV2,
                withResponse: true
            });

            if (maxPages > 1) {
                const message = response.resource?.message;
                if (!message) return;

                const collector = message.createMessageComponentCollector({ componentType: ComponentType.Button, time: 120_000 });

                collector.on('collect', async i => {
                    if (i.user.id !== interaction.user.id) {
                        return i.reply({ content: '> ❌ These buttons are not for you!', flags: MessageFlags.Ephemeral }).catch(() => { });
                    }

                    if (i.customId === 'first_modlog') currentPage = 0;
                    else if (i.customId === 'prev_modlog') currentPage--;
                    else if (i.customId === 'next_modlog') currentPage++;
                    else if (i.customId === 'last_modlog') currentPage = maxPages - 1;

                    const newContainer = generatePageContainer(currentPage);
                    await i.update({
                        components: [newContainer],
                        flags: MessageFlags.IsComponentsV2
                    }).catch(() => { });
                });

                collector.on('end', () => {
                    try {
                        const finalContainer = generatePageContainer(currentPage);
                        if (finalContainer.data?.components) {
                            finalContainer.data.components = finalContainer.data.components.filter(c => (c.type ?? c.data?.type) !== 1);
                        }
                        interaction.editReply({ components: [finalContainer], flags: MessageFlags.IsComponentsV2 }).catch(() => { });
                    } catch (e) { }
                });
            }
        }
    },
};
