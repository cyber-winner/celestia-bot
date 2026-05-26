/**
 * /compare — Compare your Pokémon with another user side-by-side with Components V2.
 */
const { SlashCommandBuilder, ContainerBuilder, TextDisplayBuilder, SeparatorBuilder, SeparatorSpacingSize, MediaGalleryBuilder, MediaGalleryItemBuilder, MessageFlags } = require('discord.js');
const pokemonStore = require('../../store/pokemonStore');
const accountStore = require('../../store/accountStore');
const { COLORS, getTypeColor, getRankBadge, errorContainer } = require('../../utils/componentBuilder');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('compare')
        .setDescription('Compare your Pokémon with another user side-by-side')
        .addStringOption(opt => opt.setName('pokemon').setDescription('Name of your Pokémon').setRequired(true))
        .addUserOption(opt => opt.setName('user').setDescription('User to compare with').setRequired(true))
        .addStringOption(opt => opt.setName('target_pokemon').setDescription('Name of their Pokémon (defaults to same)').setRequired(false)),
    aliases: ['comp'],

    async execute(interaction, client, args) {
        const isInteraction = typeof interaction.isChatInputCommand === 'function' && interaction.isChatInputCommand();
        const author = isInteraction ? interaction.user : interaction.author;

        if (isInteraction) {
            try {
                if (!interaction.deferred && !interaction.replied) {
                    await interaction.deferReply({ flags: MessageFlags.IsComponentsV2 });
                }
            } catch (err) {
                console.error('[Compare Defer]', err);
            }
        }

        let opponent = null;
        let myPokemonName = null;
        let theirPokemonName = null;

        if (isInteraction) {
            myPokemonName = interaction.options.getString('pokemon');
            opponent = interaction.options.getUser('user');
            theirPokemonName = interaction.options.getString('target_pokemon') || myPokemonName;
        } else if (args && args.length > 0) {
            opponent = interaction.mentions?.users?.first();
            const nonMentions = args.filter(a => !a.startsWith('<@') && !a.endsWith('>'));
            myPokemonName = nonMentions[0];
            theirPokemonName = nonMentions[1] || myPokemonName;
        }

        if (!myPokemonName || !opponent) {
            return interaction.reply({
                components: [errorContainer('Missing Arguments', `👤 **${author.username}**: Specify a Pokémon name and a user: \`/compare pokemon:<your_pokemon> user:<@user> [target_pokemon:<their_pokemon>]\` or \`!compare <your_pokemon> @user [their_pokemon]\``)],
                flags: MessageFlags.IsComponentsV2,
            });
        }

        const myId = await accountStore.resolveUserId(author.id);
        const theirId = await accountStore.resolveUserId(opponent.id);

        const p1 = await pokemonStore.getPokemonDetails(myId, myPokemonName);
        const p2 = await pokemonStore.getPokemonDetails(theirId, theirPokemonName);

        if (!p1) {
            return interaction.reply({
                components: [errorContainer('Not Owned', `👤 **${author.username}**: You don't own **${myPokemonName}**!`)],
                flags: MessageFlags.IsComponentsV2,
            });
        }

        if (!p2) {
            return interaction.reply({
                components: [errorContainer('Not Owned', `👤 **${author.username}**: **${opponent.username}** doesn't own **${theirPokemonName}**!`)],
                flags: MessageFlags.IsComponentsV2,
            });
        }

        const { SectionBuilder, ThumbnailBuilder } = require('discord.js');

        const section = new SectionBuilder();
        section.addTextDisplayComponents(
            new TextDisplayBuilder().setContent(
                `👤 **${author.username}** vs **${opponent.username}**`
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
        
        const total1 = (bs1.hp || 0) + (bs1.atk || 0) + (bs1.def || 0) + (bs1.spAtk || 0) + (bs1.spDef || 0) + (bs1.speed || 0);
        const total2 = (bs2.hp || 0) + (bs2.atk || 0) + (bs2.def || 0) + (bs2.spAtk || 0) + (bs2.spDef || 0) + (bs2.speed || 0);

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
            `${stat('SPD ', bs1.speed, bs2.speed)}\n` +
            `${stat('BST ', total1, total2)}\n\n` +
            `🗂️ **Owned:** ×${p1.count} **vs** ×${p2.count}`
        ));

        await interaction.reply({ components: [container], flags: MessageFlags.IsComponentsV2 });
    },
};
