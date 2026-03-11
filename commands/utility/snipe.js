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
const Snipe = require('../../models/Snipe');

module.exports = {
    category: 'utility',
    data: new SlashCommandBuilder()
        .setName('snipe')
        .setDescription('Shows the most recently deleted message in this channel.'),
    aliases: ['sn'],
    async execute(interaction, client) {
        if (!interaction.member.permissions.has('ManageMessages')) {
            return interaction.reply({ content: '> ❌ You need **Manage Messages** permission to use this command.', flags: MessageFlags.Ephemeral });
        }

        await interaction.deferReply();

        const snipes = await Snipe.find({
            guildId: interaction.guild.id,
            channelId: interaction.channel.id,
            type: 'DELETE'
        }).sort({ createdAt: -1 }).limit(1);

        if (!snipes.length) {
            return interaction.editReply({ content: '> 🔎 There are no recently deleted messages to snipe in this channel.', flags: MessageFlags.Ephemeral });
        }

        const snipe = snipes[0];
        const author = await client.users.fetch(snipe.authorId).catch(() => null);
        const deletedAt = Math.floor(new Date(snipe.createdAt).getTime() / 1000);

        const container = new ContainerBuilder()
            .setAccentColor(0x3498db)
            .addTextDisplayComponents(
                new TextDisplayBuilder().setContent('## 🎯  Message Sniped!')
            )
            .addSeparatorComponents(
                new SeparatorBuilder().setSpacing(SeparatorSpacingSize.Small).setDivider(false)
            )
            .addSectionComponents(
                new SectionBuilder()
                    .addTextDisplayComponents(
                        new TextDisplayBuilder().setContent(
                            `**Author:** ${author ? `${author.tag} \`(${author.id})\`` : `Unknown \`(${snipe.authorId})\``}\n` +
                            `**Deleted:** <t:${deletedAt}:R> • <t:${deletedAt}:T>`
                        )
                    )
                    .setThumbnailAccessory(
                        new ThumbnailBuilder().setURL(author?.displayAvatarURL({ size: 64 }) ?? 'https://cdn.discordapp.com/embed/avatars/0.png')
                    )
            )
            .addSeparatorComponents(
                new SeparatorBuilder().setSpacing(SeparatorSpacingSize.Small).setDivider(true)
            )
            .addTextDisplayComponents(
                new TextDisplayBuilder().setContent(
                    snipe.content
                        ? `📝 **Content:**\n> ${snipe.content.length > 1000 ? snipe.content.slice(0, 997) + '...' : snipe.content}`
                        : `> *No text content — image or embed only.*`
                )
            );

        if (snipe.attachments?.length) {
            const gallery = new MediaGalleryBuilder();
            snipe.attachments.slice(0, 4).forEach(url => {
                gallery.addItems(new MediaGalleryItemBuilder().setURL(url));
            });
            container
                .addSeparatorComponents(new SeparatorBuilder().setSpacing(SeparatorSpacingSize.Small).setDivider(false))
                .addMediaGalleryComponents(gallery);
        }

        container
            .addSeparatorComponents(new SeparatorBuilder().setSpacing(SeparatorSpacingSize.Small).setDivider(false))
            .addTextDisplayComponents(
                new TextDisplayBuilder().setContent(`-# 👀 Sniped by ${interaction.user.tag}  •  ${interaction.channel.name}`)
            );

        return await interaction.editReply({
            components: [container],
            flags: MessageFlags.IsComponentsV2
        });
    },
};
