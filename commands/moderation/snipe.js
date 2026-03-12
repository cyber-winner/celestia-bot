const { SlashCommandBuilder, PermissionFlagsBits, ContainerBuilder, TextDisplayBuilder, MessageFlags, SeparatorBuilder, SeparatorSpacingSize, SectionBuilder, ThumbnailBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, ComponentType, MediaGalleryBuilder, MediaGalleryItemBuilder } = require('discord.js');
const Snipe = require('../../models/Snipe');

module.exports = {
    category: 'moderation',
    data: new SlashCommandBuilder()
        .setName('snipe')
        .setDescription('Shows recently deleted or edited messages in this channel.')
        .addStringOption(opt => opt.setName('type').setDescription('Filter by type').addChoices({ name: 'Deleted Messages', value: 'DELETE' }, { name: 'Edited Messages', value: 'EDIT' }))
        .setDefaultMemberPermissions(PermissionFlagsBits.ManageMessages),
    aliases: ['snipe', 'editsnipe'],
    async execute(interaction, client, args) {
        // Handle both interaction and prefix commands
        const isInteraction = interaction.isChatInputCommand?.() || false;
        const channelId = interaction.channel?.id;
        const guildId = interaction.guild?.id;
        const user = isInteraction ? interaction.user : interaction.author;

        // If prefix command and not admin
        if (!isInteraction && !interaction.member.permissions.has(PermissionFlagsBits.ManageMessages)) {
            return interaction.reply({ content: '> ❌ You do not have permission to use this command.', flags: MessageFlags.Ephemeral });
        }

        let filterType = null;
        if (isInteraction) {
            filterType = interaction.options.getString('type');
        } else if (interaction.commandName === 'editsnipe') {
            filterType = 'EDIT'; // or alias check
        }

        const query = { guildId, channelId };
        if (filterType) {
            query.type = filterType;
        }

        // Fetch logs for channel, sorted by newest first
        const snipes = await Snipe.find(query).sort({ createdAt: -1 }).limit(50); // Limit to last 50 for performance

        if (!snipes || snipes.length === 0) {
            return interaction.reply({ content: `> 🔍 There is nothing to snipe in this channel.`, flags: MessageFlags.Ephemeral });
        }

        let currentPage = 0;
        const maxPages = snipes.length;

        const generatePageContainer = async (page) => {
            const snipe = snipes[page];
            const targetUser = await client.users.fetch(snipe.authorId).catch(() => null);
            const userTag = targetUser ? targetUser.tag : 'Unknown User';
            const userAvatar = targetUser ? targetUser.displayAvatarURL({ size: 64 }) : null;

            const container = new ContainerBuilder()
                .setAccentColor(snipe.type === 'DELETE' ? 0xe74c3c : 0xf1c40f) // Red for delete, Yellow for edit
                .addTextDisplayComponents(
                    new TextDisplayBuilder().setContent(`## 🔫  ${snipe.type === 'DELETE' ? 'Message Snipe' : 'Edit Snipe'}`)
                )
                .addSeparatorComponents(
                    new SeparatorBuilder().setSpacing(SeparatorSpacingSize.Small).setDivider(true)
                );

            const section = new SectionBuilder();
            let contentStr = '';

            if (snipe.type === 'DELETE') {
                contentStr = `**Author:** ${userTag} \`(${snipe.authorId})\`\n**Content:**\n${snipe.content || '*No text content*'}`;
            } else {
                contentStr = `**Author:** ${userTag} \`(${snipe.authorId})\`\n**Old Content:**\n${snipe.oldContent || '*No text content*'}\n\n**New Content:**\n${snipe.content || '*No text content*'}`;
            }

            section.addTextDisplayComponents(
                new TextDisplayBuilder().setContent(contentStr)
            );

            if (userAvatar) {
                section.setThumbnailAccessory(new ThumbnailBuilder().setURL(userAvatar));
            }

            container.addSectionComponents(section);

            // Add media gallery if there are attachments
            if (snipe.attachments && snipe.attachments.length > 0) {
                container.addSeparatorComponents(
                    new SeparatorBuilder().setSpacing(SeparatorSpacingSize.Small).setDivider(false)
                );

                const gallery = new MediaGalleryBuilder();
                let hasValidMedia = false;
                for (const url of snipe.attachments) {
                    // Only add image/video matching simple heuristics or relying on Discord's native handling
                    gallery.addItems(new MediaGalleryItemBuilder().setURL(url));
                    hasValidMedia = true;
                }

                if (hasValidMedia) {
                    container.addMediaGalleryComponents(gallery);
                }
            }

            container.addSeparatorComponents(
                new SeparatorBuilder().setSpacing(SeparatorSpacingSize.Small).setDivider(true)
            );

            container.addTextDisplayComponents(
                new TextDisplayBuilder().setContent(`📅 <t:${Math.floor(snipe.createdAt.getTime() / 1000)}:R> • Snipe ${page + 1} of ${maxPages}`)
            );

            return container;
        };

        const getRow = (page) => {
            return new ActionRowBuilder().addComponents(
                new ButtonBuilder()
                    .setCustomId('prev_snipe')
                    .setLabel('Recent')
                    .setStyle(ButtonStyle.Primary)
                    .setDisabled(page === 0),
                new ButtonBuilder()
                    .setCustomId('next_snipe')
                    .setLabel('Older')
                    .setStyle(ButtonStyle.Primary)
                    .setDisabled(page === maxPages - 1)
            );
        };

        const firstPageContainer = await generatePageContainer(currentPage);

        const response = await interaction.reply({
            components: maxPages > 1 ? [firstPageContainer, getRow(currentPage)] : [firstPageContainer],
            flags: MessageFlags.IsComponentsV2,
            fetchReply: true
        });

        if (maxPages > 1) {
            const collector = response.createMessageComponentCollector({ componentType: ComponentType.Button, time: 60000 });

            collector.on('collect', async i => {
                if (i.user.id !== user.id) {
                    return i.reply({ content: 'These buttons are not for you!', ephemeral: true });
                }

                if (i.customId === 'prev_snipe') {
                    currentPage--;
                } else if (i.customId === 'next_snipe') {
                    currentPage++;
                }

                const newContainer = await generatePageContainer(currentPage);
                await i.update({
                    components: [newContainer, getRow(currentPage)],
                    flags: MessageFlags.IsComponentsV2
                });
            });

            collector.on('end', () => {
                interaction.editReply({ components: [firstPageContainer] }).catch(() => { });
            });
        }
    },
};
