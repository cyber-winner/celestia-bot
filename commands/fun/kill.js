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

const KILL_MESSAGES = [
    '**%sender%** _obliterated_ **%target%** _from existence!_ 💀',
    '**%sender%** _sent_ **%target%** _to the shadow realm!_ ⚰️',
    '**%target%** _was eliminated by_ **%sender%**! 🗡️',
    '**%sender%** _used_ **FATALITY** _on_ **%target%**! 💥',
    '**%target%** _was no match for_ **%sender%**! ☠️',
    '**%sender%** _deleted_ **%target%** _from the server!_ 🔫',
    '**%target%** _got absolutely destroyed by_ **%sender%**! 💣',
    '**%sender%** _ended_ **%target%**\'s _whole career!_ 🪦',
    '**%target%** _was sent to meet their ancestors by_ **%sender%**! ⚔️',
    '**%sender%** _used kamehameha on_ **%target%**! 🌊',
];

module.exports = {
    category: 'fun',
    data: new SlashCommandBuilder()
        .setName('kill')
        .setDescription('Eliminate someone! Usage: /kill @user')
        .addUserOption(opt => opt.setName('user').setDescription('The user to eliminate').setRequired(true)),
    aliases: ['murder', 'eliminate'],
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

        if (!target) {
            return interaction.reply({
                content: '> ❌ Mention someone to eliminate: `!kill @user`',
                flags: MessageFlags.Ephemeral
            });
        }

        const senderName = author.displayName || author.username;
        const targetName = target.displayName || target.username;

        let killMsg = '';
        if (author.id === target.id) {
            killMsg = `☠️ **${senderName}** _eliminated themselves!_ 💀`;
        } else {
            killMsg = KILL_MESSAGES[Math.floor(Math.random() * KILL_MESSAGES.length)]
                .replace(/%sender%/g, senderName)
                .replace(/%target%/g, targetName);
        }

        if (isInteraction) {
            await interaction.deferReply();
        }

        try {
            const res = await axios.get('https://nekos.best/api/v2/kick');
            const gif = res.data.results[0];

            const container = new ContainerBuilder()
                .setAccentColor(0xff6b8a)
                .addTextDisplayComponents(
                    new TextDisplayBuilder().setContent('# 💀 Fatality!')
                )
                .addSeparatorComponents(
                    new SeparatorBuilder().setSpacing(SeparatorSpacingSize.Small).setDivider(true)
                )
                .addSectionComponents(
                    new SectionBuilder()
                        .addTextDisplayComponents(new TextDisplayBuilder().setContent(killMsg))
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
                await interaction.editReply({ content: `> ${killMsg}` });
            } else {
                await interaction.reply({ content: `> ${killMsg}` });
            }
        }
    },
};
