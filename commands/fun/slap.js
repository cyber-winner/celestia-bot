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

module.exports = {
    category: 'fun',
    data: new SlashCommandBuilder()
        .setName('slap')
        .setDescription('Slap someone!')
        .addUserOption(opt => opt.setName('user').setDescription('The user to slap').setRequired(true)),
    aliases: ['slap'],
    async execute(interaction, client, args) {
        const isInteraction = interaction.isChatInputCommand?.() || false;
        const target = isInteraction ? interaction.options.getUser('user') : client.users.cache.get(args[0]?.replace(/[<@!>]/g, ''));
        const user = isInteraction ? interaction.user : interaction.author;

        if (!target) return interaction.reply({ content: '> ❌ Please mention a valid user to slap!', flags: MessageFlags.Ephemeral });

        await interaction.deferReply();

        try {
            const res = await axios.get('https://nekos.best/api/v2/slap');
            const gif = res.data.results[0];

            const container = new ContainerBuilder()
                .setAccentColor(0xff4444)
                .addTextDisplayComponents(
                    new TextDisplayBuilder().setContent('## 💢  Slap!')
                )
                .addSeparatorComponents(
                    new SeparatorBuilder().setSpacing(SeparatorSpacingSize.Small).setDivider(false)
                )
                .addSectionComponents(
                    new SectionBuilder()
                        .addTextDisplayComponents(
                            new TextDisplayBuilder().setContent(
                                `🔴 **${user.displayName}** slapped **${target.displayName}**!\n\n` +
                                `> *Ouch! That's gonna leave a mark!* 😤`
                            )
                        )
                        .setThumbnailAccessory(
                            new ThumbnailBuilder().setURL(target.displayAvatarURL({ size: 64 }))
                        )
                )
                .addSeparatorComponents(
                    new SeparatorBuilder().setSpacing(SeparatorSpacingSize.Small).setDivider(true)
                )
                .addMediaGalleryComponents(
                    new MediaGalleryBuilder().addItems(
                        new MediaGalleryItemBuilder().setURL(gif.url)
                    )
                )
                .addSeparatorComponents(
                    new SeparatorBuilder().setSpacing(SeparatorSpacingSize.Small).setDivider(false)
                )
                .addTextDisplayComponents(
                    new TextDisplayBuilder().setContent(`-# 🎬 Anime: *${gif.anime_name}*`)
                );

            return await interaction.editReply({
                components: [container],
                flags: MessageFlags.IsComponentsV2
            });
        } catch (err) {
            console.error(err);
            interaction.editReply({ content: '> ❌ Could not fetch a slap gif. Try again!' });
        }
    },
};
