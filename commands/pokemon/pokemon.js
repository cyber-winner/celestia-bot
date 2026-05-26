/**
 * /pokemon — View your Pokémon collection, details, sell, or buy Pokémon.
 */
const { SlashCommandBuilder, ContainerBuilder, TextDisplayBuilder, SeparatorBuilder, SeparatorSpacingSize, SectionBuilder, ButtonBuilder, ButtonStyle, ActionRowBuilder, MessageFlags, ThumbnailBuilder, MediaGalleryBuilder, MediaGalleryItemBuilder } = require('discord.js');
const pokemonStore = require('../../store/pokemonStore');
const accountStore = require('../../store/accountStore');
const economyStore = require('../../store/economyStore');
const { COLORS, getRankBadge, getRarityTag, getTypeColor, paginationRow, pokemonDetailContainer, errorContainer, successContainer } = require('../../utils/componentBuilder');

const PER_PAGE = 5;

module.exports = {
    data: new SlashCommandBuilder()
        .setName('pokemon')
        .setDescription('Pokémon commands: list collection, details, sell, or buy')
        .addStringOption(opt =>
            opt.setName('action')
                .setDescription('Select action')
                .setRequired(false)
                .addChoices(
                    { name: 'list', value: 'list' },
                    { name: 'details', value: 'details' },
                    { name: 'sell', value: 'sell' },
                    { name: 'buy', value: 'buy' },
                    { name: 'market', value: 'market' }
                )
        )
        .addStringOption(opt =>
            opt.setName('pokemon_name')
                .setDescription('Pokémon name (for details, sell, or buy)')
                .setRequired(false)
        )
        .addUserOption(opt =>
            opt.setName('user')
                .setDescription('Target trainer (for list, details, or buy)')
                .setRequired(false)
        )
        .addIntegerOption(opt =>
            opt.setName('price')
                .setDescription('Price to list Pokémon for (for sell)')
                .setRequired(false)
        ),
    aliases: ['pokedex', 'pokelist'],

    async execute(interaction, client, args) {
        const isInteraction = typeof interaction.isChatInputCommand === 'function' && interaction.isChatInputCommand();
        const author = isInteraction ? interaction.user : interaction.author;

        let action = 'list';
        let targetUser = author;
        let pokemonName = null;
        let price = null;

        if (isInteraction) {
            action = interaction.options.getString('action') || 'list';
            targetUser = interaction.options.getUser('user') || author;
            pokemonName = interaction.options.getString('pokemon_name');
            price = interaction.options.getInteger('price');

            // Compatibility: if no action is chosen but pokemon_name is given, default to details
            if (!interaction.options.getString('action') && pokemonName) {
                action = 'details';
            }
        } else if (args && args.length > 0) {
            const firstArg = args[0].toLowerCase();
            if (['sell', 'buy', 'list', 'details', 'detail', 'info', 'market'].includes(firstArg)) {
                action = firstArg;
                if (action === 'detail' || action === 'info') action = 'details';

                if (action === 'sell') {
                    if (args.length >= 3) {
                        price = parseInt(args[1]);
                        pokemonName = args.slice(2).join(' ').trim();
                    }
                } else if (action === 'buy') {
                    targetUser = interaction.mentions?.users?.first() || author;
                    const cleanArgs = args.slice(1).filter(a => !a.startsWith('<@') && !a.endsWith('>'));
                    pokemonName = cleanArgs.join(' ').trim();
                } else if (action === 'details') {
                    targetUser = interaction.mentions?.users?.first() || author;
                    const cleanArgs = args.slice(1).filter(a => !a.startsWith('<@') && !a.endsWith('>'));
                    pokemonName = cleanArgs.join(' ').trim();
                } else if (action === 'list') {
                    targetUser = interaction.mentions?.users?.first() || author;
                }
            } else {
                // If it starts with user mention, list that user's collection
                if (interaction.mentions?.users?.first()) {
                    targetUser = interaction.mentions.users.first();
                    action = 'list';
                } else {
                    // Otherwise default to details of that name
                    action = 'details';
                    pokemonName = args.join(' ').trim();
                }
            }
        }

        const userId = await accountStore.resolveUserId(targetUser.id);
        const authorId = await accountStore.resolveUserId(author.id);
        const isSelf = targetUser.id === author.id;

        // ─── Case 1: Sell Command ───
        if (action === 'sell') {
            if (!pokemonName || !price || isNaN(price) || price <= 0) {
                return interaction.reply({
                    components: [errorContainer('Invalid Command', 'Usage: `/pokemon action:sell price:<amount> pokemon_name:<name>`\nPrefix: `!pokemon sell <price> <name>`')],
                    flags: MessageFlags.IsComponentsV2 | MessageFlags.Ephemeral,
                });
            }

            const result = await pokemonStore.sellPokemon(authorId, price, pokemonName);
            if (!result.success) {
                const msg = result.reason === 'not_owned' ? `You don't own any **${pokemonName}**!` : 'Sale failed.';
                return interaction.reply({
                    components: [errorContainer('Listing Failed', msg)],
                    flags: MessageFlags.IsComponentsV2 | MessageFlags.Ephemeral,
                });
            }

            const container = new ContainerBuilder()
                .setAccentColor(COLORS.SUCCESS)
                .addTextDisplayComponents(new TextDisplayBuilder().setContent(`## 🏪 Listed for Sale!`))
                .addSeparatorComponents(new SeparatorBuilder().setSpacing(SeparatorSpacingSize.Small).setDivider(true))
                .addTextDisplayComponents(new TextDisplayBuilder().setContent(
                    `✅ Successfully listed **${result.pokemonName}** (Lv. ${result.level}) for sale!\n\n` +
                    `💰 **Price:** ${result.price.toLocaleString()} PokéCoins\n\n` +
                    `-# Other players can now buy it using: \`/pokemon action:buy user:${author.username} pokemon_name:${result.pokemonName}\``
                ));

            return interaction.reply({ components: [container], flags: MessageFlags.IsComponentsV2 });
        }

        // ─── Case 2: Buy Command ───
        if (action === 'buy') {
            if (isSelf) {
                return interaction.reply({
                    components: [errorContainer('Invalid Target', 'You cannot buy your own listings!')],
                    flags: MessageFlags.IsComponentsV2 | MessageFlags.Ephemeral,
                });
            }
            if (!pokemonName) {
                return interaction.reply({
                    components: [errorContainer('Invalid Command', 'Specify the Pokémon name to buy!\nUsage: `/pokemon action:buy user:<seller> pokemon_name:<name>`')],
                    flags: MessageFlags.IsComponentsV2 | MessageFlags.Ephemeral,
                });
            }

            const result = await pokemonStore.buyPokemon(authorId, userId, pokemonName);
            if (!result.success) {
                let msg = 'Transaction failed.';
                if (result.reason === 'listing_not_found') {
                    msg = `**${targetUser.username}** has no active listing for **${pokemonName}**.`;
                } else if (result.reason === 'insufficient_coins') {
                    msg = `Insufficient coins! Cost: **${result.needed.toLocaleString()}**, you have **${result.have.toLocaleString()}**.`;
                }
                return interaction.reply({
                    components: [errorContainer('Purchase Failed', msg)],
                    flags: MessageFlags.IsComponentsV2 | MessageFlags.Ephemeral,
                });
            }

            const container = new ContainerBuilder()
                .setAccentColor(COLORS.SUCCESS)
                .addTextDisplayComponents(new TextDisplayBuilder().setContent(`## 💸 Marketplace Purchase!`))
                .addSeparatorComponents(new SeparatorBuilder().setSpacing(SeparatorSpacingSize.Small).setDivider(true))
                .addTextDisplayComponents(new TextDisplayBuilder().setContent(
                    `🎉 Successfully bought **${result.pokemonName}** (Lv. ${result.level}) from **${targetUser.username}**!\n\n` +
                    `💰 **Paid:** ${result.price.toLocaleString()} PokéCoins\n` +
                    `✨ *The Pokémon has been added to your collection!*`
                ));

            return interaction.reply({ components: [container], flags: MessageFlags.IsComponentsV2 });
        }

        // ─── Case 2.5: Market Command (Listings) ───
        if (action === 'market' || (action === 'buy' && !pokemonName)) {
            return this.renderMarket(interaction, 1, author);
        }

        // ─── Case 3: Detail View ───
        if (action === 'details') {
            if (!pokemonName) {
                return interaction.reply({
                    components: [errorContainer('Missing Name', 'Specify the name of the Pokémon details you want to view.')],
                    flags: MessageFlags.IsComponentsV2 | MessageFlags.Ephemeral,
                });
            }

            const details = await pokemonStore.getPokemonDetails(userId, pokemonName);
            if (!details) {
                return interaction.reply({
                    components: [errorContainer('Not Found', `${isSelf ? 'You don\'t' : `**${targetUser.username}** doesn't`} own any **${pokemonName}**.`)],
                    flags: MessageFlags.IsComponentsV2 | MessageFlags.Ephemeral,
                });
            }

            const container = pokemonDetailContainer(details, {
                header: `👤 **${targetUser.username}'s** Pokémon Details`,
                footer: `🗂️ **Owned:** ×${details.count} · **Best Level:** ${details.bestLevel}`
            });

            return interaction.reply({
                components: [container],
                flags: MessageFlags.IsComponentsV2,
            });
        }

        // ─── Case 4: Collection List View ───
        const pokedex = await pokemonStore.getUserPokedex(userId);
        if (pokedex.length === 0) {
            return interaction.reply({
                components: [errorContainer('Empty Collection', `${isSelf ? 'You haven\'t' : `**${targetUser.username}** hasn't`} caught any Pokémon yet!\n\n> 💡 Pokémon spawn every 25 messages. Catch them with \`celestia catch <name>\`!`)],
                flags: MessageFlags.IsComponentsV2 | MessageFlags.Ephemeral,
            });
        }

        const stats = await pokemonStore.getUserStats(userId);
        const totalPages = Math.ceil(pokedex.length / PER_PAGE);
        const page = 1;

        const container = buildCollectionPage(pokedex, page, totalPages, stats, targetUser, isSelf);
        const pagination = paginationRow(`pkmn_${targetUser.id}`, page, totalPages);
        container.addActionRowComponents(pagination);
        const components = [container];

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
            await interaction.deferReply().catch(() => {});
            
            const parts = customId.split('_');
            const targetUserId = parts[1];
            const pokemonName = decodeURIComponent(parts.slice(2).join('_'));
            const userId = await accountStore.resolveUserId(targetUserId);
            const details = await pokemonStore.getPokemonDetails(userId, pokemonName);

            if (!details) {
                return interaction.followUp({
                    components: [errorContainer('Not Found', `That Pokémon was not found.`)],
                    flags: MessageFlags.IsComponentsV2 | MessageFlags.Ephemeral,
                });
            }

            let targetDiscordUser;
            try {
                targetDiscordUser = await interaction.client.users.fetch(targetUserId);
            } catch {
                targetDiscordUser = { username: 'A Trainer' };
            }

            const container = pokemonDetailContainer(details, {
                header: `👤 **${targetDiscordUser.username}'s** Pokémon Details`,
                footer: `🗂️ **Owned:** ×${details.count} · **Best Level:** ${details.bestLevel}`
            });

            return interaction.followUp({
                components: [container],
                flags: MessageFlags.IsComponentsV2,
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

            container.addActionRowComponents(pagination);
            const components = [container];

            if (action === 'open') {
                await interaction.reply({
                    components,
                    flags: MessageFlags.IsComponentsV2 | MessageFlags.Ephemeral,
                });
            } else {
                await interaction.update({
                    components,
                    flags: MessageFlags.IsComponentsV2,
                });
            }
            return;
        }

        // ─── Market Pagination ───
        if (customId.startsWith('market_page_')) {
            const parts = customId.split('_');
            const action = parts[2];

            const PokemonListing = require('../../models/PokemonListing');
            const totalListings = await PokemonListing.countDocuments({});
            const totalPages = Math.ceil(totalListings / 5) || 1;

            let currentPage = 1;
            const pageButton = interaction.message.components.find(c => c.components?.some(b => b.customId?.endsWith('_page')));
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

            await this.renderMarket(interaction, newPage, interaction.user, true);
            return;
        }

        // ─── Market Buy Button ───
        if (customId.startsWith('market_buy_')) {
            const listingId = customId.replace('market_buy_', '');
            const PokemonListing = require('../../models/PokemonListing');
            
            const listing = await PokemonListing.findById(listingId);
            if (!listing) {
                return interaction.reply({ components: [errorContainer('Not Found', 'This listing is no longer available.')], flags: MessageFlags.IsComponentsV2 | MessageFlags.Ephemeral });
            }

            const buyerId = await accountStore.resolveUserId(interaction.user.id);
            if (buyerId === listing.sellerId) {
                return interaction.reply({ components: [errorContainer('Invalid', 'You cannot buy your own listing!')], flags: MessageFlags.IsComponentsV2 | MessageFlags.Ephemeral });
            }

            const result = await pokemonStore.buyPokemon(buyerId, listing.sellerId, listing.pokemonName);
            
            if (!result.success) {
                let msg = 'Transaction failed.';
                if (result.reason === 'listing_not_found') msg = `Listing is no longer available.`;
                else if (result.reason === 'insufficient_coins') msg = `Insufficient coins! Cost: **${result.needed.toLocaleString()}**, you have **${result.have.toLocaleString()}**.`;
                
                return interaction.reply({ components: [errorContainer('Purchase Failed', msg)], flags: MessageFlags.IsComponentsV2 | MessageFlags.Ephemeral });
            }

            const sellerDiscordUser = await interaction.client.users.fetch(listing.sellerId).catch(() => ({ username: 'Unknown' }));
            const container = successContainer('Marketplace Purchase!',
                `🎉 Successfully bought **${result.pokemonName}** (Lv. ${result.level}) from **${sellerDiscordUser.username}**!\n\n` +
                `💰 **Paid:** ${result.price.toLocaleString()} ${EMOJIS.COIN}\n` +
                `✨ *The Pokémon has been added to your collection!*`
            );

            await interaction.reply({ components: [container], flags: MessageFlags.IsComponentsV2 });
            
            // Refresh market page so button disappears
            const currentPage = parseInt(interaction.message.components.find(c => c.components?.some(b => b.customId?.endsWith('_page')))?.components?.find(b => b.customId?.endsWith('_page'))?.label?.split('/')[0]?.trim()) || 1;
            await this.renderMarket(interaction, currentPage, interaction.user, true);
            return;
        }
    },

    async renderMarket(interaction, page, author, isUpdate = false) {
        const PokemonListing = require('../../models/PokemonListing');
        const limit = 5;
        const totalListings = await PokemonListing.countDocuments({});
        const totalPages = Math.ceil(totalListings / limit) || 1;
        const skip = (page - 1) * limit;

        const listings = await PokemonListing.find({}).sort({ createdAt: -1 }).skip(skip).limit(limit);

        if (listings.length === 0 && page === 1) {
            const msg = { components: [errorContainer('Empty Market', 'No Pokémon listings available right now.')], flags: MessageFlags.IsComponentsV2 | MessageFlags.Ephemeral };
            if (isUpdate) return interaction.update(msg);
            return interaction.reply(msg);
        }

        const balance = await economyStore.getBalance(await accountStore.resolveUserId(author.id));
        const { EMOJIS, paginationRow } = require('../../utils/componentBuilder');

        const container = new ContainerBuilder().setAccentColor(COLORS.ECONOMY)
            .addTextDisplayComponents(new TextDisplayBuilder().setContent(`## 🏪 Player Market`))
            .addSeparatorComponents(new SeparatorBuilder().setSpacing(SeparatorSpacingSize.Small).setDivider(true))
            .addTextDisplayComponents(new TextDisplayBuilder().setContent(`💰 **Your Balance:** ${balance.pokecoins.toLocaleString()} ${EMOJIS.COIN}`));

        const buyRow = new ActionRowBuilder();

        for (const l of listings) {
            const sellerName = await accountStore.getLeaderboardName(l.sellerId);
            container.addSeparatorComponents(new SeparatorBuilder().setSpacing(SeparatorSpacingSize.Small).setDivider(true));
            container.addTextDisplayComponents(new TextDisplayBuilder().setContent(
                `🏷️ **${l.pokemonName}** (Lv. ${l.level})\n` +
                `💰 **Price:** ${l.price.toLocaleString()} ${EMOJIS.COIN}\n` +
                `> Seller: ${sellerName}`
            ));

            buyRow.addComponents(
                new ButtonBuilder()
                    .setCustomId(`market_buy_${l._id}`)
                    .setLabel(`Buy ${l.pokemonName}`)
                    .setStyle(ButtonStyle.Success)
            );
        }

        container.addSeparatorComponents(new SeparatorBuilder().setSpacing(SeparatorSpacingSize.Small).setDivider(true));
        container.addTextDisplayComponents(new TextDisplayBuilder().setContent(`-# Page ${page}/${totalPages} · Use buttons to navigate or purchase`));

        const pagRow = paginationRow(`market_page`, page, totalPages);
        container.addActionRowComponents(buyRow);
        container.addActionRowComponents(pagRow);
        const components = [container];

        if (isUpdate) {
            await interaction.editReply({ components, flags: MessageFlags.IsComponentsV2 }).catch(() => interaction.update({ components, flags: MessageFlags.IsComponentsV2 }));
        } else {
            await interaction.reply({ components, flags: MessageFlags.IsComponentsV2 });
        }
    }
};

function buildCollectionPage(pokedex, page, totalPages, stats, targetUser, isSelf) {
    const start = (page - 1) * PER_PAGE;
    const pageItems = pokedex.slice(start, start + PER_PAGE);

    const container = new ContainerBuilder().setAccentColor(COLORS.CELESTIA);

    const section = new SectionBuilder();
    section.addTextDisplayComponents(
        new TextDisplayBuilder().setContent(
            `👤 **Trainer:** ${targetUser.username}\n\n` +
            `> 🎯 **${stats.total}** caught · **${stats.unique}** unique species`
        )
    );
    if (targetUser.displayAvatarURL) {
        section.setThumbnailAccessory(new ThumbnailBuilder().setURL(targetUser.displayAvatarURL({ size: 128 })));
    }

    // Header
    container.addTextDisplayComponents(
        new TextDisplayBuilder().setContent(
            `## 📦 ${isSelf ? 'Your' : `${targetUser.username}'s`} Pokémon Collection`
        )
    );

    container.addSeparatorComponents(
        new SeparatorBuilder().setSpacing(SeparatorSpacingSize.Small).setDivider(true)
    );

    container.addSectionComponents(section);

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

        const entrySection = new SectionBuilder();
        entrySection.addTextDisplayComponents(
            new TextDisplayBuilder().setContent(
                `**\`${String(globalIdx).padStart(3, '0')}\`** · **${p.name}**${rarityIcon} — ×${p.count}\n` +
                `> Lv. ${p.bestLevel} ${rank}${typeStr ? ` · ${typeStr}` : ''}`
            )
        );

        const encodedName = encodeURIComponent(p.name).substring(0, 60);
        entrySection.setButtonAccessory(
            new ButtonBuilder()
                .setCustomId(`pkdet_${targetUser.id}_${encodedName}`)
                .setEmoji('📋')
                .setLabel('Details')
                .setStyle(ButtonStyle.Secondary)
        );

        container.addSectionComponents(entrySection);
        container.addSeparatorComponents(
            new SeparatorBuilder().setSpacing(SeparatorSpacingSize.Small).setDivider(true)
        );
    }

    container.addTextDisplayComponents(
        new TextDisplayBuilder().setContent(
            `-# Page ${page}/${totalPages} · Use the buttons below to navigate`
        )
    );

    return container;
}
