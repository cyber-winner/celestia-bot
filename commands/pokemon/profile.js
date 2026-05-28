/**
 * /profile — Premium Trainer Profile slash command.
 * Displays level, XP, level cap, prestige level, omega level, legendary/mythical catches,
 * total Pokémon caught, unique species caught, highest pokemon level, and complete net worth with Components V2.
 */

const { SlashCommandBuilder, ContainerBuilder, TextDisplayBuilder, SeparatorBuilder, SeparatorSpacingSize, ThumbnailBuilder, MessageFlags } = require('discord.js');
const economyStore = require('../../store/economyStore');
const accountStore = require('../../store/accountStore');
const { COLORS } = require('../../utils/componentBuilder');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('profile')
        .setDescription('View your premium Trainer Profile and accomplishments.')
        .addUserOption(opt => opt.setName('user').setDescription('View another trainer\'s profile')),
    aliases: ['p', 'trainer', 'trainerprofile'],

    async execute(interaction, client, args) {
        const isInteraction = typeof interaction.isChatInputCommand === 'function' && interaction.isChatInputCommand();
        
        let targetUser;
        if (isInteraction) {
            targetUser = interaction.options.getUser('user') || interaction.user;
        } else {
            targetUser = interaction.mentions?.users?.first() || interaction.author || interaction.user;
        }


        try {
            const dbUserId = await accountStore.resolveUserId(targetUser.id);
            const profile = await economyStore.getUserProfile(dbUserId);

            // Compute XP progression
            const currentLevel = profile.userLevel;
            const nextLevel = currentLevel + 1;
            
            const totalXPForCurrent = 25 * (currentLevel - 1) * (currentLevel + 2);
            const totalXPForNext = 25 * (nextLevel - 1) * (nextLevel + 2);
            
            const levelXpNeeded = totalXPForNext - totalXPForCurrent;
            const levelXpAccumulated = profile.userXP - totalXPForCurrent;
            
            let xpBar = '';
            if (levelXpNeeded > 0) {
                const percentage = Math.min(1.0, Math.max(0, levelXpAccumulated / levelXpNeeded));
                const filledBlocks = Math.round(percentage * 10);
                const emptyBlocks = 10 - filledBlocks;
                xpBar = '█'.repeat(filledBlocks) + '░'.repeat(emptyBlocks) + ` ${Math.round(percentage * 100)}%`;
            } else {
                xpBar = '█'.repeat(10) + ' 100%';
            }

            const container = new ContainerBuilder().setAccentColor(COLORS.CELESTIA);
            
            // Thumbnail avatar
            if (targetUser.displayAvatarURL) {
                container.setThumbnailAccessory(new ThumbnailBuilder().setURL(targetUser.displayAvatarURL({ size: 256 })));
            }

            container.addTextDisplayComponents(
                new TextDisplayBuilder().setContent(`## 🔮 Trainer Card: ${targetUser.username}`)
            );

            container.addSeparatorComponents(
                new SeparatorBuilder().setSpacing(SeparatorSpacingSize.Small).setDivider(true)
            );

            container.addTextDisplayComponents(
                new TextDisplayBuilder().setContent(
                    `### ⚡ Trainer Rankings\n` +
                    `*   🛡️ **Trainer Level:** Lv. ${profile.userLevel}\n` +
                    `*   📈 **Experience:** ${profile.userXP.toLocaleString()} XP\n` +
                    `    ↳ \`[${xpBar}]\`\n` +
                    `*   👑 **Prestige Level:** ${profile.prestigeLevel}\n` +
                    `*   🌌 **Omega Level:** ${profile.omegaLevel}\n` +
                    `*   🎯 **Pokémon Level Cap:** Lv. ${profile.levelCap}\n\n` +
                    `### 🪙 Economy & Net Worth\n` +
                    `*   🪙 **Wallet Balance:** ${profile.pokecoins.toLocaleString()} PokéCoins\n` +
                    `*   💎 **Radiant Crystals:** ${profile.radiantCrystals.toLocaleString()} Crystals\n` +
                    `*   🔮 **Total Net Worth:** **${profile.netWorth.toLocaleString()} PokéCoins** 💎\n` +
                    `    _-# Includes: Coins + Crystals worth + Item values + Pokeballs * 25_\n\n` +
                    `### 📦 Pokédex Stats & Medals\n` +
                    `*   🔴 **Total Pokémon:** ${profile.totalPokemon} caught\n` +
                    `*   🗂️ **Unique Species:** ${profile.uniquePokemon} variety\n` +
                    `*   🏅 **Highest Pokémon Level:** Lv. ${profile.bestLevel}\n` +
                    `*   👑 **Legendaries Caught:** ${profile.legendariesCaught}\n` +
                    `*   ✨ **Mythicals Caught:** ${profile.mythicalsCaught}`
                )
            );

            container.addSeparatorComponents(
                new SeparatorBuilder().setSpacing(SeparatorSpacingSize.Small).setDivider(true)
            );

            container.addTextDisplayComponents(
                new TextDisplayBuilder().setContent(`✨ _"Prestige to reset levels and multiply your stats! Climb to Omega Status!"_`)
            );

            if (isInteraction) {
                await interaction.editReply({ components: [container], flags: MessageFlags.IsComponentsV2 });
            } else {
                await interaction.reply({ components: [container], flags: MessageFlags.IsComponentsV2 });
            }

        } catch (err) {
            console.error('[Discord Profile Command] Error:', err);
            const errBox = new ContainerBuilder().setAccentColor(0xFF3333)
                .addTextDisplayComponents(new TextDisplayBuilder().setContent(`❌ **Failed to retrieve trainer profile due to database error.**`));
            
            if (isInteraction) {
                await interaction.editReply({ components: [errBox], flags: MessageFlags.IsComponentsV2 });
            } else {
                await interaction.reply({ components: [errBox], flags: MessageFlags.IsComponentsV2 });
            }
        }
    }
};
