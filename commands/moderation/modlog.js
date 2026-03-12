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
            if (!settings) {
                settings = new Guild({ guildId: guild.id });
            }
            settings.modLogChannel = channel.id;
            await settings.save();

            const container = new ContainerBuilder()
                .setAccentColor(0x3498db)
                .addTextDisplayComponents(
                    new TextDisplayBuilder().setContent('## ⚙️  Modlog Channel Set')
                )
                .addSeparatorComponents(
                    new SeparatorBuilder().setSpacing(SeparatorSpacingSize.Small).setDivider(true)
                )
                .addTextDisplayComponents(
                    new TextDisplayBuilder().setContent(`**Channel:** ${channel}\n\n-# All future moderation actions will be logged here.`)
                );

            return interaction.reply({ components: [container], flags: MessageFlags.IsComponentsV2 });
        }

        if (sub === 'show') {
            const user = interaction.options.getUser('user');

            // Fetch logs for user, sorted by newest first
            const logs = await ModLog.find({ guildId: guild.id, userId: user.id }).sort({ timestamp: -1 });

            if (!logs || logs.length === 0) {
                return interaction.reply({ content: `> 🔍 No moderation history found for **${user.tag}**.`, flags: MessageFlags.Ephemeral });
            }

            let currentPage = 0;
            const itemsPerPage = 5;
            const maxPages = Math.ceil(logs.length / itemsPerPage);

            const generatePageContainer = (page) => {
                const start = page * itemsPerPage;
                const end = start + itemsPerPage;
                const pageLogs = logs.slice(start, end);

                const container = new ContainerBuilder()
                    .setAccentColor(0x9b59b6)
                    .addTextDisplayComponents(
                        new TextDisplayBuilder().setContent(`## 📋  Moderation History for ${user.tag}`)
                    )
                    .addSeparatorComponents(
                        new SeparatorBuilder().setSpacing(SeparatorSpacingSize.Small).setDivider(false)
                    );

                for (const log of pageLogs) {
                    const actionEmoji = {
                        'BAN': '🔨', 'UNBAN': '🕊️', 'KICK': '👢', 'TIMEOUT': '⏳', 'QUARANTINE': '⛓️', 'SANITIZE': '🧼'
                    }[log.action] || '🛡️';

                    const actionStr = `**[${log.action}]** <t:${Math.floor(log.timestamp.getTime() / 1000)}:d>`;
                    const moderatorStr = `Moderator: <@${log.moderatorId}>`;
                    const reasonStr = `Reason: ${log.reason}`;
                    const durationStr = log.duration ? `\nDuration: ${log.duration}` : '';
                    const proofStr = log.proof ? `\nProof: [Link](${log.proof})` : '';

                    container.addSectionComponents(
                        new SectionBuilder()
                            .addTextDisplayComponents(
                                new TextDisplayBuilder().setContent(
                                    `${actionEmoji} ${actionStr}\n${moderatorStr}\n${reasonStr}${durationStr}${proofStr}`
                                )
                            )
                    ).addSeparatorComponents(
                        new SeparatorBuilder().setSpacing(SeparatorSpacingSize.Small).setDivider(true)
                    );
                }

                container.addTextDisplayComponents(
                    new TextDisplayBuilder().setContent(`-# Page ${page + 1}/${maxPages} • Total Logs: ${logs.length}`)
                );

                return container;
            };

            const getRow = (page) => {
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
                        .setDisabled(page === maxPages - 1)
                );
            };

            const response = await interaction.reply({
                components: maxPages > 1 ? [generatePageContainer(currentPage), getRow(currentPage)] : [generatePageContainer(currentPage)],
                flags: MessageFlags.IsComponentsV2,
                fetchReply: true
            });

            if (maxPages > 1) {
                const collector = response.createMessageComponentCollector({ componentType: ComponentType.Button, time: 60000 });

                collector.on('collect', async i => {
                    if (i.user.id !== interaction.user.id) {
                        return i.reply({ content: 'These buttons are not for you!', ephemeral: true });
                    }

                    if (i.customId === 'prev_page') {
                        currentPage--;
                    } else if (i.customId === 'next_page') {
                        currentPage++;
                    }

                    await i.update({
                        components: [generatePageContainer(currentPage), getRow(currentPage)],
                        flags: MessageFlags.IsComponentsV2
                    });
                });

                collector.on('end', () => {
                    interaction.editReply({ components: [generatePageContainer(currentPage)] }).catch(() => { });
                });
            }
        }
    },
};
