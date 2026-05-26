/**
 * /gift — Unified gifting system for Pokémon, Items, and PokéCoins with Components V2.
 */
const { SlashCommandBuilder, ContainerBuilder, TextDisplayBuilder, SeparatorBuilder, SeparatorSpacingSize, MessageFlags, SectionBuilder, ThumbnailBuilder } = require('discord.js');
const economyStore = require('../../store/economyStore');
const accountStore = require('../../store/accountStore');
const pokemonStore = require('../../store/pokemonStore');
const { COLORS, errorContainer, successContainer } = require('../../utils/componentBuilder');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('gift')
        .setDescription('Gift Pokémon, Items, or PokéCoins to another trainer')
        .addSubcommand(sub => 
            sub.setName('pokemon')
                .setDescription('Gift a Pokémon')
                .addUserOption(opt => opt.setName('user').setDescription('Who to gift to').setRequired(true))
                .addStringOption(opt => opt.setName('pokemon').setDescription('Pokémon name').setRequired(true))
        )
        .addSubcommand(sub => 
            sub.setName('item')
                .setDescription('Gift an item')
                .addUserOption(opt => opt.setName('user').setDescription('Who to gift to').setRequired(true))
                .addStringOption(opt => opt.setName('item').setDescription('Item name').setRequired(true))
                .addIntegerOption(opt => opt.setName('quantity').setDescription('How many items').setRequired(false).setMinValue(1))
        )
        .addSubcommand(sub => 
            sub.setName('pokecoin')
                .setDescription('Gift PokéCoins')
                .addUserOption(opt => opt.setName('user').setDescription('Who to gift to').setRequired(true))
                .addIntegerOption(opt => opt.setName('amount').setDescription('Amount of coins').setRequired(true).setMinValue(1))
        ),
    aliases: ['give', 'send', 'transfer', 'pokegift', 'itemgift', 'pokecoin'],

    async execute(interaction, client, args) {
        const isInteraction = typeof interaction.isChatInputCommand === 'function' && interaction.isChatInputCommand();
        const author = isInteraction ? interaction.user : interaction.author;
        
        let subcommand = null;
        let targetUser = null;
        let itemName = null;
        let pokemonName = null;
        let amount = 1;

        if (isInteraction) {
            subcommand = interaction.options.getSubcommand(true);
            targetUser = interaction.options.getUser('user');
            
            if (subcommand === 'pokemon') {
                pokemonName = interaction.options.getString('pokemon');
            } else if (subcommand === 'item') {
                itemName = interaction.options.getString('item');
                amount = interaction.options.getInteger('quantity') || 1;
            } else if (subcommand === 'pokecoin') {
                amount = interaction.options.getInteger('amount');
            }
        } else {
            // Text command parsing
            if (!args || args.length < 3) {
                return interaction.reply({
                    components: [errorContainer('Invalid Command', `👤 **${author.username}**: Usage:\n\`!gift pokemon @user <name>\`\n\`!gift item @user <name> [qty]\`\n\`!gift pokecoin @user <amount>\``)],
                    flags: MessageFlags.IsComponentsV2,
                });
            }
            
            subcommand = args[0].toLowerCase();
            targetUser = interaction.mentions?.users?.first();
            
            if (!['pokemon', 'item', 'pokecoin', 'coins', 'coin'].includes(subcommand) || !targetUser) {
                return interaction.reply({
                    components: [errorContainer('Invalid Command', `👤 **${author.username}**: Specify what to gift: \`pokemon\`, \`item\`, or \`pokecoin\` and tag a user.`)],
                    flags: MessageFlags.IsComponentsV2,
                });
            }
            if (subcommand === 'coins' || subcommand === 'coin') subcommand = 'pokecoin';

            const cleanArgs = args.slice(1).filter(a => !a.startsWith('<@') && !a.endsWith('>'));
            
            if (subcommand === 'pokemon') {
                pokemonName = cleanArgs.join(' ').trim();
            } else if (subcommand === 'item') {
                const lastArg = cleanArgs[cleanArgs.length - 1];
                if (lastArg && !isNaN(parseInt(lastArg))) {
                    amount = parseInt(lastArg);
                    cleanArgs.pop();
                }
                itemName = cleanArgs.join(' ').trim();
            } else if (subcommand === 'pokecoin') {
                const num = cleanArgs.find(a => !isNaN(a) && a.trim() !== '');
                if (num) amount = parseInt(num);
            }
        }

        if (targetUser.id === author.id) {
            return interaction.reply({
                components: [errorContainer('Invalid Target', `👤 **${author.username}**: You can't gift to yourself! 😅`)],
                flags: MessageFlags.IsComponentsV2,
            });
        }

        const senderId = await accountStore.resolveUserId(author.id);
        const targetId = await accountStore.resolveUserId(targetUser.id);

        if (subcommand === 'pokemon') {
            if (!pokemonName) return interaction.reply({ components: [errorContainer('Missing Name', `👤 **${author.username}**: Specify the Pokémon to gift.`)], flags: MessageFlags.IsComponentsV2 });
            
            const result = await pokemonStore.giftPokemon(senderId, targetId, pokemonName);
            if (!result.success) {
                return interaction.reply({ components: [errorContainer('Gift Failed', `👤 **${author.username}**: You don't own **${pokemonName}**!`)], flags: MessageFlags.IsComponentsV2 });
            }

            const section = new SectionBuilder();
            section.addTextDisplayComponents(
                new TextDisplayBuilder().setContent(
                    `👤 **From:** ${author.username}\n` +
                    `👤 **To:** ${targetUser.username}\n\n` +
                    `📦 **${result.pokemon.name}** (Lv. ${result.pokemon.level})\n`
                )
            );
            section.setThumbnailAccessory(new ThumbnailBuilder().setURL(author.displayAvatarURL({ size: 128 })));

            const container = new ContainerBuilder()
                .setAccentColor(COLORS.SUCCESS)
                .addTextDisplayComponents(new TextDisplayBuilder().setContent(`## 🎁 Pokémon Gift Sent!`))
                .addSeparatorComponents(new SeparatorBuilder().setSpacing(SeparatorSpacingSize.Small).setDivider(true))
                .addSectionComponents(section)
                .addSeparatorComponents(new SeparatorBuilder().setSpacing(SeparatorSpacingSize.Small).setDivider(true))
                .addTextDisplayComponents(new TextDisplayBuilder().setContent(`> *The Pokémon has been transferred!*`));
            
            return interaction.reply({ components: [container], flags: MessageFlags.IsComponentsV2 });
        }

        if (subcommand === 'item') {
            if (!itemName) return interaction.reply({ components: [errorContainer('Missing Name', `👤 **${author.username}**: Specify the item to gift.`)], flags: MessageFlags.IsComponentsV2 });
            
            const itemDetails = economyStore.getItemDetails(itemName);
            if (!itemDetails) {
                return interaction.reply({ components: [errorContainer('Not Found', `👤 **${author.username}**: Could not find any item matching **${itemName}**.`)], flags: MessageFlags.IsComponentsV2 });
            }

            const senderInv = await economyStore.getInventory(senderId);
            const senderItem = senderInv.items.find(i => i.itemName.toLowerCase() === itemDetails.displayName.toLowerCase());

            if (!senderItem || senderItem.quantity < amount) {
                const ownedQty = senderItem ? senderItem.quantity : 0;
                return interaction.reply({
                    components: [errorContainer('Insufficient Inventory', `👤 **${author.username}**:\n**Item:** ${itemDetails.emoji} ${itemDetails.displayName}\n🎒 **You have:** ${ownedQty} units\n🎁 **Trying to gift:** ${amount} units`)],
                    flags: MessageFlags.IsComponentsV2,
                });
            }

            const removed = await economyStore.removeInventoryItem(senderId, itemDetails.displayName, amount);
            if (!removed) return interaction.reply({ components: [errorContainer('Error', `👤 **${author.username}**: Failed to deduct item. Try again.`)], flags: MessageFlags.IsComponentsV2 });
            await economyStore.addInventoryItem(targetId, itemDetails.displayName, amount);

            const section = new SectionBuilder();
            section.addTextDisplayComponents(
                new TextDisplayBuilder().setContent(
                    `👤 **From:** ${author.username}\n` +
                    `👤 **To:** ${targetUser.username}\n\n` +
                    `✨ **Gilded Gift:** **${amount}x ${itemDetails.emoji} ${itemDetails.displayName}**\n`
                )
            );
            section.setThumbnailAccessory(new ThumbnailBuilder().setURL(author.displayAvatarURL({ size: 128 })));

            const container = new ContainerBuilder()
                .setAccentColor(COLORS.SUCCESS)
                .addTextDisplayComponents(new TextDisplayBuilder().setContent(`## 🎁 Item Gift Sent!`))
                .addSeparatorComponents(new SeparatorBuilder().setSpacing(SeparatorSpacingSize.Small).setDivider(true))
                .addSectionComponents(section)
                .addSeparatorComponents(new SeparatorBuilder().setSpacing(SeparatorSpacingSize.Small).setDivider(true))
                .addTextDisplayComponents(new TextDisplayBuilder().setContent(`> *Sharing items strengthens our bond, trainers!* 🤝`));

            return interaction.reply({ components: [container], flags: MessageFlags.IsComponentsV2 });
        }

        if (subcommand === 'pokecoin') {
            if (!amount || amount <= 0) return interaction.reply({ components: [errorContainer('Missing Amount', `👤 **${author.username}**: Specify a valid coin amount to gift.`)], flags: MessageFlags.IsComponentsV2 });
            
            const result = await economyStore.transferCoins(senderId, targetId, amount);
            if (!result.success) {
                const msg = result.reason === 'insufficient' ? `Not enough coins! You have **${result.balance.toLocaleString()}**.` : 'Transfer failed.';
                return interaction.reply({ components: [errorContainer('Transfer Failed', `👤 **${author.username}**: ${msg}`)], flags: MessageFlags.IsComponentsV2 });
            }

            const section = new SectionBuilder();
            section.addTextDisplayComponents(
                new TextDisplayBuilder().setContent(
                    `👤 **From:** ${author.username} (${result.fromBalance.toLocaleString()} remaining)\n` +
                    `👤 **To:** ${targetUser.username}\n\n` +
                    `<:pokecoins:1508755286784086037> **${amount.toLocaleString()} PokéCoins**\n`
                )
            );
            section.setThumbnailAccessory(new ThumbnailBuilder().setURL(author.displayAvatarURL({ size: 128 })));

            const container = new ContainerBuilder()
                .setAccentColor(COLORS.SUCCESS)
                .addTextDisplayComponents(new TextDisplayBuilder().setContent(`## 💸 Coins Transferred!`))
                .addSeparatorComponents(new SeparatorBuilder().setSpacing(SeparatorSpacingSize.Small).setDivider(true))
                .addSectionComponents(section)
                .addSeparatorComponents(new SeparatorBuilder().setSpacing(SeparatorSpacingSize.Small).setDivider(true));

            return interaction.reply({ components: [container], flags: MessageFlags.IsComponentsV2 });
        }
    },
};
