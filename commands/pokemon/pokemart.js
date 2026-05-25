/**
 * /pokemart — Shop UI with Components V2.
 */
const { SlashCommandBuilder, ContainerBuilder, TextDisplayBuilder, SeparatorBuilder, SeparatorSpacingSize, ActionRowBuilder, ButtonBuilder, ButtonStyle, StringSelectMenuBuilder, StringSelectMenuOptionBuilder, MessageFlags } = require('discord.js');
const economyStore = require('../../store/economyStore');
const accountStore = require('../../store/accountStore');
const { COLORS, errorContainer, successContainer } = require('../../utils/componentBuilder');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('pokemart')
        .setDescription('Browse and buy items from the PokéMart')
        .addStringOption(opt => opt.setName('action').setDescription('buy/sell/list').setRequired(false)
            .addChoices({ name: 'buy', value: 'buy' }, { name: 'sell', value: 'sell' }, { name: 'list', value: 'list' }))
        .addStringOption(opt => opt.setName('item').setDescription('Item name to buy').setRequired(false))
        .addIntegerOption(opt => opt.setName('quantity').setDescription('How many to buy').setRequired(false))
        .addStringOption(opt => opt.setName('pokemon').setDescription('Pokémon to sell (for sell action)').setRequired(false))
        .addIntegerOption(opt => opt.setName('price').setDescription('Price to sell at (for sell action)').setRequired(false)),
    aliases: ['mart', 'shop'],

    async execute(interaction) {
        const action = interaction.options?.getString?.('action');
        const userId = await accountStore.resolveUserId(interaction.user.id);

        if (action === 'buy') {
            return this.handleBuy(interaction, userId);
        } else if (action === 'sell') {
            return this.handleSell(interaction, userId);
        } else if (action === 'list') {
            return this.handleList(interaction, userId);
        }

        // Default: Show shop catalog
        const catalog = economyStore.getMarketCatalog();
        const balance = await economyStore.getBalance(userId);

        let shopText = '';
        for (const [id, item] of Object.entries(catalog)) {
            const currency = id === 'wishing compass' ? '💎 Radiant Crystals' : '🪙 PokéCoins';
            shopText += `${item.emoji} **${item.displayName}** — ${item.price.toLocaleString()} ${currency}`;
            if (item.quantity > 1) shopText += ` (×${item.quantity})`;
            shopText += `\n> ${item.description}\n\n`;
        }

        const container = new ContainerBuilder()
            .setAccentColor(COLORS.ECONOMY)
            .addTextDisplayComponents(new TextDisplayBuilder().setContent(`## 🏪 PokéMart`))
            .addSeparatorComponents(new SeparatorBuilder().setSpacing(SeparatorSpacingSize.Small).setDivider(true))
            .addTextDisplayComponents(new TextDisplayBuilder().setContent(
                `💰 **Your Balance:** ${balance.pokecoins.toLocaleString()} coins · 💎 ${(balance.radiantCrystals || 0).toLocaleString()} crystals`
            ))
            .addSeparatorComponents(new SeparatorBuilder().setSpacing(SeparatorSpacingSize.Small).setDivider(true))
            .addTextDisplayComponents(new TextDisplayBuilder().setContent(shopText))
            .addTextDisplayComponents(new TextDisplayBuilder().setContent(`-# Use \`/pokemart buy item:<name>\` to purchase`));

        // Quick buy buttons
        const row = new ActionRowBuilder().addComponents(
            new ButtonBuilder().setCustomId('mart_buy_pokeball').setLabel('Buy Pokéballs').setEmoji('🔴').setStyle(ButtonStyle.Primary),
            new ButtonBuilder().setCustomId('mart_buy_levelorb').setLabel('Buy Level Orb').setEmoji('🔮').setStyle(ButtonStyle.Primary),
            new ButtonBuilder().setCustomId('mart_buy_raidpass').setLabel('Buy Raid Pass').setEmoji('🎟️').setStyle(ButtonStyle.Secondary),
            new ButtonBuilder().setCustomId('mart_buy_candle').setLabel('Buy Candle').setEmoji('🕯️').setStyle(ButtonStyle.Secondary),
        );

        await interaction.reply({ components: [container, row], flags: MessageFlags.IsComponentsV2 });
    },

    async handleBuy(interaction, userId) {
        const itemName = interaction.options?.getString?.('item');
        const qty = interaction.options?.getInteger?.('quantity') || 1;
        if (!itemName) return interaction.reply({ components: [errorContainer('Missing Item', 'Specify an item name!\n`/pokemart buy item:pokeball`')], flags: MessageFlags.IsComponentsV2 | MessageFlags.Ephemeral });

        const itemDetails = economyStore.getItemDetails(itemName);
        if (!itemDetails) return interaction.reply({ components: [errorContainer('Not Found', `**${itemName}** is not in the PokéMart.`)], flags: MessageFlags.IsComponentsV2 | MessageFlags.Ephemeral });

        const result = await economyStore.buyItem(userId, itemDetails.id, qty);
        if (!result.success) {
            const msg = result.reason === 'insufficient_coins'
                ? `Not enough coins! Need **${result.needed.toLocaleString()}**, have **${result.have.toLocaleString()}**.`
                : result.reason === 'insufficient_crystals'
                    ? `Not enough crystals! Need **${result.needed.toLocaleString()}**, have **${result.have.toLocaleString()}**.`
                    : 'Purchase failed.';
            return interaction.reply({ components: [errorContainer('Purchase Failed', msg)], flags: MessageFlags.IsComponentsV2 | MessageFlags.Ephemeral });
        }

        const container = successContainer('Purchase Complete',
            `${itemDetails.emoji} **${result.item}** ×${result.quantity}\n` +
            `💸 Spent: **${result.spent.toLocaleString()}** ${result.currency || 'PokéCoins'}\n` +
            `💰 Remaining: **${result.newBalance.toLocaleString()}**`
        );
        await interaction.reply({ components: [container], flags: MessageFlags.IsComponentsV2 });
    },

    async handleSell(interaction, userId) {
        const pokemonName = interaction.options?.getString?.('pokemon');
        const price = interaction.options?.getInteger?.('price');
        if (!pokemonName || !price) return interaction.reply({ components: [errorContainer('Missing Info', 'Usage: `/pokemart sell pokemon:<name> price:<amount>`')], flags: MessageFlags.IsComponentsV2 | MessageFlags.Ephemeral });

        const pokemonStore = require('../../store/pokemonStore');
        const result = await pokemonStore.sellPokemon(userId, price, pokemonName);
        if (!result.success) {
            const msg = result.reason === 'not_owned' ? `You don't own **${pokemonName}**!` : 'Sale failed.';
            return interaction.reply({ components: [errorContainer('Sale Failed', msg)], flags: MessageFlags.IsComponentsV2 | MessageFlags.Ephemeral });
        }

        const container = successContainer('Listed for Sale!',
            `🏷️ **${result.pokemonName}** (Lv. ${result.level})\n💰 Price: **${result.price.toLocaleString()} PokéCoins**\n\n> Other trainers can now buy it!`
        );
        await interaction.reply({ components: [container], flags: MessageFlags.IsComponentsV2 });
    },

    async handleList(interaction, userId) {
        const PokemonListing = require('../../models/PokemonListing');
        const listings = await PokemonListing.find({}).sort({ createdAt: -1 }).limit(20);
        if (listings.length === 0) {
            return interaction.reply({ components: [errorContainer('Empty Market', 'No listings available right now.')], flags: MessageFlags.IsComponentsV2 | MessageFlags.Ephemeral });
        }

        let listText = '';
        for (const l of listings) {
            const sellerName = await accountStore.getLeaderboardName(l.sellerId);
            listText += `🏷️ **${l.pokemonName}** (Lv. ${l.level}) — 💰 ${l.price.toLocaleString()} coins\n> Seller: ${sellerName}\n\n`;
        }

        const container = new ContainerBuilder().setAccentColor(COLORS.ECONOMY)
            .addTextDisplayComponents(new TextDisplayBuilder().setContent(`## 🏪 Marketplace Listings`))
            .addSeparatorComponents(new SeparatorBuilder().setSpacing(SeparatorSpacingSize.Small).setDivider(true))
            .addTextDisplayComponents(new TextDisplayBuilder().setContent(listText));

        await interaction.reply({ components: [container], flags: MessageFlags.IsComponentsV2 });
    },

    async handleButton(interaction) {
        const id = interaction.customId;
        if (!id.startsWith('mart_buy_')) return;
        const userId = await accountStore.resolveUserId(interaction.user.id);
        const itemMap = { pokeball: 'pokeball', levelorb: 'level orb', raidpass: 'raid pass', candle: 'summoning candle' };
        const itemKey = itemMap[id.replace('mart_buy_', '')];
        if (!itemKey) return;

        const result = await economyStore.buyItem(userId, itemKey, 1);
        if (!result.success) {
            const msg = result.reason === 'insufficient_coins' ? `Not enough coins! Need **${result.needed.toLocaleString()}**.` : result.reason === 'insufficient_crystals' ? `Not enough crystals!` : 'Failed.';
            return interaction.reply({ components: [errorContainer('Purchase Failed', msg)], flags: MessageFlags.IsComponentsV2 | MessageFlags.Ephemeral });
        }

        const container = successContainer('Purchased!', `**${result.item}** ×${result.quantity}\n💸 **${result.spent.toLocaleString()}** spent · 💰 **${result.newBalance.toLocaleString()}** remaining`);
        await interaction.reply({ components: [container], flags: MessageFlags.IsComponentsV2 | MessageFlags.Ephemeral });
    },
};
