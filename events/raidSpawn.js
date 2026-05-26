/**
 * Raid Spawn Handler — Spawns raid bosses hourly in the designated raid channel.
 * Uses Components V2 with premium layouts.
 * After a raid ends (boss HP → 0), a new one auto-spawns.
 */
const {
    Events,
    ContainerBuilder,
    TextDisplayBuilder,
    SeparatorBuilder,
    SeparatorSpacingSize,
    MediaGalleryBuilder,
    MediaGalleryItemBuilder,
    ActionRowBuilder,
    ButtonBuilder,
    ButtonStyle,
    MessageFlags,
} = require('discord.js');
const cron = require('node-cron');
const pokemonStore = require('../store/pokemonStore');
const ActiveRaid = require('../models/ActiveRaid');
const { COLORS, getTypeColor, getRankBadge } = require('../utils/componentBuilder');

const RAID_CHANNEL_ID = '1508737759978852490';

// In-memory reference to the raid message for live editing
let raidMessageRef = null;

/**
 * Pick a random Legendary/Mythical Pokémon as a raid boss.
 * Falls back to a random high-level Pokémon if none found.
 */
function pickRaidBoss() {
    const legendaries = pokemonStore.POKEMON_LIST.filter(
        p => p.isLegendary || p.isMythical
    );
    const pool = legendaries.length > 0 ? legendaries : pokemonStore.POKEMON_LIST;
    const pkmn = pool[Math.floor(Math.random() * pool.length)];

    const bs = pkmn.baseStats || { hp: 80, atk: 80, def: 80, spAtk: 80, spDef: 80, speed: 80 };
    const level = Math.floor(Math.random() * 20) + 80; // Level 80-100
    const hpMultiplier = 100; // Raid bosses have 100× HP
    const maxHp = Math.round((parseInt(pkmn.hp) || (bs.hp * 2 + 100)) * hpMultiplier);

    return {
        id: pkmn.id,
        name: pkmn.name,
        hp: maxHp,
        maxHp,
        level,
        def: bs.def || 80,
        atk: bs.atk || 80,
        types: pkmn.types || ['Normal'],
        attacks: (pkmn.attacks || []).slice(0, 4),
        cardImage: pkmn.cardImage || null,
        spriteUrl: pkmn.spriteUrl || null,
        description: pkmn.description || 'A fearsome raid boss!',
        isLegendary: pkmn.isLegendary || false,
        isMythical: pkmn.isMythical || false,
        genus: pkmn.genus || 'Pokémon',
        baseStats: bs,
    };
}

/**
 * Build the premium raid spawn container.
 */
function buildRaidContainer(boss, participants = []) {
    const typeColor = getTypeColor(boss.types);
    const container = new ContainerBuilder().setAccentColor(typeColor);

    // ── Title ──
    let rarityLabel = '';
    if (boss.isMythical) rarityLabel = '✨ MYTHICAL';
    else if (boss.isLegendary) rarityLabel = '👑 LEGENDARY';
    else rarityLabel = '⚔️ EPIC';

    container.addTextDisplayComponents(
        new TextDisplayBuilder().setContent(
            `## 🏟️ RAID BOSS SPAWNED!`
        )
    );

    container.addSeparatorComponents(
        new SeparatorBuilder().setSpacing(SeparatorSpacingSize.Small).setDivider(true)
    );

    // ── Boss details ──
    const hpPct = Math.round((boss.hp / boss.maxHp) * 100);
    const filled = Math.round((boss.hp / boss.maxHp) * 20);
    const empty = 20 - filled;
    const hpBar = '█'.repeat(Math.max(0, filled)) + '░'.repeat(Math.max(0, empty));
    const typeStr = (boss.types || []).join(' / ');
    const rankBadge = getRankBadge(boss.level);

    let detailsText = '';
    detailsText += `<:Pokemon:1508753880782209085> **Boss:** ${boss.name}\n`;
    detailsText += `📊 **Level:** ${boss.level} — ${rankBadge}\n`;
    detailsText += `⭐ **Rarity:** ${rarityLabel}\n`;
    detailsText += `🔖 **Type:** ${typeStr}\n`;
    detailsText += `\n❤️ **HP:** \`[${hpBar}]\` **${hpPct}%**\n`;
    detailsText += `> ${boss.hp.toLocaleString()} / ${boss.maxHp.toLocaleString()} HP\n`;

    if (boss.baseStats) {
        const bs = boss.baseStats;
        detailsText += `\n**Base Stats:**\n`;
        detailsText += `> ⚔️ ATK: \`${bs.atk}\` · 🛡️ DEF: \`${bs.def}\` · 💨 SPD: \`${bs.speed}\`\n`;
        detailsText += `> ✨ SP.ATK: \`${bs.spAtk}\` · <a:crystal:1508755858211864596> SP.DEF: \`${bs.spDef}\` · ❤️ HP: \`${bs.hp}\`\n`;
    }

    container.addTextDisplayComponents(new TextDisplayBuilder().setContent(detailsText));

    container.addSeparatorComponents(
        new SeparatorBuilder().setSpacing(SeparatorSpacingSize.Small).setDivider(true)
    );

    // ── Boss image ──
    if (boss.cardImage) {
        container.addMediaGalleryComponents(
            new MediaGalleryBuilder().addItems(
                new MediaGalleryItemBuilder().setURL(boss.cardImage)
            )
        );

        container.addSeparatorComponents(
            new SeparatorBuilder().setSpacing(SeparatorSpacingSize.Small).setDivider(true)
        );
    }

    // ── Description ──
    if (boss.description) {
        container.addTextDisplayComponents(
            new TextDisplayBuilder().setContent(`> *${boss.description.substring(0, 300)}*`)
        );

        container.addSeparatorComponents(
            new SeparatorBuilder().setSpacing(SeparatorSpacingSize.Small).setDivider(true)
        );
    }

    // ── Participants ──
    let participantsText = `### 👥 Raid Participants (${participants.length})\n`;
    if (participants.length === 0) {
        participantsText += '> No trainers have joined yet! Be the first!\n';
    } else {
        const sorted = [...participants].sort((a, b) => b.damageDealt - a.damageDealt);
        for (let i = 0; i < Math.min(sorted.length, 10); i++) {
            const p = sorted[i];
            const medal = i === 0 ? '🥇' : i === 1 ? '🥈' : i === 2 ? '🥉' : `\`${i + 1}.\``;
            participantsText += `${medal} **${p.senderName}** — ${p.pokemonName} (⚔️ ${p.damageDealt.toLocaleString()} dmg)\n`;
        }
        if (sorted.length > 10) {
            participantsText += `> ...and ${sorted.length - 10} more trainers\n`;
        }
    }
    container.addTextDisplayComponents(new TextDisplayBuilder().setContent(participantsText));

    container.addSeparatorComponents(
        new SeparatorBuilder().setSpacing(SeparatorSpacingSize.Small).setDivider(true)
    );

    // ── Footer ──
    container.addTextDisplayComponents(
        new TextDisplayBuilder().setContent(
            `-# <a:RaidPasses:1508756029259911239> Requires a Raid Pass (2,000 coins from PokéMart) • 🏆 Top trainer gets a premium variant!`
        )
    );

    return container;
}

/**
 * Build the action row for raid buttons.
 */
function buildRaidButtons() {
    return new ActionRowBuilder().addComponents(
        new ButtonBuilder()
            .setCustomId('raid_join')
                .setEmoji('⚔️')
                .setLabel('Join Raid')
            .setStyle(ButtonStyle.Success),
        new ButtonBuilder()
            .setCustomId('raid_status_btn')
                .setEmoji('📊')
                .setLabel('Status')
            .setStyle(ButtonStyle.Primary),
        new ButtonBuilder()
            .setCustomId('raid_refresh')
                .setEmoji('🔄')
                .setLabel('Refresh')
            .setStyle(ButtonStyle.Secondary),
    );
}

/**
 * Spawn a new raid and send it to the channel.
 */
async function spawnRaid(client) {
    try {
        const channel = await client.channels.fetch(RAID_CHANNEL_ID).catch(() => null);
        if (!channel) {
            console.error('[Raid] Cannot find raid channel:', RAID_CHANNEL_ID);
            return;
        }

        // Clear any existing raid
        await ActiveRaid.deleteMany({});

        const boss = pickRaidBoss();
        const raidDoc = await ActiveRaid.create({
            boss,
            participants: [],
            groupIds: [RAID_CHANNEL_ID],
        });

        const container = buildRaidContainer(boss);
        const buttons = buildRaidButtons();

        const sentMsg = await channel.send({
            components: [container, buttons],
            flags: MessageFlags.IsComponentsV2,
        });

        raidMessageRef = {
            messageId: sentMsg.id,
            channelId: channel.id,
        };

        console.log(`[Raid] Spawned raid boss: ${boss.name} (Lv. ${boss.level}) — HP: ${boss.maxHp.toLocaleString()}`);
    } catch (err) {
        console.error('[Raid] Spawn error:', err);
    }
}

/**
 * Update the raid message with latest participant data.
 */
async function updateRaidMessage(client) {
    if (!raidMessageRef) return;
    try {
        const channel = await client.channels.fetch(raidMessageRef.channelId);
        const msg = await channel.messages.fetch(raidMessageRef.messageId);
        const raidDoc = await ActiveRaid.findOne({});
        if (!raidDoc) return;

        const container = buildRaidContainer(raidDoc.boss, raidDoc.participants);
        const buttons = buildRaidButtons();

        await msg.edit({
            components: [container, buttons],
            flags: MessageFlags.IsComponentsV2,
        });
    } catch (err) {
        console.error('[Raid] Update message error:', err.message);
    }
}

/**
 * Force spawn a raid in a specific channel.
 */
async function forceSpawnRaid(client, channelId) {
    try {
        const channel = await client.channels.fetch(channelId).catch(() => null);
        if (!channel) return;

        // Clear any existing raid
        await ActiveRaid.deleteMany({});

        const boss = pickRaidBoss();
        const raidDoc = await ActiveRaid.create({
            boss,
            participants: [],
            groupIds: [channelId],
        });

        const container = buildRaidContainer(boss);
        const buttons = buildRaidButtons();
        container.addActionRowComponents(buttons);

        const sentMsg = await channel.send({
            components: [container],
            flags: MessageFlags.IsComponentsV2,
        });

        raidMessageRef = {
            messageId: sentMsg.id,
            channelId: channel.id,
        };

        console.log(`[Raid] Force spawned raid boss: ${boss.name} in ${channel.name}`);
    } catch (err) {
        console.error('[Raid] Force spawn error:', err);
    }
}

module.exports = {
    name: Events.ClientReady,
    once: true,
    async execute(client) {
        console.log('[Raid] Initializing raid spawn system...');

        // Check if a raid already exists in DB
        const existing = await ActiveRaid.findOne({});
        if (!existing) {
            // Spawn initial raid on startup
            await spawnRaid(client);
        } else {
            console.log(`[Raid] Existing raid found: ${existing.boss.name}`);
        }

        // Schedule hourly raid spawns (every hour at :00)
        cron.schedule('0 * * * *', async () => {
            console.log('[Raid] Hourly raid spawn triggered');
            await spawnRaid(client);
        });
    },

    // Exported for use by raid command
    spawnRaid,
    forceSpawnRaid,
    updateRaidMessage,
    buildRaidContainer,
    buildRaidButtons,
    raidMessageRef: () => raidMessageRef,
    setRaidMessageRef: (ref) => { raidMessageRef = ref; },
};
