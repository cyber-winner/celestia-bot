/**
 * /pokegift — Gift a Pokémon to another trainer.
 */
const { SlashCommandBuilder, MessageFlags } = require('discord.js');
const pokemonStore = require('../../store/pokemonStore');
const accountStore = require('../../store/accountStore');
const { errorContainer, successContainer } = require('../../utils/componentBuilder');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('pokegift')
        .setDescription('Gift a Pokémon to another trainer')
        .addUserOption(opt => opt.setName('user').setDescription('Who to gift to').setRequired(true))
        .addStringOption(opt => opt.setName('pokemon').setDescription('Pokémon name to gift').setRequired(true)),
    aliases: ['gift'],

    async execute(interaction) {
        const targetUser = interaction.options.getUser('user');
        const pokemonName = interaction.options.getString('pokemon');
        if (targetUser.id === interaction.user.id) {
            return interaction.reply({ components: [errorContainer('Error', "You can't gift to yourself!")], flags: MessageFlags.IsComponentsV2 | MessageFlags.Ephemeral });
        }

        const fromId = await accountStore.resolveUserId(interaction.user.id);
        const toId = await accountStore.resolveUserId(targetUser.id);
        const result = await pokemonStore.giftPokemon(fromId, toId, pokemonName);

        if (!result.success) {
            return interaction.reply({ components: [errorContainer('Gift Failed', `You don't own **${pokemonName}**!`)], flags: MessageFlags.IsComponentsV2 | MessageFlags.Ephemeral });
        }

        const container = successContainer('Gift Sent! 🎁',
            `📦 **${result.pokemon.name}** (Lv. ${result.pokemon.level})\n` +
            `👤 **From:** ${interaction.user.username}\n` +
            `👤 **To:** ${targetUser.username}\n\n` +
            `> *The Pokémon has been transferred!*`
        );
        await interaction.reply({ components: [container], flags: MessageFlags.IsComponentsV2 });
    },
};
