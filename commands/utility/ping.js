const {
    ContainerBuilder,
    TextDisplayBuilder,
    MessageFlags,
    SlashCommandBuilder,
    SeparatorBuilder,
    SeparatorSpacingSize,
    SectionBuilder,
    ThumbnailBuilder
} = require('discord.js');

module.exports = {
    category: 'utility',
    data: new SlashCommandBuilder()
        .setName('ping')
        .setDescription('Check the bot\'s latency and status.'),
    aliases: ['ping'],
    async execute(interaction, client) {
        
        await interaction.deferReply();

        const start = Date.now();
        const wsLatency = client.ws.ping;
        const roundtrip = Date.now() - start;

        const getLatencyEmoji = (ms) => {
            if (ms < 100) return '🟢';
            if (ms < 200) return '🟡';
            return '🔴';
        };

        const container = new ContainerBuilder()
            .setAccentColor(0x5865f2)
            .addTextDisplayComponents(
                new TextDisplayBuilder().setContent('## 🏓  Pong!')
            )
            .addSeparatorComponents(
                new SeparatorBuilder().setSpacing(SeparatorSpacingSize.Small).setDivider(false)
            )
            .addSectionComponents(
                new SectionBuilder()
                    .addTextDisplayComponents(
                        new TextDisplayBuilder().setContent(
                            `${getLatencyEmoji(roundtrip)} **Roundtrip:** \`${roundtrip}ms\`\n` +
                            `${getLatencyEmoji(wsLatency)} **WebSocket:** \`${wsLatency}ms\``
                        )
                    )
                    .setThumbnailAccessory(
                        new ThumbnailBuilder().setURL(client.user.displayAvatarURL({ size: 64 }))
                    )
            )
            .addSeparatorComponents(
                new SeparatorBuilder().setSpacing(SeparatorSpacingSize.Small).setDivider(true)
            )
            .addTextDisplayComponents(
                new TextDisplayBuilder().setContent(
                    `📡 **Status:** Online\n` +
                    `🕐 **Uptime:** <t:${Math.floor((Date.now() - client.uptime) / 1000)}:R>`
                )
            )
            .addSeparatorComponents(
                new SeparatorBuilder().setSpacing(SeparatorSpacingSize.Small).setDivider(false)
            )
            .addTextDisplayComponents(
                new TextDisplayBuilder().setContent(`-# 🤖 ${client.user.username}  •  discord.js v14`)
            );

        return await interaction.editReply({
            components: [container],
            flags: MessageFlags.IsComponentsV2
        });
    },
};
