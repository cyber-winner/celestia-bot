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

    async execute(interaction, client, args) {
        const isInteraction = typeof interaction.isChatInputCommand === 'function' && interaction.isChatInputCommand();
        const author = isInteraction ? interaction.user : interaction.author;
        const targetUser = isInteraction ? interaction.options.getUser('user') : interaction.mentions?.users?.first();

        let pokemonName = null;
        if (isInteraction) {
            pokemonName = interaction.options.getString('pokemon');
        } else if (args && args.length > 0) {
            const nonMention = args.find(a => !a.startsWith('<@') && !a.endsWith('>'));
            if (nonMention) pokemonName = nonMention;
        }

        if (!targetUser || !pokemonName) {
            return interaction.reply({
                components: [errorContainer('Invalid Gift', 'Specify a trainer and a Pokémon name: `!pokegift @User <pokemon>`')],
                flags: MessageFlags.IsComponentsV2 | MessageFlags.Ephemeral,
            });
        }

        if (targetUser.id === author.id) {
            return interaction.reply({ components: [errorContainer('Error', "You can't gift to yourself!")], flags: MessageFlags.IsComponentsV2 | MessageFlags.Ephemeral });
        }

        const fromId = await accountStore.resolveUserId(author.id);
        const toId = await accountStore.resolveUserId(targetUser.id);
        const result = await pokemonStore.giftPokemon(fromId, toId, pokemonName);

        if (!result.success) {
            return interaction.reply({ components: [errorContainer('Gift Failed', `You don't own **${pokemonName}**!`)], flags: MessageFlags.IsComponentsV2 | MessageFlags.Ephemeral });
        }

        const container = successContainer('Gift Sent! 🎁',
            `📦 **${result.pokemon.name}** (Lv. ${result.pokemon.level})\n` +
            `👤 **From:** ${author.username}\n` +
            `👤 **To:** ${targetUser.username}\n\n` +
            `> *The Pokémon has been transferred!*`
        );
        await interaction.reply({ components: [container], flags: MessageFlags.IsComponentsV2 });
    },
};
