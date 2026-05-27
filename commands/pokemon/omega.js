/**
 * /omega — Ascend to Omega tier with interactive confirmation buttons.
 */

const { SlashCommandBuilder, ContainerBuilder, TextDisplayBuilder, SeparatorBuilder, SeparatorSpacingSize, ActionRowBuilder, ButtonBuilder, ButtonStyle, MessageFlags } = require('discord.js');
const economyStore = require('../../store/economyStore');
const accountStore = require('../../store/accountStore');
const { COLORS, errorContainer } = require('../../utils/componentBuilder');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('omega')
        .setDescription('Ascend to Omega tier — resets everything but grants ultimate stats multipliers and caps.'),
    aliases: ['omg'],

    async execute(interaction, client, args) {
        const isInteraction = typeof interaction.isChatInputCommand === 'function' && interaction.isChatInputCommand();
        const author = isInteraction ? interaction.user : interaction.author;

        if (isInteraction) {
            await interaction.deferReply({ flags: MessageFlags.IsComponentsV2 });
        }

        try {
            const dbUserId = await accountStore.resolveUserId(author.id);
            const eligibility = await economyStore.checkOmegaEligibility(dbUserId);
            const reqs = eligibility.requirements;

            if (!eligibility.eligible) {
                let failMsg = '';
                switch (eligibility.reason) {
                    case 'insufficient_prestige':
                        failMsg = `🌟 **Prestige Level:** ${eligibility.have} / ${reqs.minPrestige}`;
                        break;
                    case 'insufficient_coins':
                        failMsg = `💰 **PokéCoins:** ${eligibility.have.toLocaleString()} / ${reqs.minCoins.toLocaleString()}`;
                        break;
                    case 'insufficient_pokemon':
                        failMsg = `📦 **Total Pokémon:** ${eligibility.have} / ${reqs.minTotalPokemon}`;
                        break;
                    case 'insufficient_leveled':
                        failMsg = `📊 **Lv.${reqs.minPokemonLevel}+ Pokémon:** ${eligibility.have} / ${reqs.minLeveledPokemon}`;
                        break;
                }

                const container = new ContainerBuilder().setAccentColor(COLORS.DANGER)
                    .addTextDisplayComponents(new TextDisplayBuilder().setContent(`## ❌ Omega — Not Eligible`))
                    .addSeparatorComponents(new SeparatorBuilder().setSpacing(SeparatorSpacingSize.Small).setDivider(true))
                    .addTextDisplayComponents(new TextDisplayBuilder().setContent(
                        `👤 **Trainer:** ${author.username}\n\n` +
                        `**Status:** ${failMsg}\n\n` +
                        `### 📋 Requirements for Omega Ascension:\n` +
                        `*   🌟 **Prestige Level ${reqs.minPrestige}** or above\n` +
                        `*   💰 **${reqs.minCoins.toLocaleString()}** PokéCoins in wallet\n` +
                        `*   📊 **${reqs.minLeveledPokemon}** Pokémon at **Lv.${reqs.minPokemonLevel}+**\n` +
                        `*   📦 **${reqs.minTotalPokemon}** total Pokémon caught`
                    ))
                    .addSeparatorComponents(new SeparatorBuilder().setSpacing(SeparatorSpacingSize.Small).setDivider(true));

                if (isInteraction) {
                    return interaction.editReply({ components: [container], flags: MessageFlags.IsComponentsV2 });
                } else {
                    return interaction.reply({ components: [container], flags: MessageFlags.IsComponentsV2 });
                }
            }

            // Trainer IS eligible! Show ascension warning.
            const container = new ContainerBuilder().setAccentColor(COLORS.WARNING)
                .addTextDisplayComponents(new TextDisplayBuilder().setContent(`## 🔮 Omega Ascension Confirmation`))
                .addSeparatorComponents(new SeparatorBuilder().setSpacing(SeparatorSpacingSize.Small).setDivider(true))
                .addTextDisplayComponents(new TextDisplayBuilder().setContent(
                    `👤 **Trainer:** ${author.username}\n\n` +
                    `⚠️ **THIS IS A TOTAL RESET! PLEASE READ CAREFULLY:**\n\n` +
                    `💥 **This action will permanently reset:**\n` +
                    `*   Reset all **PokéCoins** to **0**\n` +
                    `*   Wipe Pokéballs and Level Orbs from inventory\n` +
                    `*   💎 **PRESERVED:** All **Radiant Crystals** are kept!\n` +
                    `*   🧭 **PRESERVED:** All **Wishing Compasses** are kept!\n` +
                    `*   Reset your Prestige level back to **0**\n` +
                    `*   Reset **ALL** Pokémon levels back to **Lv.1**\n\n` +
                    `🔓 **In return, you will gain:**\n` +
                    `*   Unlock Pokémon Level Cap up to **Lv.${((eligibility.wallet?.omegaLevel || 0) + 1) * 1000 + 100}**\n` +
                    `*   Multiply all stats by **×5** (stacking)\n` +
                    `*   Allows you to use up to **5 Summoning Candles per day**\n` +
                    `*   Reset all catch, summon, and claim cooldowns\n\n` +
                    `-# ⚠️ Click **Confirm** to undergo complete Ascension. This cannot be undone!`
                ))
                .addSeparatorComponents(new SeparatorBuilder().setSpacing(SeparatorSpacingSize.Small).setDivider(true));

            const confirmBtn = new ButtonBuilder()
                .setCustomId(`omega_confirm_${author.id}`)
                .setLabel('Confirm Ascension')
                .setStyle(ButtonStyle.Success);

            const cancelBtn = new ButtonBuilder()
                .setCustomId(`omega_cancel_${author.id}`)
                .setLabel('Cancel')
                .setStyle(ButtonStyle.Danger);

            const row = new ActionRowBuilder().addComponents(confirmBtn, cancelBtn);
            container.addActionRowComponents(row);

            let msgReply;
            if (isInteraction) {
                msgReply = await interaction.editReply({ components: [container], flags: MessageFlags.IsComponentsV2 });
            } else {
                msgReply = await interaction.reply({ components: [container], flags: MessageFlags.IsComponentsV2 });
            }

            const filter = i => i.user.id === author.id;
            const collector = msgReply.createMessageComponentCollector({ filter, time: 60000 });

            collector.on('collect', async i => {
                if (i.customId === `omega_confirm_${author.id}`) {
                    const result = await economyStore.performOmega(dbUserId);

                    if (!result.success) {
                        const errBox = errorContainer('Omega Ascension Failed', result.reason);
                        return i.update({ components: [errBox], flags: MessageFlags.IsComponentsV2 });
                    }

                    const successBox = new ContainerBuilder().setAccentColor(COLORS.SUCCESS)
                        .addTextDisplayComponents(new TextDisplayBuilder().setContent(`## 🔮 OMEGA ASCENSION COMPLETE! 🔮`))
                        .addSeparatorComponents(new SeparatorBuilder().setSpacing(SeparatorSpacingSize.Small).setDivider(true))
                        .addTextDisplayComponents(new TextDisplayBuilder().setContent(
                            `👤 **Trainer:** ${author.username}\n\n` +
                            `🌌 **Omega Level:** ${result.newOmega}\n` +
                            `🔓 **New Level Cap:** Lv.${result.newLevelCap}\n` +
                            `⚡ **Stats Multiplier:** ×${result.newOmega * 5}\n` +
                            `🕯️ **Daily Summons:** ${result.summonCandlesPerDay}\n\n` +
                            `━━━━━━━━━━━━━━━━━━━━━━━━━\n` +
                            `💥 PokéCoins reset. Level Orbs and Pokéballs cleared. Pokémon reset to Lv.1.\n` +
                            `💎 Radiant Crystals and Wishing Compasses were fully preserved!\n` +
                            `✅ All cooldowns reset.\n` +
                            `━━━━━━━━━━━━━━━━━━━━━━━━━\n\n` +
                            `_~You have transcended beyond mortal limits.~_ 🌌✨`
                        ));

                    await i.update({ components: [successBox], flags: MessageFlags.IsComponentsV2 });
                    collector.stop('completed');
                } else if (i.customId === `omega_cancel_${author.id}`) {
                    const cancelBox = new ContainerBuilder().setAccentColor(COLORS.DANGER)
                        .addTextDisplayComponents(new TextDisplayBuilder().setContent(`## ❌ Ascension Cancelled`))
                        .addSeparatorComponents(new SeparatorBuilder().setSpacing(SeparatorSpacingSize.Small).setDivider(true))
                        .addTextDisplayComponents(new TextDisplayBuilder().setContent(`Ascension ritual cancelled by user.`));

                    await i.update({ components: [cancelBox], flags: MessageFlags.IsComponentsV2 });
                    collector.stop('cancelled');
                }
            });

            collector.on('end', async (collected, reason) => {
                if (reason === 'time') {
                    const timeoutBox = new ContainerBuilder().setAccentColor(COLORS.DANGER)
                        .addTextDisplayComponents(new TextDisplayBuilder().setContent(`## ⏳ Ascension Timed Out`))
                        .addSeparatorComponents(new SeparatorBuilder().setSpacing(SeparatorSpacingSize.Small).setDivider(true))
                        .addTextDisplayComponents(new TextDisplayBuilder().setContent(`Ascension request timed out after 60 seconds.`));

                    if (isInteraction) {
                        await interaction.editReply({ components: [timeoutBox], flags: MessageFlags.IsComponentsV2 }).catch(() => {});
                    } else {
                        await msgReply.edit({ components: [timeoutBox], flags: MessageFlags.IsComponentsV2 }).catch(() => {});
                    }
                }
            });

        } catch (err) {
            console.error('[Omega Command] Error:', err);
            const errBox = errorContainer('Error', 'Failed to perform ascension due to database error.');
            if (isInteraction) {
                await interaction.editReply({ components: [errBox], flags: MessageFlags.IsComponentsV2 });
            } else {
                await interaction.reply({ components: [errBox], flags: MessageFlags.IsComponentsV2 });
            }
        }
    }
};
