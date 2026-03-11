const {
    SlashCommandBuilder,
    ContainerBuilder,
    TextDisplayBuilder,
    MessageFlags,
    PermissionFlagsBits,
    SeparatorBuilder,
    SeparatorSpacingSize,
    SectionBuilder,
    ThumbnailBuilder,
    ActionRowBuilder,
    StringSelectMenuBuilder,
    StringSelectMenuOptionBuilder,
    ButtonBuilder,
    ButtonStyle
} = require('discord.js');

const CATEGORIES = {
    fun: { name: 'Fun', emoji: '🎉', description: 'Anime reaction GIFs and social commands', color: 0xff6b8a },
    moderation: { name: 'Moderation', emoji: '🛡️', description: 'Server management and moderation tools', color: 0xed4245, adminOnly: true },
    utility: { name: 'Utility', emoji: '🔧', description: 'Helpful server utilities and tools', color: 0x5865f2 },
    nsfw: { name: 'NSFW', emoji: '🔞', description: 'Age-restricted content (NSFW channels only)', color: 0xe91e63, nsfwOnly: true }
};

module.exports = {
    category: 'utility',
    data: new SlashCommandBuilder()
        .setName('help')
        .setDescription('Browse all available commands.')
        .addStringOption(opt =>
            opt.setName('category')
                .setDescription('View commands for a specific category')
                .addChoices(
                    { name: '🎉 Fun', value: 'fun' },
                    { name: '🛡️ Moderation', value: 'moderation' },
                    { name: '🔧 Utility', value: 'utility' },
                    { name: '🔞 NSFW', value: 'nsfw' }
                )
        ),
    aliases: ['h', 'commands'],
    async execute(interaction, client, args) {
        const isInteraction = interaction.isChatInputCommand?.() || false;
        const member = interaction.member;
        const channel = interaction.channel;

        const selectedCategory = isInteraction ? interaction.options.getString('category') : (args?.[0]?.toLowerCase());

        
        if (selectedCategory && CATEGORIES[selectedCategory]) {
            const meta = CATEGORIES[selectedCategory];

            if (meta.adminOnly && !member.permissions.has(PermissionFlagsBits.ManageMessages)) {
                return interaction.reply({ content: '> ❌ You do not have permission to view moderation commands.', flags: MessageFlags.Ephemeral });
            }
            if (meta.nsfwOnly && !channel.nsfw) {
                return interaction.reply({ content: '> 🔞 NSFW commands can only be viewed in NSFW channels.', flags: MessageFlags.Ephemeral });
            }

            const cmds = client.commands.filter(cmd => cmd.category === selectedCategory);

            let cmdList = '';
            cmds.forEach(cmd => {
                const desc = cmd.data?.description || 'No description';
                cmdList += `\`/${cmd.data.name}\` — ${desc}\n`;
            });

            const container = new ContainerBuilder()
                .setAccentColor(meta.color)
                .addTextDisplayComponents(
                    new TextDisplayBuilder().setContent(`## ${meta.emoji}  ${meta.name} Commands`)
                )
                .addSeparatorComponents(
                    new SeparatorBuilder().setSpacing(SeparatorSpacingSize.Small).setDivider(false)
                )
                .addTextDisplayComponents(
                    new TextDisplayBuilder().setContent(`*${meta.description}*`)
                )
                .addSeparatorComponents(
                    new SeparatorBuilder().setSpacing(SeparatorSpacingSize.Small).setDivider(true)
                )
                .addTextDisplayComponents(
                    new TextDisplayBuilder().setContent(cmdList || '> *No commands available in this category.*')
                )
                .addSeparatorComponents(
                    new SeparatorBuilder().setSpacing(SeparatorSpacingSize.Small).setDivider(false)
                )
                .addActionRowComponents(
                    new ActionRowBuilder().addComponents(
                        new ButtonBuilder()
                            .setCustomId('help_back')
                            .setLabel('Back to Overview')
                            .setStyle(ButtonStyle.Secondary)
                            .setEmoji('↩️')
                    )
                )
                .addSeparatorComponents(
                    new SeparatorBuilder().setSpacing(SeparatorSpacingSize.Small).setDivider(false)
                )
                .addTextDisplayComponents(
                    new TextDisplayBuilder().setContent(`-# ${cmds.size} command${cmds.size !== 1 ? 's' : ''} in this category  •  Use \`/help\` for all categories`)
                );

            return await interaction.reply({ components: [container], flags: MessageFlags.IsComponentsV2 });
        }

        
        
        let categoryLines = '';
        for (const [key, meta] of Object.entries(CATEGORIES)) {
            if (meta.adminOnly && !member.permissions.has(PermissionFlagsBits.ManageMessages)) continue;
            if (meta.nsfwOnly && !channel.nsfw) continue;
            const count = client.commands.filter(c => c.category === key).size;
            categoryLines += `${meta.emoji} **${meta.name}** — ${count} command${count !== 1 ? 's' : ''}\n`;
        }

        const selectMenu = new StringSelectMenuBuilder()
            .setCustomId('help_category_select')
            .setPlaceholder('📂  Browse a category...')
            .setMinValues(1)
            .setMaxValues(1);

        for (const [key, meta] of Object.entries(CATEGORIES)) {
            if (meta.adminOnly && !member.permissions.has(PermissionFlagsBits.ManageMessages)) continue;
            if (meta.nsfwOnly && !channel.nsfw) continue;
            selectMenu.addOptions(
                new StringSelectMenuOptionBuilder()
                    .setLabel(`${meta.name} Commands`)
                    .setDescription(meta.description)
                    .setValue(key)
                    .setEmoji(meta.emoji)
            );
        }

        const container = new ContainerBuilder()
            .setAccentColor(0x5865f2)
            .addSectionComponents(
                new SectionBuilder()
                    .addTextDisplayComponents(
                        new TextDisplayBuilder().setContent(`## 📚  Celestia Help`)
                    )
                    .setThumbnailAccessory(
                        new ThumbnailBuilder().setURL(client.user.displayAvatarURL({ size: 64 }))
                    )
            )
            .addSeparatorComponents(
                new SeparatorBuilder().setSpacing(SeparatorSpacingSize.Small).setDivider(false)
            )
            .addTextDisplayComponents(
                new TextDisplayBuilder().setContent(
                    `Welcome to **Celestia**! Here's an overview of available command categories:\n\n${categoryLines}`
                )
            )
            .addSeparatorComponents(
                new SeparatorBuilder().setSpacing(SeparatorSpacingSize.Small).setDivider(true)
            )
            .addActionRowComponents(
                new ActionRowBuilder().addComponents(selectMenu)
            )
            .addSeparatorComponents(
                new SeparatorBuilder().setSpacing(SeparatorSpacingSize.Small).setDivider(false)
            )
            .addTextDisplayComponents(
                new TextDisplayBuilder().setContent(`-# 💡 Use \`/help <category>\` or the menu above  •  ${client.commands.size} total commands`)
            );

        return await interaction.reply({ components: [container], flags: MessageFlags.IsComponentsV2 });
    },
};
