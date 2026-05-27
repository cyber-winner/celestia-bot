/**
 * /prestige — Prestige your account to reset levels and multiply stats with interactive Buttons.
 */

const { SlashCommandBuilder, ContainerBuilder, TextDisplayBuilder, SeparatorBuilder, SeparatorSpacingSize, ActionRowBuilder, ButtonBuilder, ButtonStyle, MessageFlags } = require('discord.js');
const economyStore = require('../../store/economyStore');
const accountStore = require('../../store/accountStore');
const { COLORS, errorContainer } = require('../../utils/componentBuilder');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('prestige')
        .setDescription('Reset your Pokémon levels to Lv.1 in exchange for stats multiplier and higher level caps.'),
    aliases: ['pres'],

    async execute(interaction, client, args) {
        const isInteraction = typeof interaction.isChatInputCommand === 'function' && interaction.isChatInputCommand();
        const author = isInteraction ? interaction.user : interaction.author;

        if (isInteraction) {
            await interaction.deferReply({ flags: MessageFlags.IsComponentsV2 });
        }

        try {
            const dbUserId = await accountStore.resolveUserId(author.id);
            const eligibility = await economyStore.checkPrestigeEligibility(dbUserId);
            const reqs = eligibility.requirements;

            if (!eligibility.eligible) {
                let failMsg = '';
                switch (eligibility.reason) {
                    case 'insufficient_dex':
                        failMsg = `📖 **Total Pokémon Caught:** ${eligibility.have} / ${reqs.minDex}`;
                        break;
                    case 'insufficient_leveled':
                        failMsg = `📊 **Lv.${reqs.minPokemonLevel}+ Pokémon:** ${eligibility.have} / ${reqs.minLeveledPokemon}`;
                        break;
                    case 'insufficient_coins':
                        failMsg = `💰 **PokéCoins in Wallet:** ${eligibility.have.toLocaleString()} / ${reqs.minCoins.toLocaleString()}`;
                        break;
                }

                const container = new ContainerBuilder().setAccentColor(COLORS.DANGER)
                    .addTextDisplayComponents(new TextDisplayBuilder().setContent(`## ❌ Prestige — Not Eligible`))
                    .addSeparatorComponents(new SeparatorBuilder().setSpacing(SeparatorSpacingSize.Small).setDivider(true))
                    .addTextDisplayComponents(new TextDisplayBuilder().setContent(
                        `👤 **Trainer:** ${author.username}\n\n` +
                        `**Status:** ${failMsg}\n\n` +
                        `### 📋 Requirements for Prestige:\n` +
                        `*   📖 **${reqs.minDex}** total Pokémon caught\n` +
                        `*   📊 **${reqs.minLeveledPokemon}** Pokémon at **Lv.${reqs.minPokemonLevel}+**\n` +
                        `*   💰 **${reqs.minCoins.toLocaleString()}** PokéCoins in wallet`
                    ))
                    .addSeparatorComponents(new SeparatorBuilder().setSpacing(SeparatorSpacingSize.Small).setDivider(true));

                if (isInteraction) {
                    return interaction.editReply({ components: [container], flags: MessageFlags.IsComponentsV2 });
                } else {
                    return interaction.reply({ components: [container], flags: MessageFlags.IsComponentsV2 });
                }
            }

            // Trainer IS eligible! Show warning and ask for confirmation using Components V2 buttons.
            const container = new ContainerBuilder().setAccentColor(COLORS.WARNING)
                .addTextDisplayComponents(new TextDisplayBuilder().setContent(`## ⚡ Prestige Confirmation`))
                .addSeparatorComponents(new SeparatorBuilder().setSpacing(SeparatorSpacingSize.Small).setDivider(true))
                .addTextDisplayComponents(new TextDisplayBuilder().setContent(
                    `👤 **Trainer:** ${author.username}\n\n` +
                    `⚠️ **This action is permanent and will do the following:**\n` +
                    `*   Reset **ALL** Pokémon levels back to **Lv.1**\n` +
                    `*   Deduct 💰 **${reqs.minCoins.toLocaleString()}** PokéCoins\n` +
                    `*   Multiply all Pokémon stats by **×5** (stacking)\n` +
                    `*   Unlock Pokémon Level Cap up to **Lv.${100 + ((eligibility.wallet?.prestigeLevel || 0) + 1) * 100}**\n` +
                    `*   Reset all catch, summon, and claim cooldowns\n\n` +
                    `-# ⚠️ Click **Confirm** below to proceed. This cannot be undone!`
                ))
                .addSeparatorComponents(new SeparatorBuilder().setSpacing(SeparatorSpacingSize.Small).setDivider(true));

            const confirmBtn = new ButtonBuilder()
                .setCustomId(`prestige_confirm_${author.id}`)
                .setLabel('Confirm')
                .setStyle(ButtonStyle.Success);

            const cancelBtn = new ButtonBuilder()
                .setCustomId(`prestige_cancel_${author.id}`)
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
                if (i.customId === `prestige_confirm_${author.id}`) {
                    const result = await economyStore.performPrestige(dbUserId);

                    if (!result.success) {
                        const errBox = errorContainer('Prestige Failed', result.reason);
                        return i.update({ components: [errBox], flags: MessageFlags.IsComponentsV2 });
                    }

                    const successBox = new ContainerBuilder().setAccentColor(COLORS.SUCCESS)
                        .addTextDisplayComponents(new TextDisplayBuilder().setContent(`## ✨ Prestige Complete! ✨`))
                        .addSeparatorComponents(new SeparatorBuilder().setSpacing(SeparatorSpacingSize.Small).setDivider(true))
                        .addTextDisplayComponents(new TextDisplayBuilder().setContent(
                            `👤 **Trainer:** ${author.username}\n\n` +
                            `🌟 **Prestige Level:** ${result.newPrestige}\n` +
                            `🔓 **New Level Cap:** Lv.${result.newLevelCap}\n` +
                            `💰 **Coins Spent:** ${result.coinsDeducted.toLocaleString()}\n` +
                            `📊 **All Pokémon:** Reset to Lv.1\n` +
                            `⚡ **Stats Multiplier:** ×${result.newPrestige * 5}\n\n` +
                            `━━━━━━━━━━━━━━━━━━━━━━━━━\n` +
                            `✅ All cooldowns have been reset!\n` +
                            `━━━━━━━━━━━━━━━━━━━━━━━━━\n\n` +
                            `_~A new chapter begins!~_ 🔥`
                        ));

                    await i.update({ components: [successBox], flags: MessageFlags.IsComponentsV2 });
                    collector.stop('completed');
                } else if (i.customId === `prestige_cancel_${author.id}`) {
                    const cancelBox = new ContainerBuilder().setAccentColor(COLORS.DANGER)
                        .addTextDisplayComponents(new TextDisplayBuilder().setContent(`## ❌ Prestige Cancelled`))
                        .addSeparatorComponents(new SeparatorBuilder().setSpacing(SeparatorSpacingSize.Small).setDivider(true))
                        .addTextDisplayComponents(new TextDisplayBuilder().setContent(`Prestige ritual cancelled by user.`));

                    await i.update({ components: [cancelBox], flags: MessageFlags.IsComponentsV2 });
                    collector.stop('cancelled');
                }
            });

            collector.on('end', async (collected, reason) => {
                if (reason === 'time') {
                    const timeoutBox = new ContainerBuilder().setAccentColor(COLORS.DANGER)
                        .addTextDisplayComponents(new TextDisplayBuilder().setContent(`## ⏳ Prestige Timed Out`))
                        .addSeparatorComponents(new SeparatorBuilder().setSpacing(SeparatorSpacingSize.Small).setDivider(true))
                        .addTextDisplayComponents(new TextDisplayBuilder().setContent(`Prestige request timed out after 60 seconds.`));

                    if (isInteraction) {
                        await interaction.editReply({ components: [timeoutBox], flags: MessageFlags.IsComponentsV2 }).catch(() => {});
                    } else {
                        await msgReply.edit({ components: [timeoutBox], flags: MessageFlags.IsComponentsV2 }).catch(() => {});
                    }
                }
            });

        } catch (err) {
            console.error('[Prestige Command] Error:', err);
            const errBox = errorContainer('Error', 'Failed to perform prestige due to database error.');
            if (isInteraction) {
                await interaction.editReply({ components: [errBox], flags: MessageFlags.IsComponentsV2 });
            } else {
                await interaction.reply({ components: [errBox], flags: MessageFlags.IsComponentsV2 });
            }
        }
    }
};
