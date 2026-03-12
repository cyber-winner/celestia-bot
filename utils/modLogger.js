const { ContainerBuilder, TextDisplayBuilder, MessageFlags, SeparatorBuilder, SeparatorSpacingSize, SectionBuilder, ThumbnailBuilder } = require('discord.js');
const Guild = require('../models/Guild');
const ModLog = require('../models/ModLog');

/**
 * Logs a moderation action to the designated modlog channel and database.
 * @param {Object} options Options for logging
 * @param {import('discord.js').Guild} options.guild The Discord Guild
 * @param {import('discord.js').User} options.user The Target User
 * @param {import('discord.js').User} options.moderator The Moderator User
 * @param {String} options.action The action taken ('BAN', 'KICK', 'TIMEOUT', 'QUARANTINE', 'SANITIZE', 'UNBAN')
 * @param {String} options.reason The reason for the action
 * @param {String} [options.duration] Optional duration string
 * @param {String} [options.proof] Optional proof URL/text
 * @param {Number} [options.color] Color for the embed (default: 0x5865f2)
 * @param {String} [options.emoji] Emoji for the title (e.g. '🔨')
 */
async function logModerationAction({ guild, user, moderator, action, reason, duration = null, proof = null, color = 0x5865f2, emoji = '🛡️' }) {
    // Save to Database
    await ModLog.create({
        guildId: guild.id,
        userId: user.id,
        moderatorId: moderator.id,
        action,
        reason,
        duration,
        proof
    });

    // Fetch Guild Settings to get the mod log channel
    const settings = await Guild.findOne({ guildId: guild.id });
    if (!settings || !settings.logChannel) return; // Note: using logChannel or modLogChannel

    // Prefer modLogChannel if exists, otherwise fallback to logChannel
    const logChannelId = settings.modLogChannel || settings.logChannel;
    if (!logChannelId) return;

    const channel = guild.channels.cache.get(logChannelId);
    if (!channel) return;

    // Build the V2 log container
    const container = new ContainerBuilder()
        .setAccentColor(color)
        .addTextDisplayComponents(
            new TextDisplayBuilder().setContent(`## ${emoji}  ModLog: ${action}`)
        )
        .addSeparatorComponents(
            new SeparatorBuilder().setSpacing(SeparatorSpacingSize.Small).setDivider(true)
        )
        .addSectionComponents(
            new SectionBuilder()
                .addTextDisplayComponents(
                    new TextDisplayBuilder().setContent(
                        `**User:** ${user.tag} \`(${user.id})\`\n` +
                        `**Moderator:** ${moderator.tag} \`(${moderator.id})\`\n` +
                        `**Reason:** ${reason}` +
                        (duration ? `\n**Duration:** ${duration}` : '') +
                        (proof ? `\n**Proof:** [Link](${proof})` : '')
                    )
                )
                .setThumbnailAccessory(
                    new ThumbnailBuilder().setURL(user.displayAvatarURL({ size: 64 }))
                )
        )
        .addSeparatorComponents(
            new SeparatorBuilder().setSpacing(SeparatorSpacingSize.Small).setDivider(false)
        )
        .addTextDisplayComponents(
            new TextDisplayBuilder().setContent(
                `📅 **Date:** <t:${Math.floor(Date.now() / 1000)}:F>`
            )
        );

    try {
        await channel.send({
            components: [container],
            flags: MessageFlags.IsComponentsV2
        });
    } catch (error) {
        console.error(`[ModLogger] Failed to send log to channel ${logChannelId} in guild ${guild.id}:`, error);
    }
}

module.exports = { logModerationAction };
