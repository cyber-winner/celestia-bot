/**
 * /pokeuse — Use items (Level Orb, Summoning Candle).
 */
const { SlashCommandBuilder, ContainerBuilder, TextDisplayBuilder, SeparatorBuilder, SeparatorSpacingSize, MediaGalleryBuilder, MediaGalleryItemBuilder, MessageFlags } = require('discord.js');
const economyStore = require('../../store/economyStore');
const pokemonStore = require('../../store/pokemonStore');
const accountStore = require('../../store/accountStore');
const { COLORS, errorContainer, successContainer } = require('../../utils/componentBuilder');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('pokeuse')
        .setDescription('Use an item from your inventory')
        .addStringOption(opt => opt.setName('item').setDescription('Item to use').setRequired(true)
            .addChoices({ name: 'Level Orb', value: 'level orb' }, { name: 'Summoning Candle', value: 'summoning candle' }))
        .addStringOption(opt => opt.setName('pokemon').setDescription('Pokémon name to use item on').setRequired(true)),
    aliases: ['use'],

    async execute(interaction) {
        const itemName = interaction.options.getString('item');
        const pokemonName = interaction.options.getString('pokemon');
        const userId = await accountStore.resolveUserId(interaction.user.id);

        if (itemName === 'level orb') {
            return this.handleLevelOrb(interaction, userId, pokemonName);
        } else if (itemName === 'summoning candle') {
            return this.handleSummoningCandle(interaction, userId, pokemonName);
        }
    },

    async handleLevelOrb(interaction, userId, pokemonName) {
        const result = await economyStore.useLevelOrb(userId, pokemonName);
        if (!result.success) {
            const msgs = { no_orbs: "You don't have any Level Orbs!", no_pokemon: `You don't own **${pokemonName}**!`, max_level: `**${pokemonName}** is already at max level!`, failed: `The Level Orb shattered! 💔\n**${result.pokemonName}** stays at Lv. ${result.level}.` };
            return interaction.reply({ components: [errorContainer('Level Orb', msgs[result.reason] || 'Failed.')], flags: MessageFlags.IsComponentsV2 | MessageFlags.Ephemeral });
        }

        const container = new ContainerBuilder().setAccentColor(COLORS.SUCCESS)
            .addTextDisplayComponents(new TextDisplayBuilder().setContent(`## 🔮 Level Orb Success!`))
            .addSeparatorComponents(new SeparatorBuilder().setSpacing(SeparatorSpacingSize.Small).setDivider(true))
            .addTextDisplayComponents(new TextDisplayBuilder().setContent(
                `🏷️ **${result.pokemonName}**\n` +
                `📊 Lv. ${result.oldLevel} → **Lv. ${result.newLevel}** (+${result.levelsGained})\n\n` +
                `> *The orb's energy flows into your Pokémon!* ✨`
            ));
        await interaction.reply({ components: [container], flags: MessageFlags.IsComponentsV2 });
    },

    async handleSummoningCandle(interaction, userId, pokemonName) {
        const channelId = interaction.channelId;
        // Check candle in inventory
        const inventory = await economyStore.getInventory(userId);
        const candle = inventory.items.find(i => i.itemName === 'Summoning Candle');
        if (!candle || candle.quantity <= 0) {
            return interaction.reply({ components: [errorContainer('No Candle', "You don't have a Summoning Candle!\n> Buy one: `/pokemart buy item:summoning candle`")], flags: MessageFlags.IsComponentsV2 | MessageFlags.Ephemeral });
        }

        // Check cooldown
        const cooldown = await economyStore.checkSummonCooldown(userId);
        if (!cooldown.allowed) {
            return interaction.reply({ components: [errorContainer('Cooldown', `Wait **${cooldown.hours}h ${cooldown.minutes}m** before using another candle.`)], flags: MessageFlags.IsComponentsV2 | MessageFlags.Ephemeral });
        }

        // Check existing summon
        if (pokemonStore.getSummonedSpawn(channelId)) {
            return interaction.reply({ components: [errorContainer('Active Summon', 'A summoned Pokémon is already active in this channel!')], flags: MessageFlags.IsComponentsV2 | MessageFlags.Ephemeral });
        }

        // Consume candle
        await economyStore.removeInventoryItem(userId, 'Summoning Candle', 1);
        await economyStore.recordSummonUsage(userId);

        // Summon
        const summon = pokemonStore.summonPokemon(channelId, userId, pokemonName);
        if (!summon) {
            await economyStore.addInventoryItem(userId, 'Summoning Candle', 1); // Refund
            return interaction.reply({ components: [errorContainer('Not Found', `**${pokemonName}** is not a valid Pokémon!`)], flags: MessageFlags.IsComponentsV2 | MessageFlags.Ephemeral });
        }

        const container = new ContainerBuilder().setAccentColor(COLORS.CELESTIA)
            .addTextDisplayComponents(new TextDisplayBuilder().setContent(`## 🕯️ Summoning Ritual`))
            .addSeparatorComponents(new SeparatorBuilder().setSpacing(SeparatorSpacingSize.Small).setDivider(true));

        if (summon.cardImage) {
            container.addMediaGalleryComponents(new MediaGalleryBuilder().addItems(new MediaGalleryItemBuilder().setURL(summon.cardImage)));
            container.addSeparatorComponents(new SeparatorBuilder().setSpacing(SeparatorSpacingSize.Small).setDivider(true));
        }

        container.addTextDisplayComponents(new TextDisplayBuilder().setContent(
            `🏷️ **${summon.name}** has answered the call!\n` +
            `📊 **Level:** ${summon.level}\n` +
            `🔖 **Type:** ${(summon.types || []).join(' / ')}\n\n` +
            `👤 **Summoner:** ${interaction.user.username}\n` +
            `🎯 **Tries:** 3/3 · **Cost:** 2 balls per try\n\n` +
            `> Type \`celestia catch ${summon.name}\` to catch it!\n` +
            `> Only the summoner can catch this Pokémon.`
        ));

        await interaction.reply({ components: [container], flags: MessageFlags.IsComponentsV2 });
    },
};
