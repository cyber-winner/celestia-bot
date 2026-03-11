const {
    SlashCommandBuilder,
    ContainerBuilder,
    TextDisplayBuilder,
    MessageFlags,
    MediaGalleryBuilder,
    MediaGalleryItemBuilder,
    SeparatorBuilder,
    ActionRowBuilder,
    ButtonBuilder,
    ButtonStyle,
    EmbedBuilder
} = require('discord.js');
const nsfw = require('../../utils/nsfw-api-wrapper');



const NEKOBOT_CATEGORIES = [
    { name: '🔥 Hentai', value: 'hentai' },
    { name: '🍑 Ass', value: 'hass' },
    { name: '🍒 Boobs', value: 'hboobs' },
    { name: '🦵 Thighs', value: 'hthigh' },
    { name: '🍑 Anal', value: 'hanal' },
    { name: '🌸 Paizuri', value: 'paizuri' },
    { name: '� Tentacle', value: 'tentacle' },
    { name: '🐱 Neko', value: 'hneko' },
    { name: '🦊 Kitsune', value: 'hkitsune' },
    { name: '✨ Midriff', value: 'hmidriff' }
];


const WAIFUPICS_CATEGORIES = [
    { name: '🌸 Waifu', value: 'waifu' },
    { name: '🐱 Neko', value: 'neko' },
    { name: '� Trap', value: 'trap' },
    { name: '👅 Blowjob', value: 'blowjob' }
];


const ALL_IMAGE_CHOICES = [
    ...NEKOBOT_CATEGORIES,
    ...WAIFUPICS_CATEGORIES.map(c => ({ ...c, name: c.name + ' (GIF)' }))
];


const CATEGORY_SOURCE_MAP = {};
NEKOBOT_CATEGORIES.forEach(c => CATEGORY_SOURCE_MAP[c.value] = 'nekobot');
WAIFUPICS_CATEGORIES.forEach(c => CATEGORY_SOURCE_MAP[c.value] = 'waifupics');

module.exports = {
    category: 'nsfw',
    data: new SlashCommandBuilder()
        .setName('hentai')
        .setDescription('🔞 Fetch hentai content (images & videos)')
        .addSubcommand(sub =>
            sub.setName('image')
                .setDescription('Get random hentai images')
                .addStringOption(opt =>
                    opt.setName('category')
                        .setDescription('Image category')
                        .addChoices(...ALL_IMAGE_CHOICES)
                )
        )
        .addSubcommand(sub =>
            sub.setName('video')
                .setDescription('Browse hentai videos from Hanime')
                .addStringOption(opt =>
                    opt.setName('search')
                        .setDescription('Search query (e.g. "maid", "school")')
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
        let category = 'hentai';

        if (isReload) {
            const parts = interaction.customId.split(':');
            category = decodeURIComponent(parts[1] || 'hentai');
        } else {
            category = interaction.options.getString('category') || 'hentai';
        }

        
        const source = CATEGORY_SOURCE_MAP[category] || 'nekobot';
        const result = await nsfw.getHentaiImage(source, category);

        if (!result) {
            return interaction.editReply({ content: '> ❌ No hentai images found. Try a different category.' });
        }

        const imageUrl = typeof result === 'string' ? result : result;

        if (!imageUrl || !imageUrl.startsWith('http')) {
            return interaction.editReply({ content: '> ❌ Received an invalid image. Please try again.' });
        }

        const categoryLabel = ALL_IMAGE_CHOICES.find(c => c.value === category)?.name || category;
        const sourceName = source === 'waifupics' ? 'waifu.pics' : 'NekoBot';

        const container = new ContainerBuilder()
            .setAccentColor(0xff69b4)
            .addTextDisplayComponents(
                new TextDisplayBuilder().setContent(`## 🔞 Hentai Image`)
            )
            .addTextDisplayComponents(
                new TextDisplayBuilder().setContent(
                    `🎨 **Source:** ${sourceName}\n` +
                    `🏷️ **Category:** ${categoryLabel}`
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
                        .setCustomId(`hentai_img:${encodeURIComponent(category)}`)
                        .setEmoji('🔁')
                )
            )
            .addTextDisplayComponents(
                new TextDisplayBuilder().setContent(`-# 🔞 Powered by ${sourceName}`)
            );

        return interaction.editReply({
            components: [container],
            flags: MessageFlags.IsComponentsV2
        });
    },

    

    async handleVideo(interaction, isReload = false) {
        let query = '';

        if (isReload) {
            const parts = interaction.customId.split(':');
            query = decodeURIComponent(parts[1] || '');
        } else {
            query = interaction.options.getString('search') || '';
        }

        const res = await nsfw.searchHentaiVideos(query);
        const videos = res.results || [];

        if (videos.length === 0) {
            return interaction.editReply({ content: '> ❌ No hentai videos found. Try a different search.' });
        }

        const video = videos[Math.floor(Math.random() * videos.length)];
        const title = video.name || 'Untitled';
        const videoUrl = video.video_url || '';

        const actionRow = new ActionRowBuilder();

        if (videoUrl) {
            actionRow.addComponents(
                new ButtonBuilder()
                    .setLabel('Open in Browser')
                    .setStyle(ButtonStyle.Link)
                    .setURL(videoUrl)
                    .setEmoji('🔗')
            );
        }

        actionRow.addComponents(
            new ButtonBuilder()
                .setLabel('Another One')
                .setStyle(ButtonStyle.Secondary)
                .setCustomId(`hentai_vid:${encodeURIComponent(query)}`)
                .setEmoji('🔁')
        );

        try {
            return await interaction.editReply({
                content: `🔞 **${title}**`,
                files: [{ attachment: videoUrl, name: 'video.mp4' }],
                components: [actionRow]
            });
        } catch (err) {
            console.error('[Hentai Video] Attachment failed, falling back to URL:', err.message);
            
            return interaction.editReply({
                content: `🔞 **${title}**\n${videoUrl}`,
                components: [actionRow]
            });
        }
    }
};
