/**
 * Components V2 Builder Utilities — Premium UI factories for Celestia Discord Bot.
 * 
 * Provides reusable builders for consistent, beautiful Components V2 messages.
 */

const {
    ContainerBuilder,
    TextDisplayBuilder,
    SeparatorBuilder,
    SeparatorSpacingSize,
    SectionBuilder,
    MediaGalleryBuilder,
    MediaGalleryItemBuilder,
    ActionRowBuilder,
    ButtonBuilder,
    ButtonStyle,
    StringSelectMenuBuilder,
    StringSelectMenuOptionBuilder,
    MessageFlags,
    ThumbnailBuilder,
} = require('discord.js');

// ─── Color Palette ───
const COLORS = {
    PRIMARY:    0x5865f2,  // Blurple
    SUCCESS:    0x57f287,  // Green
    DANGER:     0xed4245,  // Red
    WARNING:    0xfee75c,  // Yellow
    CELESTIA:   0xb388ff,  // Lavender
    GOLD:       0xffd700,  // Gold
    POKEMON:    0xe74c3c,  // Pokémon Red
    LEGENDARY:  0xffd700,  // Gold
    MYTHICAL:   0xe91e9c,  // Pink
    COMMON:     0x95a5a6,  // Grey
    GACHA_5:    0xffd700,  // 5-star gold
    GACHA_4:    0x9b59b6,  // 4-star purple
    GACHA_3:    0x3498db,  // 3-star blue
    RAID:       0xff6b35,  // Raid orange
    ECONOMY:    0x2ecc71,  // Economy green
    CRYSTAL:    0x00d4ff,  // Crystal blue
};

// ─── Type Colors ───
const TYPE_COLORS = {
    Fire: 0xf08030, Water: 0x6890f0, Grass: 0x78c850, Electric: 0xf8d030,
    Ice: 0x98d8d8, Fighting: 0xc03028, Poison: 0xa040a0, Ground: 0xe0c068,
    Flying: 0xa890f0, Psychic: 0xf85888, Bug: 0xa8b820, Rock: 0xb8a038,
    Ghost: 0x705898, Dragon: 0x7038f8, Dark: 0x705848, Steel: 0xb8b8d0,
    Fairy: 0xee99ac, Normal: 0xa8a878,
};

/**
 * Get accent color for a Pokémon based on its primary type.
 */
function getTypeColor(types) {
    if (!types || types.length === 0) return COLORS.POKEMON;
    return TYPE_COLORS[types[0]] || COLORS.POKEMON;
}

/**
 * Get rank badge based on level.
 */
function getRankBadge(level, levelCap = 100) {
    if (!levelCap || levelCap < 100) levelCap = 100;
    const ratio = level / levelCap;
    if (ratio > 0.90) return '🔥 S-Rank';
    if (ratio > 0.80) return '⭐ A-Rank';
    if (ratio > 0.70) return '🟢 B-Rank';
    if (ratio > 0.60) return '🔵 C-Rank';
    if (ratio > 0.50) return '🟣 D-Rank';
    return '⬜ F-Rank';
}

/**
 * Get rarity tag for a Pokémon.
 */
function getRarityTag(pokemon) {
    if (pokemon.isLegendary) return '👑 LEGENDARY';
    if (pokemon.isMythical) return '✨ MYTHICAL';
    return '⬜ Common';
}

/**
 * Create an error container.
 */
function errorContainer(title, message) {
    return new ContainerBuilder()
        .setAccentColor(COLORS.DANGER)
        .addTextDisplayComponents(
            new TextDisplayBuilder().setContent(`## ❌ ${title}`)
        )
        .addSeparatorComponents(
            new SeparatorBuilder().setSpacing(SeparatorSpacingSize.Small).setDivider(true)
        )
        .addTextDisplayComponents(
            new TextDisplayBuilder().setContent(message)
        );
}

/**
 * Create a success container.
 */
function successContainer(title, message) {
    return new ContainerBuilder()
        .setAccentColor(COLORS.SUCCESS)
        .addTextDisplayComponents(
            new TextDisplayBuilder().setContent(`## ✅ ${title}`)
        )
        .addSeparatorComponents(
            new SeparatorBuilder().setSpacing(SeparatorSpacingSize.Small).setDivider(true)
        )
        .addTextDisplayComponents(
            new TextDisplayBuilder().setContent(message)
        );
}

/**
 * Create a cooldown container.
 */
function cooldownContainer(title, remaining) {
    return new ContainerBuilder()
        .setAccentColor(COLORS.WARNING)
        .addTextDisplayComponents(
            new TextDisplayBuilder().setContent(`## ⏳ ${title}`)
        )
        .addSeparatorComponents(
            new SeparatorBuilder().setSpacing(SeparatorSpacingSize.Small).setDivider(true)
        )
        .addTextDisplayComponents(
            new TextDisplayBuilder().setContent(remaining)
        );
}

/**
 * Build pagination buttons.
 */
function paginationRow(prefix, currentPage, totalPages, extraButtons = []) {
    const row = new ActionRowBuilder();

    row.addComponents(
        new ButtonBuilder()
            .setCustomId(`${prefix}_first`)
            .setEmoji('⏮')
            .setStyle(ButtonStyle.Secondary)
            .setDisabled(currentPage <= 1)
    );

    row.addComponents(
        new ButtonBuilder()
            .setCustomId(`${prefix}_prev`)
            .setEmoji('◀')
            .setStyle(ButtonStyle.Primary)
            .setDisabled(currentPage <= 1)
    );

    row.addComponents(
        new ButtonBuilder()
            .setCustomId(`${prefix}_page`)
            .setLabel(`${currentPage} / ${totalPages}`)
            .setStyle(ButtonStyle.Secondary)
            .setDisabled(true)
    );

    row.addComponents(
        new ButtonBuilder()
            .setCustomId(`${prefix}_next`)
            .setEmoji('▶')
            .setStyle(ButtonStyle.Primary)
            .setDisabled(currentPage >= totalPages)
    );

    row.addComponents(
        new ButtonBuilder()
            .setCustomId(`${prefix}_last`)
            .setEmoji('⏭')
            .setStyle(ButtonStyle.Secondary)
            .setDisabled(currentPage >= totalPages)
    );

    return row;
}

/**
 * Build a Pokémon details container with card image.
 */
function pokemonDetailContainer(pokemon, extra = {}) {
    const types = (pokemon.types || []).join(' / ') || 'Unknown';
    const rankBadge = getRankBadge(pokemon.level || pokemon.bestLevel || 0, extra.levelCap);
    const rarityTag = getRarityTag(pokemon);
    const color = getTypeColor(pokemon.types);

    const container = new ContainerBuilder().setAccentColor(color);

    if (extra.header) {
        container.addTextDisplayComponents(
            new TextDisplayBuilder().setContent(extra.header)
        );
        container.addSeparatorComponents(
            new SeparatorBuilder().setSpacing(SeparatorSpacingSize.Small).setDivider(true)
        );
    }

    // Title
    container.addTextDisplayComponents(
        new TextDisplayBuilder().setContent(`## ${pokemon.name}`)
    );

    // Card image
    if (pokemon.cardImage) {
        container.addMediaGalleryComponents(
            new MediaGalleryBuilder().addItems(
                new MediaGalleryItemBuilder().setURL(pokemon.cardImage)
            )
        );
    }

    container.addSeparatorComponents(
        new SeparatorBuilder().setSpacing(SeparatorSpacingSize.Small).setDivider(true)
    );

    // Stats
    let statsText = '';
    statsText += `📊 **Level:** ${pokemon.level || pokemon.bestLevel || '??'} — ${rankBadge}\n`;
    statsText += `⭐ **Rarity:** ${rarityTag}\n`;
    statsText += `🔖 **Type:** ${types}\n`;
    if (pokemon.hp) statsText += `❤️ **HP:** ${pokemon.hp}\n`;
    if (pokemon.dexId) statsText += `📖 **Dex #** ${pokemon.dexId}\n`;

    if (pokemon.baseStats) {
        const bs = pokemon.baseStats;
        statsText += `\n**Base Stats:**\n`;
        statsText += `> ATK: \`${bs.atk || '??'}\` · DEF: \`${bs.def || '??'}\` · SPD: \`${bs.speed || '??'}\`\n`;
        statsText += `> SP.ATK: \`${bs.spAtk || '??'}\` · SP.DEF: \`${bs.spDef || '??'}\` · HP: \`${bs.hp || '??'}\`\n`;
    }

    if (pokemon.description) {
        statsText += `\n> *${pokemon.description.substring(0, 200)}*`;
    }

    container.addTextDisplayComponents(
        new TextDisplayBuilder().setContent(statsText)
    );

    if (extra.footer) {
        container.addSeparatorComponents(
            new SeparatorBuilder().setSpacing(SeparatorSpacingSize.Small).setDivider(true)
        );
        container.addTextDisplayComponents(
            new TextDisplayBuilder().setContent(extra.footer)
        );
    }

    return container;
}

// ─── Emojis ───
const EMOJIS = {
    POKEBALL: '<:Pokemon:1508753880782209085>',
    CANDLE: '<a:candle:1508754473680502855>',
    COIN: '<:pokecoins:1508755286784086037>',
    CRYSTAL: '<:Crystal:1508755711348445214>',
    ORB: '<a:crystal:1508755858211864596>',
    RAIDPASS: '<a:RaidPasses:1508756029259911239>',
    COMPASS: '<:compass:1508756257840824340>',
};

module.exports = {
    COLORS,
    TYPE_COLORS,
    EMOJIS,
    getTypeColor,
    getRankBadge,
    getRarityTag,
    errorContainer,
    successContainer,
    cooldownContainer,
    paginationRow,
    pokemonDetailContainer,
};
