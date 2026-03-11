const {
    SlashCommandBuilder,
    ContainerBuilder,
    TextDisplayBuilder,
    MessageFlags,
    MediaGalleryBuilder,
    MediaGalleryItemBuilder,
    SeparatorBuilder,
    SectionBuilder,
    ThumbnailBuilder,
    ActionRowBuilder,
    ButtonBuilder,
    ButtonStyle,
    EmbedBuilder
} = require('discord.js');
const nsfw = require('../../utils/nsfw-api-wrapper');


const IRL_IMAGE_CATEGORIES = [
    { name: '🔥 4K / High Quality', value: '4k' },
    { name: '😈 Gone Wild', value: 'gonewild' },
    { name: '🍑 Ass', value: 'ass' },
    { name: '🍒 Pussy', value: 'pussy' },
    { name: '🦵 Thighs', value: 'thigh' },
    { name: '👙 Panties', value: 'pantsu' },
    { name: '🍑 Anal', value: 'anal' },
    { name: '🍒 Boobs', value: 'boobs' },
    { name: '🍓 Swimsuit', value: 'swimsuit' },
    { name: '👗 Cosplay', value: 'cosplay' }
];

module.exports = {
    category: 'nsfw',
    data: new SlashCommandBuilder()
        .setName('porn')
        .setDescription('🔞 Fetch IRL porn content (images & videos)')
        .addSubcommand(sub =>
            sub.setName('image')
                .setDescription('Get random IRL porn images')
                .addStringOption(opt =>
                    opt.setName('category')
                        .setDescription('Image category')
                        .addChoices(...IRL_IMAGE_CATEGORIES)
                )
        )
        .addSubcommand(sub =>
            sub.setName('video')
                .setDescription('Search for IRL porn videos')
                .addStringOption(opt =>
                    opt.setName('query')
                        .setDescription('Search query (e.g. "milf", "teen", "blonde")')
                )
        ),

    async execute(interaction) {
        if (!interaction.channel.nsfw) {
            return interaction.reply({
                content: '> 🔞 This command can only be used in **NSFW channels**!',
                flags: MessageFlags.Ephemeral
            });
        }

        if (interaction.isChatInputCommand()) {
            await interaction.deferReply();
            const subcommand = interaction.options.getSubcommand();

            if (subcommand === 'image') {
                return this.handleImage(interaction);
            } else if (subcommand === 'video') {
                return this.handleVideo(interaction);
            }
        }
    },

    

    async handleImage(interaction, isReload = false) {
        let category = '4k';

        if (isReload) {
            category = interaction.customId.split(':')[1] || '4k';
        } else {
            category = interaction.options.getString('category') || '4k';
        }

        const result = await nsfw.getPornImage(category);

        if (!result) {
            return interaction.editReply({ content: '> ❌ No images found for this category.' });
        }

        const imageUrl = typeof result === 'string' ? result : (result.file_url || result.thumbnail);

        if (!imageUrl || !imageUrl.startsWith('http')) {
            return interaction.editReply({ content: '> ❌ Received an invalid image. Please try again.' });
        }

        const categoryLabel = IRL_IMAGE_CATEGORIES.find(c => c.value === category)?.name || category;

        const container = new ContainerBuilder()
            .setAccentColor(0xff4500)
            .addTextDisplayComponents(
                new TextDisplayBuilder().setContent(`## 🔞 IRL Porn Image`)
            )
            .addTextDisplayComponents(
                new TextDisplayBuilder().setContent(
                    `📁 **Category:** ${categoryLabel}\n` +
                    `✨ **Type:** Real Life (IRL)`
                )
            )
            .addSeparatorComponents(new SeparatorBuilder().setDivider(true))
            .addMediaGalleryComponents(
                new MediaGalleryBuilder().addItems(
                    new MediaGalleryItemBuilder().setURL(imageUrl)
                )
            )
            .addActionRowComponents(
                new ActionRowBuilder().addComponents(
                    new ButtonBuilder()
                        .setLabel('Open in Browser')
                        .setStyle(ButtonStyle.Link)
                        .setURL(imageUrl)
                        .setEmoji('🔗'),
                    new ButtonBuilder()
                        .setLabel('Another One')
                        .setStyle(ButtonStyle.Secondary)
                        .setCustomId(`porn_img:${category}`)
                        .setEmoji('🔁')
                )
            )
            .addTextDisplayComponents(
                new TextDisplayBuilder().setContent(`-# 🔞 Powered by NekoBot`)
            );

        return interaction.editReply({
            components: [container],
            flags: MessageFlags.IsComponentsV2
        });
    },

    

    async handleVideo(interaction, isReload = false) {
        let query = '';

        if (isReload) {
            query = decodeURIComponent(interaction.customId.split(':')[1] || '');
        } else {
            query = interaction.options.getString('query') || '';
        }

        const res = await nsfw.searchPornVideos(query);
        const videos = res.videos || [];

        if (videos.length === 0) {
            return interaction.editReply({ content: '> ❌ No videos found for your query.' });
        }

        const video = videos[Math.floor(Math.random() * videos.length)];

        const actionRow = new ActionRowBuilder();

        if (video.url && video.url.startsWith('http')) {
            actionRow.addComponents(
                new ButtonBuilder()
                    .setLabel('Open in Browser')
                    .setStyle(ButtonStyle.Link)
                    .setURL(video.url)
                    .setEmoji('🔗')
            );
        }

        actionRow.addComponents(
            new ButtonBuilder()
                .setLabel('Another One')
                .setStyle(ButtonStyle.Secondary)
                .setCustomId(`porn_vid:${encodeURIComponent(query)}`)
                .setEmoji('🔁')
        );

        return interaction.editReply({
            content: `🔞 **${video.title}**\n${video.url}`,
            components: [actionRow]
        });
    }
};
