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
        const isInteraction = interaction.isChatInputCommand?.() || false;
        const channelId = interaction.channel?.id;
        const guildId = interaction.guild?.id;
        const user = isInteraction ? interaction.user : interaction.author;

        if (!isInteraction && !interaction.member.permissions.has(PermissionFlagsBits.ManageMessages)) {
            return interaction.reply({ content: '> ❌ You do not have permission to use this command.', flags: MessageFlags.Ephemeral });
        }

        let filterType = null;
        if (isInteraction) {
            filterType = interaction.options.getString('type');
        } else if (interaction.commandName === 'editsnipe') {
            filterType = 'EDIT';
        }

        const query = { guildId, channelId };
        if (filterType) query.type = filterType;

        const snipes = await Snipe.find(query).sort({ createdAt: -1 }).limit(50);

        if (!snipes || snipes.length === 0) {
            return interaction.reply({ content: `> 🔍 There is nothing to snipe in this channel.`, flags: MessageFlags.Ephemeral });
        }

        let currentPage = 0;
        const maxPages = snipes.length;

        const getRow = (page) => {
            if (maxPages <= 1) return null;
            return new ActionRowBuilder().addComponents(
                new ButtonBuilder()
                    .setCustomId('first_snipe')
                    .setStyle(ButtonStyle.Secondary)
                    .setEmoji('⏪')
                    .setDisabled(page === 0),
                new ButtonBuilder()
                    .setCustomId('prev_snipe')
                    .setStyle(ButtonStyle.Secondary)
                    .setEmoji('◀️')
                    .setDisabled(page === 0),
                new ButtonBuilder()
                    .setCustomId('page_snipe')
                    .setStyle(ButtonStyle.Secondary)
                    .setLabel(`${page + 1}/${maxPages}`)
                    .setDisabled(true),
                new ButtonBuilder()
                    .setCustomId('next_snipe')
                    .setStyle(ButtonStyle.Secondary)
                    .setEmoji('▶️')
                    .setDisabled(page === maxPages - 1),
                new ButtonBuilder()
                    .setCustomId('last_snipe')
                    .setStyle(ButtonStyle.Secondary)
                    .setEmoji('⏩')
                    .setDisabled(page === maxPages - 1)
            );
        };

        const generatePageContainer = async (page) => {
            const snipe = snipes[page];
            const targetUser = await client.users.fetch(snipe.authorId).catch(() => null);
            const userTag = targetUser ? targetUser.tag : 'Unknown User';
            const userAvatar = targetUser ? targetUser.displayAvatarURL({ size: 64 }) : null;

            const typeLabel = snipe.type === 'DELETE' ? 'Message Snipe' : 'Edit Snipe';
            const typeEmoji = snipe.type === 'DELETE' ? '🗑️' : '✏️';

            const container = new ContainerBuilder()
                .setAccentColor(snipe.type === 'DELETE' ? 0xe74c3c : 0xf1c40f);

            
            container.addTextDisplayComponents(
                new TextDisplayBuilder().setContent(`# ${typeEmoji} ${typeLabel}`)
            );

            
            container.addSeparatorComponents(
                new SeparatorBuilder().setSpacing(SeparatorSpacingSize.Small).setDivider(true)
            );

            
            let infoText = `**Author:** ${userTag} \`(${snipe.authorId})\`\n`;
            infoText += `**When:** <t:${Math.floor(snipe.createdAt.getTime() / 1000)}:R>`;

            const section = new SectionBuilder()
                .addTextDisplayComponents(
                    new TextDisplayBuilder().setContent(infoText)
                );

            if (userAvatar) {
                section.setThumbnailAccessory(new ThumbnailBuilder().setURL(userAvatar));
            }

            container.addSectionComponents(section);

            
            container.addSeparatorComponents(
                new SeparatorBuilder().setSpacing(SeparatorSpacingSize.Small).setDivider(true)
            );

            
            if (snipe.type === 'DELETE') {
                container.addTextDisplayComponents(
                    new TextDisplayBuilder().setContent(snipe.content || '*No text content*')
                );
            } else {
                container.addTextDisplayComponents(
                    new TextDisplayBuilder().setContent(
                        `**Before:**\n${snipe.oldContent || '*No text content*'}\n\n**After:**\n${snipe.content || '*No text content*'}`
                    )
                );
            }

            
            if (snipe.attachments && snipe.attachments.length > 0) {
                container.addSeparatorComponents(
                    new SeparatorBuilder().setSpacing(SeparatorSpacingSize.Small).setDivider(false)
                );
                const gallery = new MediaGalleryBuilder();
                for (const url of snipe.attachments) {
                    gallery.addItems(new MediaGalleryItemBuilder().setURL(url));
                }
                container.addMediaGalleryComponents(gallery);
            }

            
            container.addSeparatorComponents(
                new SeparatorBuilder().setSpacing(SeparatorSpacingSize.Small).setDivider(true)
            );

            
            container.addTextDisplayComponents(
                new TextDisplayBuilder().setContent(
                    `-# 📄 Snipe ${page + 1} of ${maxPages}  •  #${interaction.channel.name}`
                )
            );

            
            const row = getRow(page);
            if (row) container.addActionRowComponents(row);

            return container;
        };

        const firstContainer = await generatePageContainer(currentPage);

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
                if (i.user.id !== user.id) {
                    return i.reply({ content: '> ❌ These buttons are not for you!', flags: MessageFlags.Ephemeral }).catch(() => { });
                }

                if (i.customId === 'first_snipe') currentPage = 0;
                else if (i.customId === 'prev_snipe') currentPage--;
                else if (i.customId === 'next_snipe') currentPage++;
                else if (i.customId === 'last_snipe') currentPage = maxPages - 1;

                const newContainer = await generatePageContainer(currentPage);
                await i.update({
                    components: [newContainer],
                    flags: MessageFlags.IsComponentsV2
                }).catch(() => { });
            });

            collector.on('end', async () => {
                try {
                    const finalContainer = await generatePageContainer(currentPage);
                    if (finalContainer.data?.components) {
                        finalContainer.data.components = finalContainer.data.components.filter(c => (c.type ?? c.data?.type) !== 1);
                    }
                    interaction.editReply({ components: [finalContainer], flags: MessageFlags.IsComponentsV2 }).catch(() => { });
                } catch (e) { }
            });
        }
    },
};
