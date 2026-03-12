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

            let cmdListOptions = [];
            cmds.forEach(cmd => {
                const desc = cmd.data?.description || 'No description provided';
                cmdListOptions.push(`**\` /${cmd.data.name} \`**\n> ${desc}`);
            });
            const cmdList = cmdListOptions.join('\n\n');

            const container = new ContainerBuilder()
                .setAccentColor(meta.color)
                .addSectionComponents(
                    new SectionBuilder()
                        .addTextDisplayComponents(
                            new TextDisplayBuilder().setContent(`## ${meta.emoji}  ${meta.name} Module`)
                        )
                )
                .addSeparatorComponents(
                    new SeparatorBuilder().setSpacing(SeparatorSpacingSize.Small).setDivider(false)
                )
                .addTextDisplayComponents(
                    new TextDisplayBuilder().setContent(`*${meta.description}*\n\n---\n\n${cmdList || '> *No commands available.*'}`)
                )
                .addSeparatorComponents(
                    new SeparatorBuilder().setSpacing(SeparatorSpacingSize.Small).setDivider(true)
                )
                .addActionRowComponents(
                    new ActionRowBuilder().addComponents(
                        new ButtonBuilder()
                            .setCustomId('help_back')
                            .setLabel('Return to Modules')
                            .setStyle(ButtonStyle.Secondary)
                            .setEmoji('↩️')
                    )
                )
                .addSeparatorComponents(
                    new SeparatorBuilder().setSpacing(SeparatorSpacingSize.Small).setDivider(false)
                )
                .addTextDisplayComponents(
                    new TextDisplayBuilder().setContent(`-# Viewing ${cmds.size} command${cmds.size !== 1 ? 's' : ''} in the ${meta.name} module.`)
                );

            return await interaction.reply({ components: [container], flags: MessageFlags.IsComponentsV2 });
        }



        let categoryLines = '';
        const activeCategories = [];

        for (const [key, meta] of Object.entries(CATEGORIES)) {
            if (meta.adminOnly && !member.permissions.has(PermissionFlagsBits.ManageMessages)) continue;
            if (meta.nsfwOnly && !channel.nsfw) continue;
            const count = client.commands.filter(c => c.category === key).size;

            // Format nice block
            categoryLines += `### ${meta.emoji}  ${meta.name}\n`;
            categoryLines += `> ${meta.description}\n`;
            categoryLines += `> └─ \`${count}\` available commands\n\n`;

            activeCategories.push({ key, meta });
        }

        const selectMenu = new StringSelectMenuBuilder()
            .setCustomId('help_category_select')
            .setPlaceholder('Explore a Module...')
            .setMinValues(1)
            .setMaxValues(1);

        for (const { key, meta } of activeCategories) {
            selectMenu.addOptions(
                new StringSelectMenuOptionBuilder()
                    .setLabel(`${meta.name} Module`)
                    .setDescription(meta.description)
                    .setValue(key)
                    .setEmoji(meta.emoji)
            );
        }

        const container = new ContainerBuilder()
            .setAccentColor(0x2b2d31) // Discord's dark background color or slightly aesthetic
            .addSectionComponents(
                new SectionBuilder()
                    .addTextDisplayComponents(
                        new TextDisplayBuilder().setContent(`## ✨  Celestia Command Center`)
                    )
                    .setThumbnailAccessory(
                        new ThumbnailBuilder().setURL(client.user.displayAvatarURL({ size: 128 }))
                    )
            )
            .addSeparatorComponents(
                new SeparatorBuilder().setSpacing(SeparatorSpacingSize.Small).setDivider(true)
            )
            .addTextDisplayComponents(
                new TextDisplayBuilder().setContent(
                    `Welcome to the **Celestia** interactive help menu. Select a module from the dropdown below to explore specific features.\n\n` + categoryLines
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
                new TextDisplayBuilder().setContent(`-# 💡 Tip: You can also use \`/help <category>\` to jump straight to a module.`)
            );

        return await interaction.reply({ components: [container], flags: MessageFlags.IsComponentsV2 });
    },
};
