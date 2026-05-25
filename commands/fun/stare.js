const {
    SlashCommandBuilder,
    ContainerBuilder,
    TextDisplayBuilder,
    MessageFlags,
    MediaGalleryBuilder,
    MediaGalleryItemBuilder,
    SeparatorBuilder,
    SeparatorSpacingSize,
    SectionBuilder,
    ThumbnailBuilder
} = require('discord.js');
const axios = require('axios');

const PHRASES = [
    "👁️ {s} is staring deeply into your soul...",
    "👀 {s} refuses to blink. The staring contest has begun.",
    "😶 {s} just stands there, silently staring..."
];

module.exports = {
    category: 'fun',
    data: new SlashCommandBuilder()
        .setName('stare')
        .setDescription('Express yourself! Usage: -stare')
        .addUserOption(opt => opt.setName('user').setDescription('The user to target').setRequired(false)),
    aliases: [],
    async execute(interaction, client, args) {
        const isInteraction = typeof interaction.isChatInputCommand === 'function' && interaction.isChatInputCommand();
        const author = isInteraction ? interaction.user : interaction.author;

        let target = null;
        if (isInteraction) {
            target = interaction.options.getUser('user');
        } else if (args && args.length > 0) {
            const rawId = args[0].replace(/[<@!>]/g, '');
            target = client.users.cache.get(rawId);
        }

        const senderName = author.displayName || author.username;
        const targetName = target ? (target.displayName || target.username) : '';

        let phrase = PHRASES[Math.floor(Math.random() * PHRASES.length)];
        phrase = phrase.replace(/\{s\}/g, `**${senderName}**`);
        if (targetName) {
            phrase = phrase.replace(/\{t\}/g, `**${targetName}**`);
        } else {
            phrase = phrase.replace(/\{t\}/g, 'someone');
        }

        if (isInteraction) {
            await interaction.deferReply();
        }

        try {
            const res = await axios.get('https://nekos.best/api/v2/stare');
            const gif = res.data.results[0];

            const container = new ContainerBuilder()
                .setAccentColor(0xff6b8a)
                .addTextDisplayComponents(
                    new TextDisplayBuilder().setContent('# 👀 Stare!')
                )
                .addSeparatorComponents(
                    new SeparatorBuilder().setSpacing(SeparatorSpacingSize.Small).setDivider(true)
                );

            if (target) {
                container.addSectionComponents(
                    new SectionBuilder()
                        .addTextDisplayComponents(new TextDisplayBuilder().setContent(phrase))
                        .setThumbnailAccessory(
                            new ThumbnailBuilder().setURL(target.displayAvatarURL({ size: 64 }))
                        )
                );
            } else {
                container.addTextDisplayComponents(
                    new TextDisplayBuilder().setContent(phrase)
                );
            }

            container.addSeparatorComponents(
                new SeparatorBuilder().setSpacing(SeparatorSpacingSize.Small).setDivider(true)
            )
            .addMediaGalleryComponents(
                new MediaGalleryBuilder().addItems(
                    new MediaGalleryItemBuilder().setURL(gif.url)
                )
            )
            .addSeparatorComponents(
                new SeparatorBuilder().setSpacing(SeparatorSpacingSize.Small).setDivider(true)
            )
            .addTextDisplayComponents(
                new TextDisplayBuilder().setContent(`-# 🎬 Anime: *${gif.anime_name || 'Unknown'}*`)
            );

            if (isInteraction) {
                await interaction.editReply({
                    components: [container],
                    flags: MessageFlags.IsComponentsV2
                });
            } else {
                await interaction.reply({
                    components: [container],
                    flags: MessageFlags.IsComponentsV2
                });
            }
        } catch (err) {
            console.error(err);
            if (isInteraction) {
                await interaction.editReply({ content: `> ${phrase}` });
            } else {
                await interaction.reply({ content: `> ${phrase}` });
            }
        }
    },
};
