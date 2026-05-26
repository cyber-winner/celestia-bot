/**
 * /balance — View your Pokémon economy wallet with Components V2.
 */

const { SlashCommandBuilder, ContainerBuilder, TextDisplayBuilder, SeparatorBuilder, SeparatorSpacingSize, MessageFlags, SectionBuilder, ThumbnailBuilder } = require('discord.js');
const economyStore = require('../../store/economyStore');
const accountStore = require('../../store/accountStore');
const { COLORS } = require('../../utils/componentBuilder');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('balance')
        .setDescription('View your wallet and economy status')
        .addUserOption(opt =>
            opt.setName('user')
                .setDescription('Check another trainer\'s balance')
                .setRequired(false)
        ),
    aliases: ['bal', 'wallet'],

    async execute(interaction, client, args) {
        const isInteraction = typeof interaction.isChatInputCommand === 'function' && interaction.isChatInputCommand();
        const author = isInteraction ? interaction.user : interaction.author;
        const targetUser = isInteraction ? (interaction.options?.getUser?.('user') || author) : (interaction.mentions?.users?.first() || author);
        const userId = await accountStore.resolveUserId(targetUser.id);
        const isSelf = targetUser.id === author.id;

        const balance = await economyStore.getBalance(userId);
        const inventory = await economyStore.getInventory(userId);

        let itemsText = '';
        if (inventory.items.length > 0) {
            itemsText = inventory.items
                .filter(i => i.quantity > 0)
                .map(i => `> ${i.itemName} — ×${i.quantity}`)
                .join('\n');
        } else {
            itemsText = '> *No items yet*';
        }

        const section = new SectionBuilder();
        section.addTextDisplayComponents(
            new TextDisplayBuilder().setContent(
                `<:pokecoins:1508755286784086037> **PokéCoins:** ${balance.pokecoins.toLocaleString()}\n` +
                `<:Pokemon:1508753880782209085> **Pokéballs:** ${balance.pokeballs.toLocaleString()}\n` +
                `<:Crystal:1508755711348445214> **Radiant Crystals:** ${(balance.radiantCrystals || 0).toLocaleString()}`
            )
        );
        section.setThumbnailAccessory(new ThumbnailBuilder().setURL(targetUser.displayAvatarURL({ size: 128 })));

        const container = new ContainerBuilder()
            .setAccentColor(COLORS.ECONOMY)
            .addTextDisplayComponents(
                new TextDisplayBuilder().setContent(
                    `## 💰 ${isSelf ? 'Your' : `${targetUser.username}'s`} Wallet`
                )
            )
            .addSeparatorComponents(
                new SeparatorBuilder().setSpacing(SeparatorSpacingSize.Small).setDivider(true)
            )
            .addSectionComponents(section)
            .addSeparatorComponents(
                new SeparatorBuilder().setSpacing(SeparatorSpacingSize.Small).setDivider(true)
            )
            .addTextDisplayComponents(
                new TextDisplayBuilder().setContent(
                    `### 🎒 Inventory Quick View\n${itemsText}`
                )
            );

        await interaction.reply({
            components: [container],
            flags: MessageFlags.IsComponentsV2,
        });
    },
};
