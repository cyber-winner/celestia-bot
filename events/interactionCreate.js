const {
    Events,
    MessageFlags,
    ContainerBuilder,
    TextDisplayBuilder,
    SeparatorBuilder,
    SeparatorSpacingSize,
} = require('discord.js');

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

        if (interaction.isButton()) {

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
                await hentaiCmd.handleImage(interaction, true).catch(console.error);
                return;
            }

            if (interaction.customId.startsWith('hentai_vid:')) {
                if (!interaction.channel.nsfw) return interaction.reply({ content: '> 🔞 NSFW channels only!', flags: MessageFlags.Ephemeral });
                await interaction.deferUpdate().catch(() => { });
                const hentaiCmd = require('../commands/nsfw/hentai');
                await hentaiCmd.handleVideo(interaction, true).catch(console.error);
                return;
            }

            if (interaction.customId.startsWith('porn_img:')) {
                if (!interaction.channel.nsfw) return interaction.reply({ content: '> 🔞 NSFW channels only!', flags: MessageFlags.Ephemeral });
                await interaction.deferUpdate().catch(() => { });
                const pornCmd = require('../commands/nsfw/porn');
                await pornCmd.handleImage(interaction, true).catch(console.error);
                return;
            }

            if (interaction.customId.startsWith('porn_vid:')) {
                if (!interaction.channel.nsfw) return interaction.reply({ content: '> 🔞 NSFW channels only!', flags: MessageFlags.Ephemeral });
                await interaction.deferUpdate().catch(() => { });
                const pornCmd = require('../commands/nsfw/porn');
                await pornCmd.handleVideo(interaction, true).catch(console.error);
                return;
            }

            
            return;
        }

        if (interaction.isStringSelectMenu()) {
            
            return;
        }
    },
};
