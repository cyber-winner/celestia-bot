/**
 * /pokemon — View your Pokémon collection with Components V2 pagination.
 * Shows 5 Pokémon per page with detail buttons for each.
 */

const { SlashCommandBuilder, ContainerBuilder, TextDisplayBuilder, SeparatorBuilder, SeparatorSpacingSize, SectionBuilder, ButtonBuilder, ButtonStyle, ActionRowBuilder, MessageFlags, ThumbnailBuilder, MediaGalleryBuilder, MediaGalleryItemBuilder } = require('discord.js');
const pokemonStore = require('../../store/pokemonStore');
const accountStore = require('../../store/accountStore');
const { COLORS, getRankBadge, getRarityTag, getTypeColor, paginationRow, pokemonDetailContainer, errorContainer } = require('../../utils/componentBuilder');

const PER_PAGE = 5;

module.exports = {
    data: new SlashCommandBuilder()
        .setName('pokemon')
        .setDescription('View your Pokémon collection')
        .addStringOption(opt =>
            opt.setName('details')
                .setDescription('View details of a specific Pokémon')
                .setRequired(false)
        )
        .addUserOption(opt =>
            opt.setName('user')
                .setDescription('View another trainer\'s collection')
                .setRequired(false)
        ),
    aliases: ['pokedex', 'pokelist'],

    async execute(interaction, client, args) {
        const isInteraction = typeof interaction.isChatInputCommand === 'function' && interaction.isChatInputCommand();
        const author = isInteraction ? interaction.user : interaction.author;
        const targetUser = isInteraction ? (interaction.options?.getUser?.('user') || author) : (interaction.mentions?.users?.first() || author);
        const userId = await accountStore.resolveUserId(targetUser.id);
        const isSelf = targetUser.id === author.id;

        let detailName = null;
        if (isInteraction) {
            detailName = interaction.options?.getString?.('details');
        } else if (args && args.length > 0) {
            if (!args[0].startsWith('<@') && !args[0].endsWith('>')) {
                detailName = args.join(' ');
            }
        }

        // ─── Detail View ───
        if (detailName) {
            const details = await pokemonStore.getPokemonDetails(userId, detailName);
            if (!details) {
                return interaction.reply({
                    components: [errorContainer('Not Found', `${isSelf ? 'You don\'t' : `**${targetUser.username}** doesn't`} own any **${detailName}**.`)],
                    flags: MessageFlags.IsComponentsV2 | MessageFlags.Ephemeral,
                });
            }

            const container = pokemonDetailContainer(details, {
                footer: `🗂️ **Owned:** ×${details.count} · **Best Level:** ${details.bestLevel}`
            });

            return interaction.reply({
                components: [container],
                flags: MessageFlags.IsComponentsV2,
            });
        }

        // ─── Collection View ───
        const pokedex = await pokemonStore.getUserPokedex(userId);
        if (pokedex.length === 0) {
            return interaction.reply({
                components: [errorContainer('Empty Collection', `${isSelf ? 'You haven\'t' : `**${targetUser.username}** hasn't`} caught any Pokémon yet!\n\n> 💡 Pokémon spawn every 25 messages. Type \`celestia catch <name>\` to catch them!`)],
                flags: MessageFlags.IsComponentsV2 | MessageFlags.Ephemeral,
            });
        }

        const stats = await pokemonStore.getUserStats(userId);
        const totalPages = Math.ceil(pokedex.length / PER_PAGE);
        const page = 1;

        const container = buildCollectionPage(pokedex, page, totalPages, stats, targetUser, isSelf);
        const pagination = paginationRow(`pkmn_${targetUser.id}`, page, totalPages);
        const detailButtons = buildDetailButtons(pokedex, page, targetUser.id);

        const components = [container];
        if (detailButtons) components.push(detailButtons);
        components.push(pagination);

        await interaction.reply({
            components,
            flags: MessageFlags.IsComponentsV2,
        });
    },

    // Handle pagination and detail button interactions
    async handleButton(interaction) {
        const customId = interaction.customId;

        // ─── Detail Buttons ───
        if (customId.startsWith('pkdet_')) {
            const parts = customId.split('_');
            const targetUserId = parts[1];
            const pokemonName = decodeURIComponent(parts.slice(2).join('_'));
            const userId = await accountStore.resolveUserId(targetUserId);
            const details = await pokemonStore.getPokemonDetails(userId, pokemonName);

            if (!details) {
                return interaction.reply({
                    components: [errorContainer('Not Found', `That Pokémon was not found.`)],
                    flags: MessageFlags.IsComponentsV2 | MessageFlags.Ephemeral,
                });
            }

            const container = pokemonDetailContainer(details, {
                footer: `🗂️ **Owned:** ×${details.count} · **Best Level:** ${details.bestLevel}`
            });

            return interaction.reply({
                components: [container],
                flags: MessageFlags.IsComponentsV2 | MessageFlags.Ephemeral,
            });
        }

        // ─── Pagination Buttons ───
        if (customId.startsWith('pkmn_')) {
            const parts = customId.split('_');
            const action = parts[parts.length - 1];
            const targetUserId = parts[1];
            const userId = await accountStore.resolveUserId(targetUserId);

            const pokedex = await pokemonStore.getUserPokedex(userId);
            const stats = await pokemonStore.getUserStats(userId);
            const totalPages = Math.ceil(pokedex.length / PER_PAGE);

            // Parse current page from the disabled button label
            let currentPage = 1;
            const pageButton = interaction.message.components.find(c =>
                c.components?.some(b => b.customId?.endsWith('_page'))
            );
            if (pageButton) {
                const pageBtnComp = pageButton.components.find(b => b.customId?.endsWith('_page'));
                if (pageBtnComp?.label) {
                    currentPage = parseInt(pageBtnComp.label.split('/')[0].trim()) || 1;
                }
            }

            let newPage = currentPage;
            if (action === 'next') newPage = Math.min(totalPages, currentPage + 1);
            else if (action === 'prev') newPage = Math.max(1, currentPage - 1);
            else if (action === 'first') newPage = 1;
            else if (action === 'last') newPage = totalPages;

            let targetDiscordUser;
            try {
                targetDiscordUser = await interaction.client.users.fetch(targetUserId);
            } catch {
                targetDiscordUser = interaction.user;
            }
            const isSelf = targetUserId === interaction.user.id;

            const container = buildCollectionPage(pokedex, newPage, totalPages, stats, targetDiscordUser, isSelf);
            const pagination = paginationRow(`pkmn_${targetUserId}`, newPage, totalPages);
            const detailButtons = buildDetailButtons(pokedex, newPage, targetUserId);

            const components = [container];
            if (detailButtons) components.push(detailButtons);
            components.push(pagination);

            await interaction.update({
                components,
                flags: MessageFlags.IsComponentsV2,
            });
        }
    },
};

function buildCollectionPage(pokedex, page, totalPages, stats, targetUser, isSelf) {
    const start = (page - 1) * PER_PAGE;
    const pageItems = pokedex.slice(start, start + PER_PAGE);

    const container = new ContainerBuilder().setAccentColor(COLORS.CELESTIA);

    // Header
    container.addTextDisplayComponents(
        new TextDisplayBuilder().setContent(
            `## 📦 ${isSelf ? 'Your' : `${targetUser.username}'s`} Pokémon Collection\n` +
            `> 🎯 **${stats.total}** caught · **${stats.unique}** unique species`
        )
    );

    container.addSeparatorComponents(
        new SeparatorBuilder().setSpacing(SeparatorSpacingSize.Small).setDivider(true)
    );

    // Pokemon entries
    for (let i = 0; i < pageItems.length; i++) {
        const p = pageItems[i];
        const globalIdx = start + i + 1;
        const rank = getRankBadge(p.bestLevel);
        const meta = pokemonStore.pokemonMetaMap[p.name.toLowerCase()] || {};
        let rarityIcon = '';
        if (meta.isLeg) rarityIcon = ' 👑';
        else if (meta.isMyth) rarityIcon = ' ✨';

        const staticData = pokemonStore.getStaticData(p.name);
        const typeStr = staticData?.types ? staticData.types.join('/') : '';

        container.addTextDisplayComponents(
            new TextDisplayBuilder().setContent(
                `**\`${String(globalIdx).padStart(3, '0')}\`** · **${p.name}**${rarityIcon} — ×${p.count}\n` +
                `> Lv. ${p.bestLevel} ${rank}${typeStr ? ` · ${typeStr}` : ''}`
            )
        );
    }

    container.addSeparatorComponents(
        new SeparatorBuilder().setSpacing(SeparatorSpacingSize.Small).setDivider(true)
    );

    container.addTextDisplayComponents(
        new TextDisplayBuilder().setContent(
            `-# Page ${page}/${totalPages} · Use the buttons below to navigate or view details`
        )
    );

    return container;
}

function buildDetailButtons(pokedex, page, targetUserId) {
    const start = (page - 1) * PER_PAGE;
    const pageItems = pokedex.slice(start, start + PER_PAGE);
    if (pageItems.length === 0) return null;

    const row = new ActionRowBuilder();
    for (const p of pageItems) {
        const encodedName = encodeURIComponent(p.name).substring(0, 60);
        row.addComponents(
            new ButtonBuilder()
                .setCustomId(`pkdet_${targetUserId}_${encodedName}`)
                .setLabel(p.name.substring(0, 20))
                .setStyle(ButtonStyle.Secondary)
        );
    }
    return row;
}
