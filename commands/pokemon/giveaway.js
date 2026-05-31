/**
 * /giveaway — Start a customized giveaway in the server (Father Only).
 *
 * Subcommands:
 *   /giveaway start pokecoins <amount> <minutes>
 *   /giveaway start crystal <amount> <minutes>
 *   /giveaway start item <name> <amount> <minutes>
 *   /giveaway enter — Enter an active giveaway
 */

const {
    SlashCommandBuilder, ContainerBuilder, TextDisplayBuilder, SeparatorBuilder,
    SeparatorSpacingSize, ActionRowBuilder, ButtonBuilder, ButtonStyle,
    MessageFlags, SectionBuilder, ThumbnailBuilder,
} = require('discord.js');
const giveawayStore = require('../../store/giveawayStore');
const accountStore = require('../../store/accountStore');
const { COLORS, EMOJIS, errorContainer, successContainer } = require('../../utils/componentBuilder');
const { FATHER_DISCORD_ID } = require('../../store/tosStore');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('giveaway')
        .setDescription('Celestia Giveaway System')
        .addSubcommand(sub =>
            sub.setName('start')
                .setDescription('Start a giveaway (Father Only)')
                .addStringOption(opt =>
                    opt.setName('type')
                        .setDescription('Prize type')
                        .setRequired(true)
                        .addChoices(
                            { name: 'PokéCoins', value: 'pokecoins' },
                            { name: 'Radiant Crystals', value: 'crystal' },
                            { name: 'Item', value: 'item' },
                        )
                )
                .addIntegerOption(opt =>
                    opt.setName('amount')
                        .setDescription('Prize amount (coins, crystals, or item quantity)')
                        .setRequired(true)
                        .setMinValue(1)
                )
                .addIntegerOption(opt =>
                    opt.setName('duration')
                        .setDescription('Duration in minutes')
                        .setRequired(true)
                        .setMinValue(1)
                        .setMaxValue(1440)
                )
                .addStringOption(opt =>
                    opt.setName('item_name')
                        .setDescription('Item name (only for item type)')
                        .setRequired(false)
                )
        )
        .addSubcommand(sub =>
            sub.setName('enter')
                .setDescription('Enter the active giveaway in this server')
        ),
    aliases: ['gstart', 'giveawaystart', 'genter'],

    async execute(interaction, client, args) {
        const isInteraction = typeof interaction.isChatInputCommand === 'function' && interaction.isChatInputCommand();
        const author = isInteraction ? interaction.user : interaction.author;
        const subcommand = isInteraction ? interaction.options.getSubcommand(true) : (args?.[0]?.toLowerCase() || 'enter');

        if (subcommand === 'start') {
            return handleStart(interaction, client, author, isInteraction, args);
        }

        if (subcommand === 'enter') {
            return handleEnter(interaction, client, author);
        }
    },

    async handleButton(interaction) {
        const customId = interaction.customId;

        if (customId === 'giveaway_enter') {
            try {
                if (!interaction.deferred && !interaction.replied) {
                    await interaction.deferReply({ flags: MessageFlags.IsComponentsV2 | MessageFlags.Ephemeral });
                }
            } catch (e) { return; }

            const author = interaction.user;
            return handleEnter(interaction, client, author);
        }
    },
};

async function handleStart(interaction, client, author, isInteraction, args) {
    // Only Father can start giveaways
    if (author.id !== FATHER_DISCORD_ID) {
        return interaction.reply({
            components: [errorContainer('Access Denied', `Only **Father Cyber** can command a Celestia Giveaway! 👑`)],
            flags: MessageFlags.IsComponentsV2 | MessageFlags.Ephemeral,
        });
    }

    const guildId = interaction.guildId;
    if (!guildId) {
        return interaction.reply({
            components: [errorContainer('Server Only', `Giveaways can only be started in servers.`)],
            flags: MessageFlags.IsComponentsV2 | MessageFlags.Ephemeral,
        });
    }

    if (giveawayStore.hasActiveGiveaway(guildId)) {
        return interaction.reply({
            components: [errorContainer('Already Running', `A giveaway is already running in this server!`)],
            flags: MessageFlags.IsComponentsV2 | MessageFlags.Ephemeral,
        });
    }

    let type, amount, timeMinutes, itemName;

    if (isInteraction) {
        type = interaction.options.getString('type');
        amount = interaction.options.getInteger('amount');
        timeMinutes = interaction.options.getInteger('duration');
        itemName = interaction.options.getString('item_name');
    } else {
        // Text command fallback: !giveaway start pokecoins 5000 10
        if (!args || args.length < 4) {
            return interaction.reply({
                components: [errorContainer('Invalid Syntax', `Usage:\n\`/giveaway start type:pokecoins amount:5000 duration:10\``)],
                flags: MessageFlags.IsComponentsV2,
            });
        }
        type = args[1]?.toLowerCase();
        amount = parseInt(args[2]);
        timeMinutes = parseInt(args[args.length - 1]);
        if (type === 'item') {
            itemName = args.slice(2, args.length - 2).join(' ');
            amount = parseInt(args[args.length - 2]);
        }
    }

    if (type === 'item' && !itemName) {
        return interaction.reply({
            components: [errorContainer('Missing Item Name', `Specify the item name with the \`item_name\` option.`)],
            flags: MessageFlags.IsComponentsV2 | MessageFlags.Ephemeral,
        });
    }

    const prize = type === 'item'
        ? { type: 'item', amount, itemName }
        : { type, amount };

    const fatherResolvedId = await accountStore.resolveUserId(author.id);
    const channelId = interaction.channelId;

    const startResult = await giveawayStore.startGiveaway(guildId, channelId, prize, timeMinutes, client, fatherResolvedId);

    if (!startResult.success) {
        return interaction.reply({
            components: [errorContainer('Failed to Start', startResult.reason)],
            flags: MessageFlags.IsComponentsV2 | MessageFlags.Ephemeral,
        });
    }

    let prizeDescription = '';
    if (prize.type === 'pokecoins') {
        prizeDescription = `${EMOJIS.COIN} **${prize.amount.toLocaleString()} PokéCoins**`;
    } else if (prize.type === 'crystal') {
        prizeDescription = `${EMOJIS.CRYSTAL} **${prize.amount.toLocaleString()} Radiant Crystals**`;
    } else if (prize.type === 'item') {
        prizeDescription = `🎁 **${prize.amount}x ${prize.itemName}**`;
    }

    const section = new SectionBuilder();
    section.addTextDisplayComponents(
        new TextDisplayBuilder().setContent(
            `✨ *The Divine Father Cyber has declared a Giveaway!*\n\n` +
            `👑 **Host:** Father Cyber\n` +
            `🎁 **Grand Prize:** ${prizeDescription}\n` +
            `⏳ **Duration:** ${timeMinutes} Minute(s)\n\n` +
            `> Click the button below or use \`/giveaway enter\` to participate!`
        )
    );
    section.setThumbnailAccessory(new ThumbnailBuilder().setURL(author.displayAvatarURL({ size: 128 })));

    const container = new ContainerBuilder()
        .setAccentColor(COLORS.GOLD)
        .addTextDisplayComponents(new TextDisplayBuilder().setContent(`## 🎉 Supreme Celestia Giveaway!`))
        .addSeparatorComponents(new SeparatorBuilder().setSpacing(SeparatorSpacingSize.Small).setDivider(true))
        .addSectionComponents(section)
        .addSeparatorComponents(new SeparatorBuilder().setSpacing(SeparatorSpacingSize.Small).setDivider(true))
        .addTextDisplayComponents(new TextDisplayBuilder().setContent(
            `-# 💫 Hurry and enter before the portal closes!`
        ));

    const row = new ActionRowBuilder().addComponents(
        new ButtonBuilder()
            .setCustomId('giveaway_enter')
            .setEmoji('🎉')
            .setLabel('Enter Giveaway!')
            .setStyle(ButtonStyle.Success),
    );

    return interaction.reply({
        components: [container, row],
        flags: MessageFlags.IsComponentsV2,
    });
}

async function handleEnter(interaction, client, author) {
    const guildId = interaction.guildId;
    if (!guildId) {
        return interaction.reply({
            components: [errorContainer('Server Only', `Giveaways only work in servers.`)],
            flags: MessageFlags.IsComponentsV2 | MessageFlags.Ephemeral,
        });
    }

    if (!giveawayStore.hasActiveGiveaway(guildId)) {
        return interaction.reply({
            components: [errorContainer('No Active Giveaway', `There is no active giveaway in this server right now.`)],
            flags: MessageFlags.IsComponentsV2 | MessageFlags.Ephemeral,
        });
    }

    const resolvedUserId = await accountStore.resolveUserId(author.id);
    const result = giveawayStore.enterParticipant(guildId, resolvedUserId, author.username);

    if (!result.success) {
        if (result.reason === 'already_entered') {
            return interaction.reply({
                components: [errorContainer('Already Entered', `You have already entered this giveaway, **${author.username}**! 🎰`)],
                flags: MessageFlags.IsComponentsV2 | MessageFlags.Ephemeral,
            });
        }
        return interaction.reply({
            components: [errorContainer('Failed', `Could not enter giveaway: ${result.reason}`)],
            flags: MessageFlags.IsComponentsV2 | MessageFlags.Ephemeral,
        });
    }

    const section = new SectionBuilder();
    section.addTextDisplayComponents(
        new TextDisplayBuilder().setContent(
            `🎟️ **${author.username}** has entered the giveaway!\n\n` +
            `👥 **Total Participants:** ${result.count}\n\n` +
            `> *Good luck, trainer! The winner will be announced when the timer ends.* 🍀`
        )
    );
    section.setThumbnailAccessory(new ThumbnailBuilder().setURL(author.displayAvatarURL({ size: 128 })));

    const container = new ContainerBuilder()
        .setAccentColor(COLORS.SUCCESS)
        .addTextDisplayComponents(new TextDisplayBuilder().setContent(`## ✅ Giveaway Entry Confirmed!`))
        .addSeparatorComponents(new SeparatorBuilder().setSpacing(SeparatorSpacingSize.Small).setDivider(true))
        .addSectionComponents(section);

    return interaction.reply({
        components: [container],
        flags: MessageFlags.IsComponentsV2 | MessageFlags.Ephemeral,
    });
}
