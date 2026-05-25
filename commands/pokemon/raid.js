/**
 * /raid — Global Raid Boss system with Components V2.
 */
const { SlashCommandBuilder, ContainerBuilder, TextDisplayBuilder, SeparatorBuilder, SeparatorSpacingSize, ActionRowBuilder, ButtonBuilder, ButtonStyle, MediaGalleryBuilder, MediaGalleryItemBuilder, MessageFlags } = require('discord.js');
const pokemonStore = require('../../store/pokemonStore');
const economyStore = require('../../store/economyStore');
const accountStore = require('../../store/accountStore');
const PokemonEntry = require('../../models/Pokemon');
const ActiveRaid = require('../../models/ActiveRaid');
const { COLORS, errorContainer, successContainer } = require('../../utils/componentBuilder');

// In-memory global raid state for Discord
let discordRaid = null;

module.exports = {
    data: new SlashCommandBuilder()
        .setName('raid')
        .setDescription('Join or view Global Raid Boss battles')
        .addSubcommand(sub => sub.setName('status').setDescription('View current raid status'))
        .addSubcommand(sub => sub.setName('enter').setDescription('Enter the raid with a Pokémon')
            .addStringOption(opt => opt.setName('pokemon').setDescription('Your fighter Pokémon').setRequired(true))),
    aliases: [],

    async execute(interaction, client, args) {
        const isInteraction = typeof interaction.isChatInputCommand === 'function' && interaction.isChatInputCommand();
        const author = isInteraction ? interaction.user : interaction.author;
        const userId = await accountStore.resolveUserId(author.id);

        let sub = 'status';
        if (isInteraction) {
            sub = interaction.options.getSubcommand();
        } else if (args && args[0]) {
            const rawSub = args[0].toLowerCase();
            if (rawSub === 'status' || rawSub === 'enter') sub = rawSub;
        }

        if (sub === 'status') {
            return this.showStatus(interaction);
        } else if (sub === 'enter') {
            return this.enterRaid(interaction, userId, args);
        }
    },

    async showStatus(interaction) {
        // Check DB for active raid (shared with WhatsApp)
        const raidDoc = await ActiveRaid.findOne({});
        if (!raidDoc) {
            return interaction.reply({
                components: [errorContainer('No Active Raid', 'No Global Raid is currently active.\n\n> Raids spawn hourly across all platforms!')],
                flags: MessageFlags.IsComponentsV2 | MessageFlags.Ephemeral,
            });
        }

        const boss = raidDoc.boss;
        const hpPct = Math.round((boss.hp / boss.maxHp) * 100);
        const filled = Math.round((boss.hp / boss.maxHp) * 10);
        const empty = 10 - filled;
        const hpBar = '█'.repeat(Math.max(0, filled)) + '░'.repeat(Math.max(0, empty));

        let participantsText = '';
        const participants = raidDoc.participants || [];
        if (participants.length === 0) {
            participantsText = '> No participants yet!';
        } else {
            const sorted = [...participants].sort((a, b) => b.damageDealt - a.damageDealt);
            for (let i = 0; i < sorted.length; i++) {
                const p = sorted[i];
                const medal = i === 0 ? '🥇' : i === 1 ? '🥈' : i === 2 ? '🥉' : `\`${i + 1}.\``;
                participantsText += `${medal} **${p.senderName}** — ${p.pokemonName}\n`;
                participantsText += `> ⚔️ ${p.damageDealt.toLocaleString()} dmg · 🔄 ${p.tries - 1} faints\n\n`;
            }
        }

        const container = new ContainerBuilder().setAccentColor(COLORS.RAID);
        container.addTextDisplayComponents(new TextDisplayBuilder().setContent(`## 🏟️ Global Raid Status`));

        if (boss.cardImage) {
            container.addMediaGalleryComponents(new MediaGalleryBuilder().addItems(new MediaGalleryItemBuilder().setURL(boss.cardImage)));
        }

        container.addSeparatorComponents(new SeparatorBuilder().setSpacing(SeparatorSpacingSize.Small).setDivider(true));
        container.addTextDisplayComponents(new TextDisplayBuilder().setContent(
            `🔴 **Boss:** ${boss.name} (Lv. ${boss.level})\n` +
            `❤️ **HP:** \`[${hpBar}]\` **${hpPct}%**\n` +
            `> ${boss.hp.toLocaleString()} / ${boss.maxHp.toLocaleString()} HP\n` +
            `🔖 **Type:** ${(boss.types || []).join(' / ')}\n\n` +
            `### 👥 Participants (${participants.length})\n${participantsText}`
        ));

        const row = new ActionRowBuilder().addComponents(
            new ButtonBuilder().setCustomId('raid_refresh').setLabel('🔄 Refresh').setStyle(ButtonStyle.Secondary),
        );

        const replyPayload = { components: [container, row], flags: MessageFlags.IsComponentsV2 };
        if (interaction.replied || interaction.deferred) {
            await interaction.editReply(replyPayload);
        } else {
            await interaction.reply(replyPayload);
        }
    },

    async enterRaid(interaction, userId, args) {
        const isInteraction = typeof interaction.isChatInputCommand === 'function' && interaction.isChatInputCommand();
        const author = isInteraction ? interaction.user : interaction.author;
        const pokemonName = isInteraction ? interaction.options.getString('pokemon') : args.slice(1).join(' ');

        if (!pokemonName) {
            return interaction.reply({
                components: [errorContainer('Missing Pokémon', 'Specify which Pokémon you want to enter: `!raid enter <pokemon>`')],
                flags: MessageFlags.IsComponentsV2 | MessageFlags.Ephemeral,
            });
        }

        // Check if raid is active
        const raidDoc = await ActiveRaid.findOne({});
        if (!raidDoc) {
            return interaction.reply({
                components: [errorContainer('No Raid', 'No Global Raid is currently active!')],
                flags: MessageFlags.IsComponentsV2 | MessageFlags.Ephemeral,
            });
        }

        // Check if already entered
        const existing = raidDoc.participants.find(p => p.userId === userId);
        if (existing) {
            return interaction.reply({
                components: [errorContainer('Already Entered', 'You\'ve already entered this raid!')],
                flags: MessageFlags.IsComponentsV2 | MessageFlags.Ephemeral,
            });
        }

        // Check raid pass
        const inventory = await economyStore.getInventory(userId);
        const raidPass = inventory.items.find(i => i.itemName === 'Raid Pass' && i.quantity > 0);
        if (!raidPass) {
            return interaction.reply({
                components: [errorContainer('No Raid Pass', 'Buy one: `/pokemart buy item:raid pass` (2,000 coins)')],
                flags: MessageFlags.IsComponentsV2 | MessageFlags.Ephemeral,
            });
        }

        // Check Pokemon ownership
        const ownedPokemon = await PokemonEntry.findOne({
            userId,
            pokemonName: { $regex: new RegExp(`^${pokemonName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`, 'i') }
        }).sort({ level: -1 });

        if (!ownedPokemon) {
            return interaction.reply({
                components: [errorContainer('Not Found', `You don't own **${pokemonName}**!`)],
                flags: MessageFlags.IsComponentsV2 | MessageFlags.Ephemeral,
            });
        }

        // Consume raid pass
        await economyStore.removeInventoryItem(userId, 'Raid Pass', 1);

        // Load pokemon data
        const pkmnData = pokemonStore.getStaticData(ownedPokemon.pokemonName) || {
            hp: 70, baseStats: { atk: 60, def: 55, speed: 50 }, types: ['Normal'],
            attacks: [{ name: 'Tackle', power: 40, type: 'Normal' }]
        };

        const scale = (base, lvl) => Math.floor(base * (1 + lvl / 50));
        const maxHp = scale(parseInt(pkmnData.hp || 70), ownedPokemon.level);

        const displayName = `${author.username} [Discord]`;

        // Add to raid via atomic push to prevent cross-platform race conditions
        const newParticipant = {
            userId,
            senderName: displayName,
            pokemonName: ownedPokemon.pokemonName,
            damageDealt: 0,
            tries: 1,
            joinOrder: Date.now(),
            fighter: {
                name: ownedPokemon.pokemonName,
                level: ownedPokemon.level,
                maxHp, hp: maxHp,
                atk: scale(pkmnData.baseStats?.atk || 60, ownedPokemon.level),
                def: scale(pkmnData.baseStats?.def || 55, ownedPokemon.level),
                speed: scale(pkmnData.baseStats?.speed || 50, ownedPokemon.level),
                types: pkmnData.types || ['Normal'],
                attacks: pkmnData.attacks || [{ name: 'Tackle', power: 40, type: 'Normal' }],
            },
        };

        await ActiveRaid.findOneAndUpdate({}, { $push: { participants: newParticipant } });

        const container = new ContainerBuilder().setAccentColor(COLORS.SUCCESS)
            .addTextDisplayComponents(new TextDisplayBuilder().setContent(`## 🎟️ Raid Entry Accepted!`))
            .addSeparatorComponents(new SeparatorBuilder().setSpacing(SeparatorSpacingSize.Small).setDivider(true))
            .addTextDisplayComponents(new TextDisplayBuilder().setContent(
                `👤 **Trainer:** ${author.username}\n` +
                `⚔️ **Fighter:** ${ownedPokemon.pokemonName} (Lv. ${ownedPokemon.level})\n` +
                `❤️ **HP:** ${maxHp}\n\n` +
                `> You've joined the Global Co-op Raid!\n> Use \`/raid status\` to check progress.`
            ));

        await interaction.reply({ components: [container], flags: MessageFlags.IsComponentsV2 });
    },

    async handleButton(interaction) {
        if (interaction.customId === 'raid_refresh') {
            await interaction.deferUpdate();
            await this.showStatus(interaction);
        }
    },
};
