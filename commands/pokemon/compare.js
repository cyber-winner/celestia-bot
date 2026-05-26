/**
 * /compare — Compare two Pokémon side-by-side with Components V2.
 */
const { SlashCommandBuilder, ContainerBuilder, TextDisplayBuilder, SeparatorBuilder, SeparatorSpacingSize, MediaGalleryBuilder, MediaGalleryItemBuilder, MessageFlags } = require('discord.js');
const pokemonStore = require('../../store/pokemonStore');
const accountStore = require('../../store/accountStore');
const { COLORS, getTypeColor, getRankBadge, errorContainer } = require('../../utils/componentBuilder');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('compare')
        .setDescription('Compare two Pokémon side-by-side')
        .addStringOption(opt => opt.setName('pokemon1').setDescription('First Pokémon').setRequired(true))
        .addStringOption(opt => opt.setName('pokemon2').setDescription('Second Pokémon').setRequired(true)),
    aliases: [],

    async execute(interaction, client, args) {
        const isInteraction = typeof interaction.isChatInputCommand === 'function' && interaction.isChatInputCommand();
        const author = isInteraction ? interaction.user : interaction.author;
        const name1 = isInteraction ? interaction.options.getString('pokemon1') : args?.[0];
        const name2 = isInteraction ? interaction.options.getString('pokemon2') : args?.[1];

        if (!name1 || !name2) {
            return interaction.reply({
                components: [errorContainer('Missing Pokémon', 'Specify two Pokémon to compare: `!compare <pokemon1> <pokemon2>`')],
                flags: MessageFlags.IsComponentsV2 | MessageFlags.Ephemeral,
            });
        }

        const userId = await accountStore.resolveUserId(author.id);

        const p1 = await pokemonStore.getPokemonDetails(userId, name1);
        const p2 = await pokemonStore.getPokemonDetails(userId, name2);

        if (!p1 || !p2) {
            const missing = !p1 ? name1 : name2;
            return interaction.reply({
                components: [errorContainer('Not Found', `You don't own **${missing}**!`)],
                flags: MessageFlags.IsComponentsV2 | MessageFlags.Ephemeral,
            });
        }

        const { SectionBuilder, ThumbnailBuilder } = require('discord.js');

        const section = new SectionBuilder();
        section.addTextDisplayComponents(
            new TextDisplayBuilder().setContent(
                `👤 **Trainer:** ${author.username}\n\n` +
                `**${p1.name}** vs **${p2.name}**`
            )
        );
        section.setThumbnailAccessory(new ThumbnailBuilder().setURL(author.displayAvatarURL({ size: 128 })));

        const container = new ContainerBuilder().setAccentColor(COLORS.PRIMARY);
        container.addTextDisplayComponents(new TextDisplayBuilder().setContent(
            `## ⚔️ Pokémon Comparison`
        ));
        container.addSeparatorComponents(new SeparatorBuilder().setSpacing(SeparatorSpacingSize.Small).setDivider(true));
        container.addSectionComponents(section);

        // Show both card images
        const images = [];
        if (p1.cardImage) images.push(new MediaGalleryItemBuilder().setURL(p1.cardImage));
        if (p2.cardImage) images.push(new MediaGalleryItemBuilder().setURL(p2.cardImage));
        if (images.length > 0) {
            const gallery = new MediaGalleryBuilder();
            images.forEach(img => gallery.addItems(img));
            container.addMediaGalleryComponents(gallery);
        }

        container.addSeparatorComponents(new SeparatorBuilder().setSpacing(SeparatorSpacingSize.Small).setDivider(true));

        // Stats comparison
        const bs1 = p1.baseStats || {};
        const bs2 = p2.baseStats || {};
        const stat = (name, v1, v2) => {
            const icon = v1 > v2 ? '🟢' : v1 < v2 ? '<:Pokemon:1508753880782209085>' : '⬜';
            const icon2 = v2 > v1 ? '🟢' : v2 < v1 ? '<:Pokemon:1508753880782209085>' : '⬜';
            return `> ${icon} \`${String(v1 || '??').padStart(3)}\` **${name}** \`${String(v2 || '??').padStart(3)}\` ${icon2}`;
        };

        container.addTextDisplayComponents(new TextDisplayBuilder().setContent(
            `> **Lv.** \`${p1.bestLevel}\` — ${getRankBadge(p1.bestLevel)} **vs** Lv. \`${p2.bestLevel}\` — ${getRankBadge(p2.bestLevel)}\n` +
            `> **Type:** ${(p1.types || []).join('/')} **vs** ${(p2.types || []).join('/')}\n\n` +
            `### Base Stats\n` +
            `${stat('HP  ', bs1.hp, bs2.hp)}\n` +
            `${stat('ATK ', bs1.atk, bs2.atk)}\n` +
            `${stat('DEF ', bs1.def, bs2.def)}\n` +
            `${stat('SATK', bs1.spAtk, bs2.spAtk)}\n` +
            `${stat('SDEF', bs1.spDef, bs2.spDef)}\n` +
            `${stat('SPD ', bs1.speed, bs2.speed)}\n\n` +
            `🗂️ **Owned:** ×${p1.count} **vs** ×${p2.count}`
        ));

        await interaction.reply({ components: [container], flags: MessageFlags.IsComponentsV2 });
    },
};
