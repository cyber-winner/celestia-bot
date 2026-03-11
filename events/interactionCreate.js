const {
    Events,
    MessageFlags,
    ContainerBuilder,
    TextDisplayBuilder,
    SeparatorBuilder,
    SeparatorSpacingSize,
    SectionBuilder,
    ThumbnailBuilder,
    ActionRowBuilder,
    StringSelectMenuBuilder,
    StringSelectMenuOptionBuilder,
    ButtonBuilder,
    ButtonStyle,
    PermissionFlagsBits
} = require('discord.js');
const axios = require('axios');



const HELP_CATEGORIES = {
    fun: { name: 'Fun', emoji: '🎉', description: 'Anime reaction GIFs and social commands', color: 0xff6b8a },
    moderation: { name: 'Moderation', emoji: '🛡️', description: 'Server management and moderation tools', color: 0xed4245, adminOnly: true },
    utility: { name: 'Utility', emoji: '🔧', description: 'Helpful server utilities and tools', color: 0x5865f2 },
    nsfw: { name: 'NSFW', emoji: '🔞', description: 'Age-restricted content (NSFW channels only)', color: 0xe91e63, nsfwOnly: true }
};

function buildHelpOverview(client, member, channel) {
    let categoryLines = '';
    const selectMenu = new StringSelectMenuBuilder()
        .setCustomId('help_category_select')
        .setPlaceholder('📂  Browse a category...')
        .setMinValues(1)
        .setMaxValues(1);

    for (const [key, meta] of Object.entries(HELP_CATEGORIES)) {
        if (meta.adminOnly && !member.permissions.has(PermissionFlagsBits.ManageMessages)) continue;
        if (meta.nsfwOnly && !channel.nsfw) continue;
        const count = client.commands.filter(c => c.category === key).size;
        categoryLines += `${meta.emoji} **${meta.name}** — ${count} command${count !== 1 ? 's' : ''}\n`;
        selectMenu.addOptions(
            new StringSelectMenuOptionBuilder()
                .setLabel(`${meta.name} Commands`)
                .setDescription(meta.description)
                .setValue(key)
                .setEmoji(meta.emoji)
        );
    }

    return new ContainerBuilder()
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
        .addSeparatorComponents(new SeparatorBuilder().setSpacing(SeparatorSpacingSize.Small).setDivider(false))
        .addTextDisplayComponents(
            new TextDisplayBuilder().setContent(`Welcome to **Celestia**! Browse categories:\n\n${categoryLines}`)
        )
        .addSeparatorComponents(new SeparatorBuilder().setSpacing(SeparatorSpacingSize.Small).setDivider(true))
        .addActionRowComponents(new ActionRowBuilder().addComponents(selectMenu))
        .addSeparatorComponents(new SeparatorBuilder().setSpacing(SeparatorSpacingSize.Small).setDivider(false))
        .addTextDisplayComponents(
            new TextDisplayBuilder().setContent(`-# 💡 Use \`/help <category>\` or the menu above  •  ${client.commands.size} total commands`)
        );
}

function buildHelpCategory(client, selected) {
    const meta = HELP_CATEGORIES[selected];
    const seen = new Set();
    let cmdList = '';
    client.commands.filter(cmd => cmd.category === selected).forEach(cmd => {
        if (!cmd.data || seen.has(cmd.data.name)) return;
        seen.add(cmd.data.name);
        cmdList += `\`/${cmd.data.name}\` — ${cmd.data.description || 'No description'}\n`;
    });

    return new ContainerBuilder()
        .setAccentColor(meta.color)
        .addTextDisplayComponents(
            new TextDisplayBuilder().setContent(`## ${meta.emoji}  ${meta.name} Commands`)
        )
        .addSeparatorComponents(new SeparatorBuilder().setSpacing(SeparatorSpacingSize.Small).setDivider(false))
        .addTextDisplayComponents(new TextDisplayBuilder().setContent(`*${meta.description}*`))
        .addSeparatorComponents(new SeparatorBuilder().setSpacing(SeparatorSpacingSize.Small).setDivider(true))
        .addTextDisplayComponents(new TextDisplayBuilder().setContent(cmdList || '> *No commands available.*'))
        .addSeparatorComponents(new SeparatorBuilder().setSpacing(SeparatorSpacingSize.Small).setDivider(false))
        .addActionRowComponents(
            new ActionRowBuilder().addComponents(
                new ButtonBuilder()
                    .setCustomId('help_back')
                    .setLabel('Back to Overview')
                    .setStyle(ButtonStyle.Secondary)
                    .setEmoji('↩️')
            )
        )
        .addSeparatorComponents(new SeparatorBuilder().setSpacing(SeparatorSpacingSize.Small).setDivider(false))
        .addTextDisplayComponents(
            new TextDisplayBuilder().setContent(`-# Use the button above to return to the overview`)
        );
}



module.exports = {
    name: Events.InteractionCreate,
    async execute(interaction, client) {

        
        if (interaction.isChatInputCommand()) {
            const command = client.commands.get(interaction.commandName);
            if (!command) return;
            try {
                await command.execute(interaction, client);
            } catch (error) {
                console.error(error);
                const errMsg = { content: '> ❌ There was an error executing this command!', flags: MessageFlags.Ephemeral };
                if (interaction.replied || interaction.deferred) {
                    await interaction.followUp(errMsg).catch(() => { });
                } else {
                    await interaction.reply(errMsg).catch(() => { });
                }
            }
            return;
        }

        
        if (interaction.isStringSelectMenu()) {
            if (interaction.customId === 'help_category_select') {
                await interaction.deferUpdate().catch(() => { });
                const selected = interaction.values[0];
                if (!HELP_CATEGORIES[selected]) return;
                const container = buildHelpCategory(client, selected);
                await interaction.editReply({ components: [container], flags: MessageFlags.IsComponentsV2 }).catch(console.error);
                return;
            }
            await interaction.deferUpdate().catch(() => { });
            return;
        }

        
        if (interaction.isButton()) {

            
            if (interaction.customId === 'help_back') {
                await interaction.deferUpdate().catch(() => { });
                const container = buildHelpOverview(client, interaction.member, interaction.channel);
                await interaction.editReply({ components: [container], flags: MessageFlags.IsComponentsV2 }).catch(console.error);
                return;
            }

            
            if (interaction.customId === 'ticket_info') {
                const container = new ContainerBuilder()
                    .setAccentColor(0x2ecc71)
                    .addTextDisplayComponents(
                        new TextDisplayBuilder().setContent('## ℹ️  How Tickets Work')
                    )
                    .addSeparatorComponents(new SeparatorBuilder().setSpacing(SeparatorSpacingSize.Small).setDivider(true))
                    .addTextDisplayComponents(
                        new TextDisplayBuilder().setContent(
                            `**1.** Click **Open Ticket** to create your private support channel\n` +
                            `**2.** Describe your issue clearly in the ticket channel\n` +
                            `**3.** Staff will respond as soon as possible\n` +
                            `**4.** The channel will be closed and archived when resolved\n\n` +
                            `> ⚠️ Please only open tickets for genuine issues.`
                        )
                    );
                await interaction.reply({ components: [container], flags: MessageFlags.IsComponentsV2 | MessageFlags.Ephemeral }).catch(() => { });
                return;
            }

            
            if (interaction.customId === 'open_ticket') {
                await interaction.reply({ content: '> 📩 Your ticket is being created... A staff member will be with you shortly.', flags: MessageFlags.Ephemeral }).catch(() => { });
                return;
            }

            
            if (interaction.customId.startsWith('hentai_img:')) {
                if (!interaction.channel.nsfw) return interaction.reply({ content: '> 🔞 NSFW channels only!', flags: MessageFlags.Ephemeral });
                await interaction.deferUpdate().catch(() => { });

                const hentaiCmd = require('../commands/nsfw/hentai');
                await hentaiCmd.handleImage(interaction, true);
                return;
            }

            
            if (interaction.customId.startsWith('hentai_vid:')) {
                if (!interaction.channel.nsfw) return interaction.reply({ content: '> 🔞 NSFW channels only!', flags: MessageFlags.Ephemeral });
                await interaction.deferUpdate().catch(() => { });

                const hentaiCmd = require('../commands/nsfw/hentai');
                await hentaiCmd.handleVideo(interaction, true);
                return;
            }

            
            if (interaction.customId.startsWith('porn_img:')) {
                if (!interaction.channel.nsfw) return interaction.reply({ content: '> 🔞 NSFW channels only!', flags: MessageFlags.Ephemeral });
                await interaction.deferUpdate().catch(() => { });

                const pornCmd = require('../commands/nsfw/porn');
                await pornCmd.handleImage(interaction, true);
                return;
            }

            
            if (interaction.customId.startsWith('porn_vid:')) {
                if (!interaction.channel.nsfw) return interaction.reply({ content: '> 🔞 NSFW channels only!', flags: MessageFlags.Ephemeral });
                await interaction.deferUpdate().catch(() => { });

                const pornCmd = require('../commands/nsfw/porn');
                await pornCmd.handleVideo(interaction, true);
                return;
            }

            await interaction.deferUpdate().catch(() => { });
        }
    },
};
