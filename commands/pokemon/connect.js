/**
 * /connect — Cross-platform account linking (Discord ↔ WhatsApp).
 */
const { SlashCommandBuilder, ContainerBuilder, TextDisplayBuilder, SeparatorBuilder, SeparatorSpacingSize, MessageFlags } = require('discord.js');
const accountStore = require('../../store/accountStore');
const { COLORS, errorContainer, successContainer } = require('../../utils/componentBuilder');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('connect')
        .setDescription('Link your Discord and WhatsApp accounts')
        .addSubcommand(sub =>
            sub.setName('whatsapp')
                .setDescription('Generate OTP to link your WhatsApp account')
                .addStringOption(opt =>
                    opt.setName('otp').setDescription('OTP from WhatsApp (if linking from WhatsApp first)').setRequired(false)
                )
        ),
    aliases: [],

    async execute(interaction) {
        const sub = interaction.options.getSubcommand();

        if (sub === 'whatsapp') {
            const otp = interaction.options.getString('otp');

            // ─── Case 1: User has OTP from WhatsApp → complete the link ───
            if (otp) {
                const result = await accountStore.completeLinkFromDiscord(otp, interaction.user.id, interaction.user.username);
                if (!result.success) {
                    return interaction.reply({
                        components: [errorContainer('Invalid OTP',
                            `The OTP **${otp}** is invalid or expired.\n\n` +
                            `> Generate a new one in WhatsApp with \`-discord connect\``)],
                        flags: MessageFlags.IsComponentsV2 | MessageFlags.Ephemeral,
                    });
                }

                const container = new ContainerBuilder()
                    .setAccentColor(COLORS.SUCCESS)
                    .addTextDisplayComponents(new TextDisplayBuilder().setContent(`## 🔗 Account Linked!`))
                    .addSeparatorComponents(new SeparatorBuilder().setSpacing(SeparatorSpacingSize.Small).setDivider(true))
                    .addTextDisplayComponents(new TextDisplayBuilder().setContent(
                        `✅ **Successfully linked!**\n\n` +
                        `🎮 **Discord:** ${interaction.user.username}\n` +
                        `📱 **WhatsApp:** Connected\n` +
                        `🏷️ **Display Name:** ${result.displayName}\n\n` +
                        `> Your progress is now synced across both platforms!\n` +
                        `> Cooldowns, inventory, and Pokémon are shared.`
                    ));

                return interaction.reply({ components: [container], flags: MessageFlags.IsComponentsV2 | MessageFlags.Ephemeral });
            }

            // ─── Case 2: Generate OTP for Discord → WhatsApp linking ───
            const result = await accountStore.initiateDiscordLink(interaction.user.id, interaction.user.username);
            if (!result.success) {
                if (result.reason === 'already_linked') {
                    return interaction.reply({
                        components: [errorContainer('Already Linked', 'Your account is already linked to WhatsApp!')],
                        flags: MessageFlags.IsComponentsV2 | MessageFlags.Ephemeral,
                    });
                }
            }

            const container = new ContainerBuilder()
                .setAccentColor(COLORS.CELESTIA)
                .addTextDisplayComponents(new TextDisplayBuilder().setContent(`## 🔗 Connect WhatsApp`))
                .addSeparatorComponents(new SeparatorBuilder().setSpacing(SeparatorSpacingSize.Small).setDivider(true))
                .addTextDisplayComponents(new TextDisplayBuilder().setContent(
                    `📱 **Your OTP:** \`${result.otp}\`\n\n` +
                    `**Steps to link:**\n` +
                    `1. Open WhatsApp and go to **Celestia's DM**\n` +
                    `2. Type: \`-connect ${result.otp}\`\n` +
                    `3. Done! Your accounts will be synced.\n\n` +
                    `⏰ **Expires in 5 minutes.**\n\n` +
                    `> After linking, your Pokémon, coins, and progress\n` +
                    `> will be shared across both platforms!`
                ));

            return interaction.reply({ components: [container], flags: MessageFlags.IsComponentsV2 | MessageFlags.Ephemeral });
        }
    },
};
