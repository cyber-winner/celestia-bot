/**
 * Battle Store — Manages active turn-based Pokemon battles.
 * Tracks battle state, turns, HP, defence cooldowns, and move resolution.
 */

// Map<channelId, battleState>
const activeBattles = new Map();

// Map<channelId, { resolve, timer }> — pending input from current turn player
const pendingInputs = new Map();

function createBattle(channelId, fighter1, fighter2) {
    // Randomly pick who goes first
    const firstTurn = Math.random() < 0.5 ? 1 : 2;
    const battle = {
        channelId,
        fighter1, // { id, name, trainerName, level, hp, maxHp, atk, def, speed, types, attacks }
        fighter2,
        turn: firstTurn, // 1 or 2 — whose turn it is to ACT
        phase: 'attack', // 'attack' = attacker picks move, 'respond' = defender responds
        round: 1,
        lastAction: null, // { type: 'attack', move, attackerId } — what the attacker just did
        defenceCooldown: { 1: 0, 2: 0 }, // remaining turns cooldown: 0 = ready, >0 = cooldown active
        isWager: false,
        startedAt: Date.now(),
    };
    activeBattles.set(channelId, battle);
    return battle;
}

function getBattle(channelId) {
    return activeBattles.get(channelId) || null;
}

function deleteBattle(channelId) {
    const battle = activeBattles.get(channelId);
    if (battle && battle.timeoutTimer) {
        clearTimeout(battle.timeoutTimer);
        battle.timeoutTimer = null;
    }
    activeBattles.delete(channelId);
    clearPendingInput(channelId);
}

function setPendingInput(channelId, expectedUserId, resolve, timeoutMs = 60000) {
    clearPendingInput(channelId);
    const timer = setTimeout(() => {
        const pending = pendingInputs.get(channelId);
        if (pending) {
            pendingInputs.delete(channelId);
            pending.resolve({ type: 'timeout' });
        }
    }, timeoutMs);
    pendingInputs.set(channelId, { resolve, expectedUserId, timer });
}

function clearPendingInput(channelId) {
    const pending = pendingInputs.get(channelId);
    if (pending) {
        clearTimeout(pending.timer);
        pendingInputs.delete(channelId);
    }
}

module.exports = {
    createBattle,
    getBattle,
    deleteBattle,
    setPendingInput,
    clearPendingInput,
    activeBattles,
};
