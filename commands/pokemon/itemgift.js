/**
 * /itemgift — Gift items from your inventory to another trainer.
 */
const { SlashCommandBuilder, ContainerBuilder, TextDisplayBuilder, SeparatorBuilder, SeparatorSpacingSize, MessageFlags } = require('discord.js');
const economyStore = require('../../store/economyStore');
const accountStore = require('../../store/accountStore');
const { COLORS, errorContainer } = require('../../utils/componentBuilder');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('itemgift')
        .setDescription('Gift items from your inventory to another trainer')
        .addUserOption(opt => opt.setName('user').setDescription('The trainer to gift items to').setRequired(true))
        .addStringOption(opt => opt.setName('item').setDescription('The name of the item to gift').setRequired(true))
        .addIntegerOption(opt => opt.setName('quantity').setDescription('How many items to gift').setRequired(false).setMinValue(1)),
    aliases: ['itemshare', 'giftitem', 'ig'],

    async execute(interaction, client, args) {
        const isInteraction = typeof interaction.isChatInputCommand === 'function' && interaction.isChatInputCommand();
        const author = isInteraction ? interaction.user : interaction.author;

        let targetUser = null;
        let itemNameInput = '';
        let quantity = 1;

        if (isInteraction) {
            targetUser = interaction.options.getUser('user');
            itemNameInput = interaction.options.getString('item');
            quantity = interaction.options.getInteger('quantity') || 1;
        } else if (args && args.length > 0) {
            targetUser = interaction.mentions?.users?.first();
            const cleanArgs = args.filter(a => !a.startsWith('<@') && !a.endsWith('>'));
            
            if (cleanArgs.length > 0) {
                // Parse quantity at the end of the argument list (if present)
                const lastArg = cleanArgs[cleanArgs.length - 1];
                if (lastArg && !isNaN(parseInt(lastArg))) {
                    quantity = parseInt(lastArg);
                    cleanArgs.pop();
                }
                itemNameInput = cleanArgs.join(' ');
            }
        }

        if (!targetUser || !itemNameInput) {
            return interaction.reply({
                components: [errorContainer('Invalid Command', 'Specify a trainer, item, and optionally quantity: `!itemgift @user <item_name> [quantity]`')],
                flags: MessageFlags.IsComponentsV2 | MessageFlags.Ephemeral,
            });
        }

        const senderId = await accountStore.resolveUserId(author.id);
        const targetId = await accountStore.resolveUserId(targetUser.id);

        if (senderId === targetId) {
            return interaction.reply({
                components: [errorContainer('Invalid Target', 'You cannot gift items to yourself! 😅')],
                flags: MessageFlags.IsComponentsV2 | MessageFlags.Ephemeral,
            });
        }

        if (quantity <= 0) {
            return interaction.reply({
                components: [errorContainer('Invalid Quantity', 'Quantity must be a positive number!')],
                flags: MessageFlags.IsComponentsV2 | MessageFlags.Ephemeral,
            });
        }

        const itemDetails = economyStore.getItemDetails(itemNameInput);
        if (!itemDetails) {
            return interaction.reply({
                components: [errorContainer('Item Not Found', `Could not find any item matching **${itemNameInput}** in the database.`)],
                flags: MessageFlags.IsComponentsV2 | MessageFlags.Ephemeral,
            });
        }

        const senderInv = await economyStore.getInventory(senderId);
        const senderItem = senderInv.items.find(i => i.itemName.toLowerCase() === itemDetails.displayName.toLowerCase());

        if (!senderItem || senderItem.quantity < quantity) {
            const ownedQty = senderItem ? senderItem.quantity : 0;
            return interaction.reply({
                components: [errorContainer('Insufficient Inventory', 
                    `**Item:** ${itemDetails.emoji} ${itemDetails.displayName}\n` +
                    `🎒 **You have:** ${ownedQty} units\n` +
                    `🎁 **Trying to gift:** ${quantity} units`
                )],
                flags: MessageFlags.IsComponentsV2 | MessageFlags.Ephemeral,
            });
        }

        // Deduct from sender
        const removed = await economyStore.removeInventoryItem(senderId, itemDetails.displayName, quantity);
        if (!removed) {
            return interaction.reply({
                components: [errorContainer('Error', 'Failed to deduct item from your inventory. Try again.')],
                flags: MessageFlags.IsComponentsV2 | MessageFlags.Ephemeral,
            });
        }

        // Add to recipient
        await economyStore.addInventoryItem(targetId, itemDetails.displayName, quantity);

        const container = new ContainerBuilder()
            .setAccentColor(COLORS.SUCCESS)
            .addTextDisplayComponents(new TextDisplayBuilder().setContent(`## 🎁 Item Gift Sent!`))
            .addSeparatorComponents(new SeparatorBuilder().setSpacing(SeparatorSpacingSize.Small).setDivider(true))
            .addTextDisplayComponents(new TextDisplayBuilder().setContent(
                `👤 **From:** ${author.username}\n` +
                `👤 **To:** ${targetUser.username}\n\n` +
                `✨ **Gilded Gift:** **${quantity}x ${itemDetails.emoji} ${itemDetails.displayName}**\n\n` +
                `> *Sharing items strengthens our bond, trainers!* 🤝`
            ));

        return interaction.reply({ components: [container], flags: MessageFlags.IsComponentsV2 });
    }
};
