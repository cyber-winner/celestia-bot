/**
 * /fight — Turn-based PvP Pokémon battle with Components V2.
 */
const { 
    SlashCommandBuilder, 
    ContainerBuilder, 
    TextDisplayBuilder, 
    SeparatorBuilder, 
    SeparatorSpacingSize, 
    ActionRowBuilder, 
    ButtonBuilder, 
    ButtonStyle, 
    MediaGalleryBuilder, 
    MediaGalleryItemBuilder, 
    MessageFlags 
} = require('discord.js');
const PokemonEntry = require('../../models/Pokemon');
const pokemonStore = require('../../store/pokemonStore');
const accountStore = require('../../store/accountStore');
const economyStore = require('../../store/economyStore');
const battleStore = require('../../store/battleStore');
const { COLORS, errorContainer, getTypeColor } = require('../../utils/componentBuilder');

// In-memory active challenges: Map<channelId, challengeData>
const activeChallenges = new Map();

// Type effectiveness chart
const TYPE_CHART = {
    Fire: { Grass: 1.5, Ice: 1.5, Bug: 1.5, Steel: 1.5, Water: 0.5, Fire: 0.5, Rock: 0.5, Dragon: 0.5 },
    Water: { Fire: 1.5, Ground: 1.5, Rock: 1.5, Water: 0.5, Grass: 0.5, Dragon: 0.5 },
    Grass: { Water: 1.5, Ground: 1.5, Rock: 1.5, Fire: 0.5, Grass: 0.5, Poison: 0.5, Flying: 0.5, Bug: 0.5, Dragon: 0.5, Steel: 0.5 },
    Electric: { Water: 1.5, Flying: 1.5, Grass: 0.5, Electric: 0.5, Dragon: 0.5, Ground: 0 },
    Ice: { Grass: 1.5, Ground: 1.5, Flying: 1.5, Dragon: 1.5, Steel: 0.5, Fire: 0.5, Water: 0.5, Ice: 0.5 },
    Fighting: { Normal: 1.5, Ice: 1.5, Rock: 1.5, Dark: 1.5, Steel: 1.5, Poison: 0.5, Flying: 0.5, Psychic: 0.5, Bug: 0.5, Fairy: 0.5, Ghost: 0 },
    Poison: { Grass: 1.5, Fairy: 1.5, Poison: 0.5, Ground: 0.5, Rock: 0.5, Ghost: 0.5, Steel: 0 },
    Ground: { Fire: 1.5, Electric: 1.5, Poison: 1.5, Rock: 1.5, Steel: 1.5, Grass: 0.5, Bug: 0.5, Flying: 0 },
    Flying: { Grass: 1.5, Fighting: 1.5, Bug: 1.5, Electric: 0.5, Rock: 0.5, Steel: 0.5 },
    Psychic: { Fighting: 1.5, Poison: 1.5, Psychic: 0.5, Steel: 0.5, Dark: 0 },
    Bug: { Grass: 1.5, Psychic: 1.5, Dark: 1.5, Fire: 0.5, Fighting: 0.5, Poison: 0.5, Flying: 0.5, Ghost: 0.5, Steel: 0.5, Fairy: 0.5 },
    Rock: { Fire: 1.5, Ice: 1.5, Flying: 1.5, Bug: 1.5, Fighting: 0.5, Ground: 0.5, Steel: 0.5 },
    Ghost: { Psychic: 1.5, Ghost: 1.5, Dark: 0.5, Normal: 0 },
    Dragon: { Dragon: 1.5, Steel: 0.5, Fairy: 0 },
    Dark: { Psychic: 1.5, Ghost: 1.5, Fighting: 0.5, Dark: 0.5, Fairy: 0.5 },
    Steel: { Ice: 1.5, Rock: 1.5, Fairy: 1.5, Steel: 0.5, Fire: 0.5, Water: 0.5, Electric: 0.5 },
    Fairy: { Fighting: 1.5, Dragon: 1.5, Dark: 1.5, Poison: 0.5, Steel: 0.5, Fire: 0.5 },
};

// Helper to filter damaging attacks from pokemon data
function getDamagingAttacks(pkmnData) {
    if (!pkmnData.attacks || !Array.isArray(pkmnData.attacks)) {
        return [{ name: 'Tackle', power: 40, accuracy: 100, type: 'Normal', flavorText: 'A physical charge attack.' }];
    }
    const damaging = pkmnData.attacks.filter(m => m && typeof m.power === 'number' && m.power > 0);
    return damaging.length > 0 ? damaging : [{ name: 'Tackle', power: 40, accuracy: 100, type: 'Normal', flavorText: 'A physical charge attack.' }];
}

// Damage calculation formula
function calculateDamage(attacker, defender, move) {
    const movePower = move.power || 40;
    const moveType = move.type || 'Normal';

    // Type Effectiveness
    let typeMult = 1.0;
    for (const defType of defender.types) {
        if (TYPE_CHART[moveType] && TYPE_CHART[moveType][defType] !== undefined) {
            typeMult *= TYPE_CHART[moveType][defType];
        }
    }

    // Critical Hit (10% chance)
    const isCrit = Math.random() < 0.10;
    const critMult = isCrit ? 1.5 : 1.0;

    // Variance
    const variance = Math.random() * 0.15 + 0.85;

    // Proportional formula based on level and attack/defense ratio
    const levelFactor = ((2 * attacker.level) / 5) + 2;
    const statRatio = attacker.atk / Math.max(10, defender.def);
    
    const baseDamage = Math.floor(((levelFactor * movePower * statRatio) / 25) + 8);
    const finalDamage = Math.floor(baseDamage * critMult * typeMult * variance);

    return {
        damage: Math.max(5, finalDamage),
        crit: isCrit,
        typeMult
    };
}

// HP Bar renderer helper
const renderHpBar = (char) => {
    const pct = char.hp / char.maxHp;
    const filledSize = Math.round(pct * 10);
    const emptySize = 10 - filledSize;
    const bar = '█'.repeat(Math.max(0, filledSize)) + '░'.repeat(Math.max(0, emptySize));
    const pctText = Math.round(pct * 100);
    return `\`[${bar}]\` **${pctText}%** (${char.hp}/${char.maxHp} HP)`;
};

// Combat board renderer using Components V2
function renderCombatBoard(battle, logText = '') {
    const container = new ContainerBuilder()
        .setAccentColor(COLORS.CELESTIA)
        .addTextDisplayComponents(new TextDisplayBuilder().setContent(`## 🏟️ Celestia Combat Stadium`))
        .addSeparatorComponents(new SeparatorBuilder().setSpacing(SeparatorSpacingSize.Small).setDivider(true));

    // Card images
    const images = [];
    if (battle.fighter1.cardImage) images.push(new MediaGalleryItemBuilder().setURL(battle.fighter1.cardImage));
    if (battle.fighter2.cardImage) images.push(new MediaGalleryItemBuilder().setURL(battle.fighter2.cardImage));
    if (images.length > 0) {
        const gallery = new MediaGalleryBuilder();
        images.forEach(img => gallery.addItems(img));
        container.addMediaGalleryComponents(gallery);
        container.addSeparatorComponents(new SeparatorBuilder().setSpacing(SeparatorSpacingSize.Small).setDivider(true));
    }

    // HP Bars
    container.addTextDisplayComponents(new TextDisplayBuilder().setContent(
        `🔴 **${battle.fighter1.trainerName}**'s ${battle.fighter1.name} (Lv. ${battle.fighter1.level})\n` +
        `HP: ${renderHpBar(battle.fighter1)}\n\n` +
        `🔵 **${battle.fighter2.trainerName}**'s ${battle.fighter2.name} (Lv. ${battle.fighter2.level})\n` +
        `HP: ${renderHpBar(battle.fighter2)}`
    ));

    container.addSeparatorComponents(new SeparatorBuilder().setSpacing(SeparatorSpacingSize.Small).setDivider(true));

    if (logText) {
        container.addTextDisplayComponents(new TextDisplayBuilder().setContent(logText));
        container.addSeparatorComponents(new SeparatorBuilder().setSpacing(SeparatorSpacingSize.Small).setDivider(true));
    }

    // Determine active turn/actor and options
    if (battle.phase === 'attack') {
        const activeFighter = battle.turn === 1 ? battle.fighter1 : battle.fighter2;
        const activeNum = battle.turn;

        container.addTextDisplayComponents(new TextDisplayBuilder().setContent(
            `👉 <@${activeFighter.discordId}>, **it's your turn to act!**\n` +
            `Choose an attack move or prepare a defensive shield.`
        ));

        const attackRow = new ActionRowBuilder();
        activeFighter.attacks.slice(0, 4).forEach((move, idx) => {
            attackRow.addComponents(
                new ButtonBuilder()
                    .setCustomId(`fight_atk_${idx}`)
                    .setLabel(move.name)
                    .setStyle(ButtonStyle.Primary)
            );
        });

        const defCooldown = battle.defenceCooldown[activeNum];
        const defenceRow = new ActionRowBuilder().addComponents(
            new ButtonBuilder()
                .setCustomId('fight_def')
                .setLabel(defCooldown > 0 ? `Defence 🛡️ (Cooldown: ${defCooldown}t)` : 'Defence 🛡️')
                .setStyle(ButtonStyle.Secondary)
                .setDisabled(defCooldown > 0)
        );

        container.addActionRowComponents(attackRow, defenceRow);
    } else if (battle.phase === 'respond') {
        const attacker = battle.turn === 1 ? battle.fighter1 : battle.fighter2;
        const defender = battle.turn === 1 ? battle.fighter2 : battle.fighter1;
        const defNum = battle.turn === 1 ? 2 : 1;

        container.addTextDisplayComponents(new TextDisplayBuilder().setContent(
            `⚔️ **${attacker.name}** used **${battle.lastAction.moveName}** against you!\n` +
            `👉 <@${defender.discordId}>, **how will you respond?**`
        ));

        const attackRow = new ActionRowBuilder();
        defender.attacks.slice(0, 4).forEach((move, idx) => {
            attackRow.addComponents(
                new ButtonBuilder()
                    .setCustomId(`fight_atk_${idx}`)
                    .setLabel(move.name)
                    .setStyle(ButtonStyle.Primary)
            );
        });

        const defCooldown = battle.defenceCooldown[defNum];
        const defenceRow = new ActionRowBuilder().addComponents(
            new ButtonBuilder()
                .setCustomId('fight_def')
                .setLabel(defCooldown > 0 ? `Defence 🛡️ (Cooldown: ${defCooldown}t)` : 'Defence 🛡️')
                .setStyle(ButtonStyle.Secondary)
                .setDisabled(defCooldown > 0)
        );

        container.addActionRowComponents(attackRow, defenceRow);
    }

    return { components: [container], flags: MessageFlags.IsComponentsV2 };
}

// Timeout handler when a player takes too long
async function handleTimeout(channelId, client) {
    const battle = battleStore.getBattle(channelId);
    if (!battle) return;

    battleStore.deleteBattle(channelId);

    const activeFighter = battle.phase === 'attack'
        ? (battle.turn === 1 ? battle.fighter1 : battle.fighter2)
        : (battle.turn === 1 ? battle.fighter2 : battle.fighter1);
        
    const opponentFighter = activeFighter.discordId === battle.fighter1.discordId ? battle.fighter2 : battle.fighter1;

    const channel = client.channels.cache.get(channelId) || await client.channels.fetch(channelId).catch(() => null);
    if (channel) {
        const msg = await channel.messages.fetch(battle.messageId).catch(() => null);
        if (msg) {
            const container = new ContainerBuilder()
                .setAccentColor(COLORS.WARNING)
                .addTextDisplayComponents(new TextDisplayBuilder().setContent(`## ⏰ Battle Timeout`))
                .addSeparatorComponents(new SeparatorBuilder().setSpacing(SeparatorSpacingSize.Small).setDivider(true))
                .addTextDisplayComponents(new TextDisplayBuilder().setContent(
                    `⏰ <@${activeFighter.discordId}> took too long to make a move (60s limit) and forfeited!\n\n` +
                    `🏆 **${opponentFighter.trainerName}**'s **${opponentFighter.name}** wins by forfeit!`
                ));
            await msg.edit({ components: [container], flags: MessageFlags.IsComponentsV2 }).catch(() => {});
        }
    }
}

// End of Battle results display and card swap
async function handleEndBattle(interaction, battle, logText, client) {
    const winner = battle.fighter1.hp > 0 ? battle.fighter1 : battle.fighter2;
    const loser = battle.fighter1.hp > 0 ? battle.fighter2 : battle.fighter1;

    // Award winner 10 XP
    try {
        await economyStore.addUserXP(winner.id, 10);
    } catch (xpErr) {
        console.error('[Fight XP Reward] Error:', xpErr);
    }

    let summaryText = 
        `🏆 **POKÉMON BATTLE OVER!** 🏆\n\n` +
        `🎉 **Winner:** <@${winner.discordId}> with **${winner.name}**!\n\n` +
        `━━━━━━━━━━━━━━━━━━━━━━━━━\n`;

    if (battle.isWager) {
        try {
            const loserCard = await PokemonEntry.findOne({
                userId: loser.id,
                pokemonName: loser.name,
                level: loser.level
            });

            if (loserCard) {
                loserCard.userId = winner.id;
                await loserCard.save();
                summaryText += `🚨 **WAGER TRANSFER SUCCESSFUL!**\n` +
                               `🎁 <@${winner.discordId}> has claimed the Level ${loser.level} **${loser.name}** from <@${loser.discordId}>! ⚠️ (+10 XP)`;
            } else {
                summaryText += `⚠️ *Wager transfer failed: card not found in database.*`;
            }
        } catch (dbErr) {
            console.error('[Wager db transfer error]:', dbErr);
            summaryText += `⚠️ *Wager database transfer error!*`;
        }
    } else {
        summaryText += `🎉 *Congratulations to the winner! Great battle!* (+10 XP)`;
    }

    const container = new ContainerBuilder()
        .setAccentColor(COLORS.CELESTIA)
        .addTextDisplayComponents(new TextDisplayBuilder().setContent(`## 🏆 Battle Over`))
        .addSeparatorComponents(new SeparatorBuilder().setSpacing(SeparatorSpacingSize.Small).setDivider(true));

    if (winner.cardImage) {
        container.addMediaGalleryComponents(
            new MediaGalleryBuilder().addItems(new MediaGalleryItemBuilder().setURL(winner.cardImage))
        );
        container.addSeparatorComponents(new SeparatorBuilder().setSpacing(SeparatorSpacingSize.Small).setDivider(true));
    }

    container.addTextDisplayComponents(new TextDisplayBuilder().setContent(
        `${logText}\n\n` +
        `${summaryText}`
    ));

    await interaction.update({ components: [container], flags: MessageFlags.IsComponentsV2 });
}

// Start battle after accepting challenge
async function startBattle(interaction, challenge, client) {
    const { challengerId, opponentId, challengerPokemon, challengerLevel, opponentPokemon, opponentLevel, isWager } = challenge;

    const challengerDbId = await accountStore.resolveUserId(challengerId);
    const opponentDbId = await accountStore.resolveUserId(opponentId);

    const p1Data = pokemonStore.getStaticData(challengerPokemon) || { hp: 70, baseStats: { atk: 60, def: 55, speed: 50 }, types: ["Normal"], attacks: [] };
    const p2Data = pokemonStore.getStaticData(opponentPokemon) || { hp: 70, baseStats: { atk: 60, def: 55, speed: 50 }, types: ["Normal"], attacks: [] };

    const scale = (base, lvl) => Math.floor(base * (1 + lvl / 50));
    
    const p1MaxHp = scale(parseInt(p1Data.hp || 70), challengerLevel);
    const p2MaxHp = scale(parseInt(p2Data.hp || 70), opponentLevel);

    const fighter1 = {
        id: challengerDbId,
        discordId: challengerId,
        trainerName: interaction.guild.members.cache.get(challengerId)?.user.username || 'Challenger',
        name: challengerPokemon,
        level: challengerLevel,
        maxHp: p1MaxHp,
        hp: p1MaxHp,
        atk: scale(p1Data.baseStats?.atk || 60, challengerLevel),
        def: scale(p1Data.baseStats?.def || 55, challengerLevel),
        speed: scale(p1Data.baseStats?.speed || 50, challengerLevel),
        types: p1Data.types || ["Normal"],
        attacks: getDamagingAttacks(p1Data),
        cardImage: p1Data.cardImage,
        defended: false
    };

    const fighter2 = {
        id: opponentDbId,
        discordId: opponentId,
        trainerName: interaction.user.username,
        name: opponentPokemon,
        level: opponentLevel,
        maxHp: p2MaxHp,
        hp: p2MaxHp,
        atk: scale(p2Data.baseStats?.atk || 60, opponentLevel),
        def: scale(p2Data.baseStats?.def || 55, opponentLevel),
        speed: scale(p2Data.baseStats?.speed || 50, opponentLevel),
        types: p2Data.types || ["Normal"],
        attacks: getDamagingAttacks(p2Data),
        cardImage: p2Data.cardImage,
        defended: false
    };

    const channelId = interaction.channelId;
    const battle = battleStore.createBattle(channelId, fighter1, fighter2);
    battle.isWager = isWager;

    const starter = battle.turn === 1 ? fighter1 : fighter2;
    const logText = `⚡ **Speed check selects ${starter.name} to strike first!**`;

    const payload = renderCombatBoard(battle, logText);
    await interaction.update(payload);

    const battleMsg = await interaction.fetchReply();
    battle.messageId = battleMsg.id;

    // Start 60s timeout timer
    battle.timeoutTimer = setTimeout(() => handleTimeout(channelId, client), 60000);
}

module.exports = {
    data: new SlashCommandBuilder()
        .setName('fight')
        .setDescription('PvP Pokémon Battle Arena!')
        .addSubcommand(sub =>
            sub.setName('challenge')
                .setDescription('Challenge a trainer to a standard friendly battle')
                .addUserOption(opt => opt.setName('opponent').setDescription('Who to fight').setRequired(true))
                .addStringOption(opt => opt.setName('your_pokemon').setDescription('Your Pokémon species').setRequired(true))
                .addStringOption(opt => opt.setName('their_pokemon').setDescription('Their Pokémon species').setRequired(true))
        )
        .addSubcommand(sub =>
            sub.setName('wager')
                .setDescription('Challenge a trainer to a high-stakes wager battle (loser loses their card)')
                .addUserOption(opt => opt.setName('opponent').setDescription('Who to fight').setRequired(true))
                .addStringOption(opt => opt.setName('your_pokemon').setDescription('Your Pokémon species').setRequired(true))
                .addStringOption(opt => opt.setName('their_pokemon').setDescription('Their Pokémon species').setRequired(true))
        ),
    aliases: ['battle', 'pvp'],

    async execute(interaction, client) {
        await interaction.deferReply({ flags: MessageFlags.IsComponentsV2 });

        const channelId = interaction.channelId;
        const subcommand = interaction.options.getSubcommand(true);
        const opponent = interaction.options.getUser('opponent');
        const myPokemonName = interaction.options.getString('your_pokemon');
        const theirPokemonName = interaction.options.getString('their_pokemon');

        const challengerId = interaction.user.id;
        const opponentId = opponent.id;

        if (challengerId === opponentId) {
            return interaction.editReply({
                components: [errorContainer('Invalid Opponent', `You cannot challenge yourself!`)],
                flags: MessageFlags.IsComponentsV2
            });
        }

        // Check if there is already an active challenge or battle in this channel
        if (activeChallenges.has(channelId) || battleStore.getBattle(channelId)) {
            return interaction.editReply({
                components: [errorContainer('Channel Busy', `There is already an active challenge or battle in this channel! Wait for it to finish.`)],
                flags: MessageFlags.IsComponentsV2
            });
        }

        const myId = await accountStore.resolveUserId(challengerId);
        const theirId = await accountStore.resolveUserId(opponentId);

        const myEntry = await PokemonEntry.findOne({
            userId: myId,
            pokemonName: { $regex: new RegExp(`^${myPokemonName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`, 'i') },
        }).sort({ level: -1 });

        const theirEntry = await PokemonEntry.findOne({
            userId: theirId,
            pokemonName: { $regex: new RegExp(`^${theirPokemonName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`, 'i') },
        }).sort({ level: -1 });

        if (!myEntry) {
            return interaction.editReply({
                components: [errorContainer('Not Found', `You don't own a **${myPokemonName}**!`)],
                flags: MessageFlags.IsComponentsV2
            });
        }
        if (!theirEntry) {
            return interaction.editReply({
                components: [errorContainer('Not Found', `**${opponent.username}** doesn't own a **${theirPokemonName}**!`)],
                flags: MessageFlags.IsComponentsV2
            });
        }

        const isWager = subcommand === 'wager';

        activeChallenges.set(channelId, {
            challengerId,
            opponentId,
            challengerPokemon: myEntry.pokemonName,
            challengerLevel: myEntry.level,
            opponentPokemon: theirEntry.pokemonName,
            opponentLevel: theirEntry.level,
            isWager,
            timestamp: Date.now()
        });

        // Set 5-minute expiration
        setTimeout(() => {
            if (activeChallenges.has(channelId)) {
                activeChallenges.delete(channelId);
            }
        }, 5 * 60 * 1000);

        const container = new ContainerBuilder()
            .setAccentColor(isWager ? COLORS.DANGER : COLORS.CELESTIA)
            .addTextDisplayComponents(new TextDisplayBuilder().setContent(
                isWager 
                ? `## 🚨 HIGH-STAKES WAGER CHALLENGE!`
                : `## ⚔️ Friendly Battle Challenge!`
            ))
            .addSeparatorComponents(new SeparatorBuilder().setSpacing(SeparatorSpacingSize.Small).setDivider(true))
            .addTextDisplayComponents(new TextDisplayBuilder().setContent(
                `Challenger: <@${challengerId}> with **${myEntry.pokemonName}** (Lv. ${myEntry.level})\n` +
                `Opponent: <@${opponentId}> with **${theirEntry.pokemonName}** (Lv. ${theirEntry.level})\n\n` +
                (isWager 
                 ? `⚠️ **THE WINNER KEEPS THE LOSER'S CARD FOREVER!** ⚠️\n\n`
                 : '') +
                `👉 <@${opponentId}>, do you accept this challenge?`
            ));

        const acceptRow = new ActionRowBuilder().addComponents(
            new ButtonBuilder()
                .setCustomId(`fight_accept`)
                .setLabel(isWager ? 'Accept Wager 🚨' : 'Accept Duel ⚔️')
                .setStyle(isWager ? ButtonStyle.Danger : ButtonStyle.Success)
        );

        await interaction.editReply({
            components: [container.addActionRowComponents(acceptRow)],
            flags: MessageFlags.IsComponentsV2
        });
    },

    // Button event handler
    async handleButton(interaction, client) {
        const customId = interaction.customId;
        const channelId = interaction.channelId;

        // 1. Accept Challenge
        if (customId === 'fight_accept') {
            const challenge = activeChallenges.get(channelId);
            if (!challenge) {
                return interaction.reply({
                    content: '❌ This challenge has expired or is invalid!',
                    flags: MessageFlags.Ephemeral
                });
            }

            if (interaction.user.id !== challenge.opponentId) {
                return interaction.reply({
                    content: '❌ This challenge is not for you!',
                    flags: MessageFlags.Ephemeral
                });
            }

            activeChallenges.delete(channelId);
            await startBattle(interaction, challenge, client);
            return;
        }

        // 2. Active Game Actions
        const battle = battleStore.getBattle(channelId);
        if (!battle) {
            return interaction.reply({
                content: '❌ No active battle found in this channel!',
                flags: MessageFlags.Ephemeral
            });
        }

        // Verify it is the turn player clicking
        const activeFighter = battle.phase === 'attack'
            ? (battle.turn === 1 ? battle.fighter1 : battle.fighter2)
            : (battle.turn === 1 ? battle.fighter2 : battle.fighter1);

        if (interaction.user.id !== activeFighter.discordId) {
            return interaction.reply({
                content: '❌ It is not your turn to act!',
                flags: MessageFlags.Ephemeral
            });
        }

        const attackerNum = battle.turn;
        const defenderNum = battle.turn === 1 ? 2 : 1;
        const attacker = battle.turn === 1 ? battle.fighter1 : battle.fighter2;
        const defender = battle.turn === 1 ? battle.fighter2 : battle.fighter1;

        // Clear existing timeout
        if (battle.timeoutTimer) {
            clearTimeout(battle.timeoutTimer);
            battle.timeoutTimer = null;
        }

        // ─── Case A: Defence Clicked ───
        if (customId === 'fight_def') {
            if (battle.phase === 'attack') {
                if (battle.defenceCooldown[attackerNum] > 0) {
                    return interaction.reply({ content: '❌ Defence is on cooldown!', flags: MessageFlags.Ephemeral });
                }

                attacker.defended = true;
                battle.defenceCooldown[attackerNum] = 2; // Set 2-turn cooldown

                battle.turn = defenderNum;
                battle.round++;

                const logText = `🛡️ **${attacker.name}** prepared a defensive shield! They will block the next incoming attack completely!`;
                const payload = renderCombatBoard(battle, logText);
                battle.timeoutTimer = setTimeout(() => handleTimeout(channelId, client), 60000);
                await interaction.update(payload);
                return;
            } else if (battle.phase === 'respond') {
                if (battle.defenceCooldown[defenderNum] > 0) {
                    return interaction.reply({ content: '❌ Defence is on cooldown!', flags: MessageFlags.Ephemeral });
                }

                battle.defenceCooldown[defenderNum] = 2;
                battle.defenceCooldown[attackerNum] = Math.max(0, battle.defenceCooldown[attackerNum] - 1);

                battle.turn = defenderNum;
                battle.phase = 'attack';
                battle.round++;

                const logText = `🛡️ **${defender.name}** completely blocked the move **${battle.lastAction.moveName}**!`;
                const payload = renderCombatBoard(battle, logText);
                battle.timeoutTimer = setTimeout(() => handleTimeout(channelId, client), 60000);
                await interaction.update(payload);
                return;
            }
        }

        // ─── Case B: Attack Clicked ───
        if (customId.startsWith('fight_atk_')) {
            const moveIdx = parseInt(customId.replace('fight_atk_', ''), 10);
            const move = activeFighter.attacks[moveIdx] || activeFighter.attacks[0];

            if (battle.phase === 'attack') {
                if (defender.defended) {
                    defender.defended = false;
                    battle.defenceCooldown[attackerNum] = Math.max(0, battle.defenceCooldown[attackerNum] - 1);

                    battle.turn = defenderNum;
                    battle.round++;

                    const logText = `🛡️ **${defender.name}**'s prepared shield completely blocked **${attacker.name}**'s **${move.name}**!`;
                    const payload = renderCombatBoard(battle, logText);
                    battle.timeoutTimer = setTimeout(() => handleTimeout(channelId, client), 60000);
                    await interaction.update(payload);
                    return;
                }

                battle.lastAction = { type: 'attack', moveName: move.name, attackerNum };
                battle.phase = 'respond';

                const logText = `⚔️ **${attacker.name}** prepares to use **${move.name}**!`;
                const payload = renderCombatBoard(battle, logText);
                battle.timeoutTimer = setTimeout(() => handleTimeout(channelId, client), 60000);
                await interaction.update(payload);
                return;
            } else if (battle.phase === 'respond') {
                // Resolved both attacks
                const originalAttacker = battle.turn === 1 ? battle.fighter1 : battle.fighter2;
                const originalDefender = battle.turn === 1 ? battle.fighter2 : battle.fighter1;
                const originalAttackerNum = battle.turn;
                const originalDefenderNum = battle.turn === 1 ? 2 : 1;

                const attackerMoveName = battle.lastAction.moveName;
                const attackerMove = originalAttacker.attacks.find(m => m.name.toLowerCase() === attackerMoveName.toLowerCase()) || originalAttacker.attacks[0];
                const defenderMove = move;

                const dmgAttacker = calculateDamage(originalAttacker, originalDefender, attackerMove);
                originalDefender.hp = Math.max(0, originalDefender.hp - dmgAttacker.damage);

                let logText = '';
                if (originalDefender.hp <= 0) {
                    logText = `⚔️ **${originalAttacker.name}** used **${attackerMove.name}** and dealt **${dmgAttacker.damage}** damage! ${dmgAttacker.crit ? '💥 CRITICAL!' : ''}\n` +
                              `💀 **${originalDefender.name}** fainted and could not counter-attack!`;
                    
                    battle.defenceCooldown[originalAttackerNum] = Math.max(0, battle.defenceCooldown[originalAttackerNum] - 1);
                } else {
                    const dmgDefender = calculateDamage(originalDefender, originalAttacker, defenderMove);
                    originalAttacker.hp = Math.max(0, originalAttacker.hp - dmgDefender.damage);

                    logText = `⚔️ **${originalAttacker.name}** used **${attackerMove.name}** and dealt **${dmgAttacker.damage}** damage! ${dmgAttacker.crit ? '💥 CRITICAL!' : ''}\n` +
                              `⚡ **${originalDefender.name}** counter-attacked with **${defenderMove.name}** and dealt **${dmgDefender.damage}** damage! ${dmgDefender.crit ? '💥 CRITICAL!' : ''}`;
                    
                    battle.defenceCooldown[originalAttackerNum] = Math.max(0, battle.defenceCooldown[originalAttackerNum] - 1);
                    battle.defenceCooldown[originalDefenderNum] = Math.max(0, battle.defenceCooldown[originalDefenderNum] - 1);
                }

                battle.turn = originalDefenderNum;
                battle.phase = 'attack';
                battle.round++;

                if (battle.fighter1.hp <= 0 || battle.fighter2.hp <= 0) {
                    battleStore.deleteBattle(channelId);
                    await handleEndBattle(interaction, battle, logText, client);
                    return;
                }

                const payload = renderCombatBoard(battle, logText);
                battle.timeoutTimer = setTimeout(() => handleTimeout(channelId, client), 60000);
                await interaction.update(payload);
                return;
            }
        }
    }
};
