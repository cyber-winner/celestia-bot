/**
 * /catch — Catch a wild spawned Pokémon via slash command.
 */
const { SlashCommandBuilder, ContainerBuilder, TextDisplayBuilder, SeparatorBuilder, SeparatorSpacingSize, MediaGalleryBuilder, MediaGalleryItemBuilder, MessageFlags } = require('discord.js');
const pokemonStore = require('../../store/pokemonStore');
const accountStore = require('../../store/accountStore');
const { COLORS, getTypeColor, getRankBadge, errorContainer } = require('../../utils/componentBuilder');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('catch')
        .setDescription('Catch a wild or summoned Pokémon')
        .addStringOption(opt => opt.setName('name').setDescription('Name of the Pokémon').setRequired(true)),
    aliases: [],

    async execute(interaction) {
        const guessedName = interaction.options.getString('name');
        const channelId = interaction.channelId;
        const userId = await accountStore.resolveUserId(interaction.user.id);

        // ─── Case 1: Check for summoned spawn first ───
        const summonedSpawn = pokemonStore.getSummonedSpawn(channelId);
        if (summonedSpawn) {
            if (summonedSpawn.summonerId !== userId) {
                return interaction.reply({
                    components: [errorContainer('Locked', 'Only the summoner can catch a summoned Pokémon!')],
                    flags: MessageFlags.IsComponentsV2 | MessageFlags.Ephemeral,
                });
            }

            const result = await pokemonStore.attemptSummonCatch(channelId, userId, guessedName);
            return handleSummonCatchResult(interaction, result, summonedSpawn);
        }

        // ─── Case 2: Normal wild spawn catch ───
        const result = await pokemonStore.attemptCatch(channelId, userId, guessedName);

        if (result.success) {
            const p = result.pokemon;
            const typeColor = getTypeColor(p.types);
            const rankBadge = getRankBadge(p.level);
            let rarityTag = '⬜ Common';
            if (p.isLegendary) rarityTag = '👑 LEGENDARY';
            else if (p.isMythical) rarityTag = '✨ MYTHICAL';

            const container = new ContainerBuilder().setAccentColor(typeColor);
            container.addTextDisplayComponents(new TextDisplayBuilder().setContent(`## 🎉 Pokémon Captured!`));

            if (p.cardImage) {
                container.addMediaGalleryComponents(new MediaGalleryBuilder().addItems(new MediaGalleryItemBuilder().setURL(p.cardImage)));
            }

            container.addSeparatorComponents(new SeparatorBuilder().setSpacing(SeparatorSpacingSize.Small).setDivider(true));

            let statsText = `👤 **Trainer:** ${interaction.user.username}\n`;
            statsText += `🏷️ **Pokémon:** ${p.name}\n`;
            statsText += `📊 **Level:** ${p.level} — ${rankBadge}\n`;
            statsText += `⭐ **Rarity:** ${rarityTag}\n`;
            statsText += `🔖 **Type:** ${(p.types || []).join(' / ')}\n\n`;
            statsText += `💰 **+${result.coinReward} PokéCoins**`;
            if (result.crystalReward > 0) statsText += ` · 💎 **+${result.crystalReward} Crystals**`;
            statsText += `\n💼 Wallet: ${result.totalCoins.toLocaleString()} coins\n`;
            statsText += `🔴 Pokéballs: ${result.remainingBalls} remaining`;

            container.addTextDisplayComponents(new TextDisplayBuilder().setContent(statsText));

            await interaction.reply({ components: [container], flags: MessageFlags.IsComponentsV2 });
        } else {
            const msgs = {
                no_spawn: "No wild Pokémon is currently spawned in this channel.",
                wrong_name: "That's not the right Pokémon name!",
                no_pokeballs: "You don't have enough Pokéballs! Buy more: `/pokemart buy item:pokeball`",
                too_fast: "You tried to catch too quickly! Try again in a few seconds.",
                pokelocked: `Wait for the pokelock penalty to expire before catching again.`,
                catch_cooldown: `Skip some spawns before trying to catch another Pokémon.`,
            };
            
            const msg = msgs[result.reason] || "Catch attempt failed.";
            await interaction.reply({
                components: [errorContainer('Catch Failed', msg)],
                flags: MessageFlags.IsComponentsV2 | MessageFlags.Ephemeral,
            });
        }
    },
};

async function handleSummonCatchResult(interaction, result, summonedSpawn) {
    if (result.success) {
        const p = result.pokemon;
        const container = new ContainerBuilder().setAccentColor(COLORS.CELESTIA);
        container.addTextDisplayComponents(new TextDisplayBuilder().setContent(`## 🕯️ Summoned Pokémon Captured!`));
        if (p.cardImage) {
            container.addMediaGalleryComponents(new MediaGalleryBuilder().addItems(new MediaGalleryItemBuilder().setURL(p.cardImage)));
        }
        container.addSeparatorComponents(new SeparatorBuilder().setSpacing(SeparatorSpacingSize.Small).setDivider(true));
        container.addTextDisplayComponents(new TextDisplayBuilder().setContent(
            `🏷️ **${p.name}** (Lv. ${p.level})\n` +
            `🎲 Catch Chance: ${Math.round(result.catchChance * 100)}%\n` +
            `💰 +${result.coinReward} coins\n🔴 Balls: ${result.remainingBalls}`
        ));
        await interaction.reply({ components: [container], flags: MessageFlags.IsComponentsV2 });
    } else {
        const msgs = {
            summon_ball_failed: result.despawned 
                ? `The summoned **${result.pokemonName}** vanished!\n🔴 Balls: ${result.remainingBalls}`
                : `The summoned **${result.pokemonName}** broke free!\n🎯 Tries: ${result.triesLeft}/3\n🔴 Balls: ${result.remainingBalls}`,
            wrong_name: `The summoned Pokémon is **${summonedSpawn.name}**!`,
            no_pokeballs: `Need 2 Pokéballs to attempt catching a summoned Pokémon, but you only have ${result.have}.`,
        };
        const msg = msgs[result.reason] || "Summon catch attempt failed.";
        await interaction.reply({
            components: [errorContainer(result.despawned ? 'Vanished' : 'Attempt Failed', msg)],
            flags: MessageFlags.IsComponentsV2 | (result.despawned ? MessageFlags.None : MessageFlags.Ephemeral),
        });
    }
}
