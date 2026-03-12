const {
    SlashCommandBuilder,
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

module.exports = {
    category: 'utility',
    data: new SlashCommandBuilder()
        .setName('ticket')
        .setDescription('Setup the support ticket system.'),
    aliases: ['tickets'],
    async execute(interaction) {
        if (!interaction.member.permissions.has('Administrator')) {
            return interaction.reply({ content: '> ❌ You need **Administrator** permissions to use this.', flags: MessageFlags.Ephemeral });
        }

        const container = new ContainerBuilder()
            .setAccentColor(0x2ecc71)
            
            .addTextDisplayComponents(
                new TextDisplayBuilder().setContent('# 🎫 Support Tickets')
            )
            
            .addSeparatorComponents(
                new SeparatorBuilder().setSpacing(SeparatorSpacingSize.Small).setDivider(true)
            )
            
            .addSectionComponents(
                new SectionBuilder()
                    .addTextDisplayComponents(
                        new TextDisplayBuilder().setContent(
                            `Need help? We're here for you!\n\n` +
                            `📩 Click **Open Ticket** to create a private support channel.\n` +
                            `🔒 Your ticket will only be visible to you and our support staff.\n` +
                            `⏱️ We aim to respond as quickly as possible.`
                        )
                    )
                    .setButtonAccessory(
                        new ButtonBuilder()
                            .setCustomId('open_ticket')
                            .setLabel('Open Ticket')
                            .setStyle(ButtonStyle.Success)
                            .setEmoji('📩')
                    )
            )
            
            .addSeparatorComponents(
                new SeparatorBuilder().setSpacing(SeparatorSpacingSize.Small).setDivider(true)
            )
            
            .addActionRowComponents(
                new ActionRowBuilder().addComponents(
                    new ButtonBuilder()
                        .setCustomId('ticket_info')
                        .setLabel('How it works')
                        .setStyle(ButtonStyle.Secondary)
                        .setEmoji('ℹ️')
                )
            )
            
            .addSeparatorComponents(
                new SeparatorBuilder().setSpacing(SeparatorSpacingSize.Small).setDivider(false)
            )
            
            .addTextDisplayComponents(
                new TextDisplayBuilder().setContent(`-# 🟢 Ticket system active  •  Do not abuse this feature.`)
            );

        return await interaction.reply({
            components: [container],
            flags: MessageFlags.IsComponentsV2
        });
    },
};
