/**
 * Pokemon Store — Discord-adapted version.
 * Manages spawns, catches, and Pokedex queries for Discord.
 * Message counter per channel → spawn every 25 messages.
 * Spawns expire after 2 minutes.
 * Uses real Pokemon TCG card data from pokemontcg.io.
 * Backed by MongoDB via the PokemonEntry model.
 */

const PokemonEntry = require('../models/Pokemon');
const PokemonListing = require('../models/PokemonListing');
const POKEMON_LIST = require('../data/pokemon.json');
const economyStore = require('./economyStore');

// ─── Name to Dex ID Map & Metadata Map ───
const nameToIdMap = {};
const pokemonMetaMap = {};
for (const p of POKEMON_LIST) {
    if (p.name) {
        const nameLower = p.name.toLowerCase();
        nameToIdMap[nameLower] = p.id;

        const desc = (p.description || '').toLowerCase();
        const gen = (p.genus || '').toLowerCase();
        const isLeg = p.isLegendary || desc.includes('legendary pokemon');
        const isMyth = p.isMythical || desc.includes('mythical pokemon');
        const isUB = gen.includes('beast') || gen.includes('ultra') || desc.includes('ultra beast');

        if (!pokemonMetaMap[nameLower]) {
            pokemonMetaMap[nameLower] = { isLeg, isMyth, isUB };
        } else {
            if (isLeg) pokemonMetaMap[nameLower].isLeg = true;
            if (isMyth) pokemonMetaMap[nameLower].isMyth = true;
            if (isUB) pokemonMetaMap[nameLower].isUB = true;
        }
    }
}

function getDexId(pokemonName) {
    if (!pokemonName) return 0;
    let name = pokemonName.toLowerCase().trim();
    if (nameToIdMap[name]) return nameToIdMap[name];

    // Clean modifiers
    name = name
        .replace(/\b(shiny|gacha|shadow|mega|gigantamax|alolan|galarian|hisuian|paldean)\b/g, '')
        .replace(/[()[\]{}]/g, '')
        .trim();

    if (nameToIdMap[name]) return nameToIdMap[name];

    // Fuzzy matching fallback
    for (const key of Object.keys(nameToIdMap)) {
        if (name.includes(key) || key.includes(name)) {
            return nameToIdMap[key];
        }
    }
    return 0;
}

// ─── In-memory state ───
const messageCounters = {};
const activeSpawns = {};

// { userId: expiryTimestamp } — users locked out from catching (speed penalty)
const pokeLocks = {};

// { "channelId:userId": spawnsRemaining } — catch cooldown: must skip N spawns after catching
const catchCooldowns = {};

const SPAWN_INTERVAL = 25;
const SPAWN_EXPIRY_MS = 2 * 60 * 1000;  // 2 minutes
const GRACE_PERIOD_MS = 5000;            // 5 seconds — can't catch during this window
const POKELOCK_DURATION_MS = 2 * 60 * 1000; // 2-minute lockout penalty

// ─── Level Generation decided by Card Properties ───
function calculateSpawnLevel(pkmn) {
    if (!pkmn) return 15;

    const bs = pkmn.baseStats || { hp: 50, atk: 50, def: 50, spAtk: 50, spDef: 50, speed: 50 };
    const bst = (bs.hp || 50) + (bs.atk || 50) + (bs.def || 50) + (bs.spAtk || 50) + (bs.spDef || 50) + (bs.speed || 50);
    const bstScore = (bst / 720) * 35;

    const tcgHp = parseInt(pkmn.hp) || 70;
    const hpScore = Math.min(15, (tcgHp / 340) * 15);

    const capRate = pkmn.captureRate || 45;
    const capScore = ((255 - capRate) / 252) * 15;

    const rarityScore = (pkmn.isLegendary ? 7.5 : 0) + (pkmn.isMythical ? 7.5 : 0);

    let growthBonus = 0;
    const gr = (pkmn.growthRate || 'medium').toLowerCase();
    if (gr === 'slow') growthBonus = 5;
    else if (gr === 'medium-slow') growthBonus = 3;
    else if (gr === 'medium') growthBonus = 2;
    else if (gr === 'medium-fast') growthBonus = 1;

    const movesList = pkmn.attacks || pkmn.moves || [];
    const maxPower = Math.max(...movesList.map(m => m.power || 0), 0);
    const moveScore = Math.min(10, (maxPower / 180) * 10);

    const weight = parseFloat(pkmn.weight) || 10;
    const height = parseFloat(pkmn.height) || 1.0;
    const density = weight / (height || 1);
    const densityBonus = Math.min(5, Math.max(-5, Math.log10(density) * 1.5));

    const hapBonus = ((pkmn.baseHappiness || 70) / 255) * 5;

    const tcgAttacksCount = Array.isArray(pkmn.tcgAttacks) ? pkmn.tcgAttacks.length : 0;
    const tcgBonus = Math.min(5, tcgAttacksCount * 2.5);

    let calculatedLevel = Math.round(
        bstScore + hpScore + capScore + rarityScore + growthBonus + moveScore + densityBonus + hapBonus + tcgBonus
    );

    return Math.min(100, Math.max(1, calculatedLevel));
}

// ─── Pokelock helpers ───
function isPokelocked(userId) {
    const expiry = pokeLocks[userId];
    if (!expiry) return false;
    if (Date.now() >= expiry) {
        delete pokeLocks[userId];
        return false;
    }
    return true;
}

function getPokelockRemaining(userId) {
    const expiry = pokeLocks[userId];
    if (!expiry) return 0;
    const remaining = expiry - Date.now();
    return remaining > 0 ? remaining : 0;
}

function applyPokelock(userId) {
    pokeLocks[userId] = Date.now() + POKELOCK_DURATION_MS;
}

// ─── Catch Cooldown helpers ───
function isCatchCooledDown(channelId, userId) {
    const key = `${channelId}:${userId}`;
    return (catchCooldowns[key] || 0) > 0;
}

function getCatchCooldownRemaining(channelId, userId) {
    const key = `${channelId}:${userId}`;
    return catchCooldowns[key] || 0;
}

function applyCatchCooldown(channelId, userId) {
    const key = `${channelId}:${userId}`;
    catchCooldowns[key] = 2;
}

function tickCatchCooldowns(channelId) {
    const prefix = `${channelId}:`;
    for (const key of Object.keys(catchCooldowns)) {
        if (key.startsWith(prefix) && catchCooldowns[key] > 0) {
            catchCooldowns[key]--;
            if (catchCooldowns[key] <= 0) {
                delete catchCooldowns[key];
            }
        }
    }
}

// ─── Spawn Logic ───
function countMessage(channelId) {
    if (!messageCounters[channelId]) messageCounters[channelId] = 0;
    messageCounters[channelId]++;

    if (messageCounters[channelId] >= SPAWN_INTERVAL) {
        messageCounters[channelId] = 0;
        const spawn = spawnPokemon(channelId);
        if (spawn) {
            tickCatchCooldowns(channelId);
        }
        return spawn;
    }
    return null;
}

function spawnPokemon(channelId) {
    const pkmn = POKEMON_LIST[Math.floor(Math.random() * POKEMON_LIST.length)];
    const level = calculateSpawnLevel(pkmn);

    const spawn = {
        name: pkmn.name,
        level,
        cardImage: pkmn.cardImage,
        spriteUrl: pkmn.spriteUrl,
        types: pkmn.types,
        hp: pkmn.hp,
        description: pkmn.description,
        attacks: pkmn.attacks,
        abilities: pkmn.abilities,
        dexId: pkmn.id,
        baseStats: pkmn.baseStats || null,
        weight: pkmn.weight || null,
        height: pkmn.height || null,
        genus: pkmn.genus || null,
        captureRate: pkmn.captureRate || null,
        isLegendary: pkmn.isLegendary || false,
        isMythical: pkmn.isMythical || false,
        spawnedAt: Date.now() + 999999,
    };

    activeSpawns[channelId] = spawn;

    // Decrement diaperModeSpawns and wandBlockSpawns globally on new spawns
    const PlayerWallet = require('../models/PlayerWallet');
    PlayerWallet.updateMany({ wandBlockSpawns: { $gt: 0 } }, { $inc: { wandBlockSpawns: -1 } }).catch(console.error);
    PlayerWallet.updateMany({ diaperModeSpawns: { $gt: 0 } }, { $inc: { diaperModeSpawns: -1 } }).catch(console.error);

    setTimeout(() => {
        if (activeSpawns[channelId] && activeSpawns[channelId].spawnedAt === spawn.spawnedAt) {
            delete activeSpawns[channelId];
            console.log(`[Pokemon] Spawn expired in ${channelId}: ${spawn.name}`);
        }
    }, SPAWN_EXPIRY_MS);

    return spawn;
}

function markSpawnSent(channelId) {
    const spawn = activeSpawns[channelId];
    if (spawn) {
        spawn.spawnedAt = Date.now();
    }
}

function getActiveSpawn(channelId) {
    const spawn = activeSpawns[channelId];
    if (!spawn) return null;
    if (Date.now() - spawn.spawnedAt > SPAWN_EXPIRY_MS) {
        delete activeSpawns[channelId];
        return null;
    }
    return spawn;
}

async function attemptCatch(channelId, userId, guessedName, isButtonOrSlash = false) {
    const PlayerWallet = require('../models/PlayerWallet');
    const wallet = await PlayerWallet.findOne({ userId });

    // Check Literally Karen & Cooldown Bypass
    const hasBypass = wallet && (wallet.cooldownBypass || (wallet.karenExpiry && new Date(wallet.karenExpiry) > new Date()));

    // 1. Wand Hex Check
    if (wallet && wallet.wandBlockSpawns > 0) {
        return { success: false, reason: 'wand_blocked', wandBlockSpawns: wallet.wandBlockSpawns };
    }

    // 2. Dirty Diaper Check
    if (isButtonOrSlash && wallet && wallet.diaperModeSpawns > 0) {
        return { success: false, reason: 'diaper_mode', diaperModeSpawns: wallet.diaperModeSpawns };
    }

    // 3. Catch Cooldown Check
    if (!hasBypass && isCatchCooledDown(channelId, userId)) {
        const skipsLeft = getCatchCooldownRemaining(channelId, userId);
        return { success: false, reason: 'catch_cooldown', skipsLeft };
    }

    const spawn = getActiveSpawn(channelId);
    if (!spawn) {
        return { success: false, reason: 'no_spawn' };
    }

    if (spawn.name.toLowerCase() !== guessedName.toLowerCase()) {
        return { success: false, reason: 'wrong_name' };
    }

    const hasBalls = await economyStore.hasPokeballs(userId);
    if (!hasBalls) {
        return { success: false, reason: 'no_pokeballs' };
    }

    const ballResult = await economyStore.consumePokeball(userId);
    const remainingBalls = ballResult.remaining;

    const catchRoll = Math.random();
    if (catchRoll > 0.85) {
        return {
            success: false,
            reason: 'ball_failed',
            pokemonName: spawn.name,
            remainingBalls,
        };
    }

    delete activeSpawns[channelId];
    if (!hasBypass) {
        applyCatchCooldown(channelId, userId);
    }

    const coinReward = economyStore.calculateCoinReward(spawn);
    await economyStore.addCoins(userId, coinReward);
    await economyStore.addUserXP(userId, 10);

    let crystalReward = 0;
    if (spawn.isMythical) {
        crystalReward = 160;
    } else if (spawn.isLegendary) {
        crystalReward = 80;
    }
    if (crystalReward > 0) {
        await economyStore.addRadiantCrystals(userId, crystalReward);
    }

    const userWallet = await economyStore.getWallet(userId);
    const levelCap = economyStore.getLevelCap(userWallet);
    let finalLevel = spawn.level;
    if (levelCap > 100) {
        finalLevel = Math.min(levelCap, Math.max(1, Math.round((spawn.level / 100) * levelCap)));
    }

    const entry = await PokemonEntry.create({
        userId,
        pokemonName: spawn.name,
        level: finalLevel,
        dexId: spawn.dexId,
    });

    const balance = await economyStore.getBalance(userId);

    return {
        success: true,
        pokemon: {
            name: spawn.name,
            level: finalLevel,
            cardImage: spawn.cardImage,
            spriteUrl: spawn.spriteUrl,
            types: spawn.types,
            hp: spawn.hp,
            description: spawn.description,
            attacks: spawn.attacks,
            abilities: spawn.abilities,
            dexId: spawn.dexId,
            baseStats: spawn.baseStats,
            weight: spawn.weight,
            height: spawn.height,
            genus: spawn.genus,
            isLegendary: spawn.isLegendary,
            isMythical: spawn.isMythical,
            dbId: entry._id,
        },
        coinReward,
        crystalReward,
        totalCoins: balance.pokecoins,
        totalCrystals: balance.radiantCrystals,
        remainingBalls,
    };
}

// ─── Pokedex Queries ───
async function getUserPokedex(userId) {
    const entries = await PokemonEntry.find({ userId }).sort({ level: -1 });
    const dex = {};
    for (const e of entries) {
        if (!dex[e.pokemonName]) {
            dex[e.pokemonName] = { name: e.pokemonName, count: 0, bestLevel: 0, entries: [] };
        }
        dex[e.pokemonName].count++;
        if (e.level > dex[e.pokemonName].bestLevel) dex[e.pokemonName].bestLevel = e.level;
        dex[e.pokemonName].entries.push({ level: e.level, caughtAt: e.caughtAt, id: e._id });
    }
    return Object.values(dex).sort((a, b) => b.bestLevel - a.bestLevel);
}

async function getPokemonDetails(userId, pokemonName) {
    const entries = await PokemonEntry.find({
        userId,
        pokemonName: { $regex: new RegExp(`^${pokemonName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`, 'i') },
    }).sort({ level: -1 });

    if (entries.length === 0) return null;

    const staticData = POKEMON_LIST.find(
        p => p.name.toLowerCase() === pokemonName.toLowerCase()
    );

    return {
        name: entries[0].pokemonName,
        count: entries.length,
        bestLevel: entries[0].level,
        entries: entries.map(e => ({ level: e.level, caughtAt: e.caughtAt })),
        cardImage: staticData?.cardImage || null,
        spriteUrl: staticData?.spriteUrl || null,
        types: staticData?.types || [],
        hp: staticData?.hp || '??',
        description: staticData?.description || 'A mysterious Pokémon.',
        attacks: staticData?.attacks || [],
        abilities: staticData?.abilities || [],
        dexId: staticData?.id || 0,
        baseStats: staticData?.baseStats || null,
        weight: staticData?.weight || null,
        height: staticData?.height || null,
        genus: staticData?.genus || null,
        captureRate: staticData?.captureRate || null,
        isLegendary: staticData?.isLegendary || false,
        isMythical: staticData?.isMythical || false,
        growthRate: staticData?.growthRate || null,
    };
}

async function getUserStats(userId) {
    const entries = await PokemonEntry.find({ userId });
    const uniqueIds = new Set(entries.map(e => e.dexId || getDexId(e.pokemonName)));
    uniqueIds.delete(0);
    uniqueIds.delete(undefined);
    return { total: entries.length, unique: uniqueIds.size };
}

function getStaticData(pokemonName) {
    return POKEMON_LIST.find(p => p.name.toLowerCase() === pokemonName.toLowerCase()) || null;
}

async function giftPokemon(fromUserId, toUserId, pokemonName) {
    const entry = await PokemonEntry.findOne({
        userId: fromUserId,
        pokemonName: { $regex: new RegExp(`^${pokemonName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`, 'i') },
    }).sort({ level: -1 });

    if (!entry) return { success: false, reason: 'not_owned' };

    entry.userId = toUserId;
    await entry.save();

    return {
        success: true,
        pokemon: {
            name: entry.pokemonName,
            level: entry.level,
        },
    };
}

// ─── Summoning Candle Logic ───
const activeSummons = {};

function summonPokemon(channelId, summonerId, pokemonBaseName) {
    const basePkmn = POKEMON_LIST.find(
        p => p.name.toLowerCase() === pokemonBaseName.toLowerCase()
    );

    if (!basePkmn) return null;

    const dexId = basePkmn.id;
    const allVariants = POKEMON_LIST.filter(p => p.id === dexId);
    const pkmn = allVariants[Math.floor(Math.random() * allVariants.length)];
    const level = calculateSpawnLevel(pkmn);

    const summon = {
        summonerId,
        name: pkmn.name,
        level,
        cardImage: pkmn.cardImage,
        spriteUrl: pkmn.spriteUrl,
        types: pkmn.types,
        hp: pkmn.hp,
        description: pkmn.description,
        attacks: pkmn.attacks,
        abilities: pkmn.abilities,
        dexId: pkmn.id,
        baseStats: pkmn.baseStats || null,
        weight: pkmn.weight || null,
        height: pkmn.height || null,
        genus: pkmn.genus || null,
        captureRate: pkmn.captureRate || null,
        isLegendary: pkmn.isLegendary || false,
        isMythical: pkmn.isMythical || false,
        triesLeft: 3,
    };

    activeSummons[channelId] = summon;
    return summon;
}

function getSummonedSpawn(channelId) {
    return activeSummons[channelId] || null;
}

async function attemptSummonCatch(channelId, userId, guessedName) {
    const summon = activeSummons[channelId];
    if (!summon) return { success: false, reason: 'no_summon' };
    if (summon.summonerId !== userId) return { success: false, reason: 'not_summoner' };
    if (summon.name.toLowerCase() !== guessedName.toLowerCase()) return { success: false, reason: 'wrong_name' };

    const balance = await economyStore.getBalance(userId);
    if (balance.pokeballs < 2) {
        return { success: false, reason: 'no_pokeballs', needed: 2, have: balance.pokeballs };
    }

    await economyStore.consumePokeball(userId);
    await economyStore.consumePokeball(userId);
    const updatedBalance = await economyStore.getBalance(userId);
    const remainingBalls = updatedBalance.pokeballs;

    summon.triesLeft--;

    const catchChance = summon.triesLeft === 2 ? 0.50 : summon.triesLeft === 1 ? 0.65 : 0.75;
    const catchRoll = Math.random();
    if (catchRoll < catchChance) {
        delete activeSummons[channelId];

        const coinReward = economyStore.calculateCoinReward(summon);
        await economyStore.addCoins(userId, coinReward);
        await economyStore.addUserXP(userId, 20);

        const wallet = await economyStore.getWallet(userId);
        const levelCap = economyStore.getLevelCap(wallet);
        let finalLevel = summon.level;
        if (levelCap > 100) {
            finalLevel = Math.min(levelCap, Math.max(1, Math.round((summon.level / 100) * levelCap)));
        }

        const entry = await PokemonEntry.create({
            userId,
            pokemonName: summon.name,
            level: finalLevel,
            dexId: summon.dexId,
        });

        const finalBalance = await economyStore.getBalance(userId);

        return {
            success: true,
            catchChance,
            pokemon: {
                name: summon.name, level: finalLevel, cardImage: summon.cardImage,
                spriteUrl: summon.spriteUrl, types: summon.types, hp: summon.hp,
                description: summon.description, attacks: summon.attacks, abilities: summon.abilities,
                dexId: summon.dexId, baseStats: summon.baseStats, weight: summon.weight,
                height: summon.height, genus: summon.genus, isLegendary: summon.isLegendary,
                isMythical: summon.isMythical, dbId: entry._id,
            },
            coinReward,
            totalCoins: finalBalance.pokecoins,
            remainingBalls,
        };
    }

    const triesLeft = summon.triesLeft;
    if (triesLeft <= 0) delete activeSummons[channelId];

    return {
        success: false,
        reason: 'summon_ball_failed',
        pokemonName: summon.name,
        remainingBalls,
        triesLeft,
        catchChance,
        despawned: triesLeft <= 0,
    };
}

async function getTrainerLeaderboard() {
    const entries = await PokemonEntry.find({});
    const userStats = {};

    for (const entry of entries) {
        const userId = entry.userId;
        if (!userStats[userId]) {
            userStats[userId] = {
                userId,
                totalCaught: 0,
                uniqueIds: new Set(),
                bestLevel: 0,
                sumLevels: 0,
            };
        }

        const stats = userStats[userId];
        stats.totalCaught++;

        const speciesId = entry.dexId || getDexId(entry.pokemonName);
        if (speciesId) {
            stats.uniqueIds.add(speciesId);
        }

        if (entry.level > stats.bestLevel) stats.bestLevel = entry.level;
        stats.sumLevels += entry.level;
    }

    const leaderboard = Object.values(userStats).map(stats => {
        const uniqueCount = stats.uniqueIds.size;
        const avgLevel = stats.totalCaught > 0 ? Math.round(stats.sumLevels / stats.totalCaught) : 0;
        const score = (uniqueCount * 150) + (stats.totalCaught * 35) + (stats.bestLevel * 10) + avgLevel;

        return {
            userId: stats.userId,
            totalCaught: stats.totalCaught,
            uniqueCount,
            bestLevel: stats.bestLevel,
            avgLevel,
            score,
        };
    });

    leaderboard.sort((a, b) => b.score - a.score);
    return leaderboard.slice(0, 10);
}

function isValidPokemon(name) {
    if (!name) return false;
    return pokemonMetaMap.hasOwnProperty(name.toLowerCase());
}

async function sellPokemon(sellerId, cost, pokemonName) {
    if (isNaN(cost) || cost <= 0) return { success: false, reason: 'invalid_price' };

    const entry = await PokemonEntry.findOne({
        userId: sellerId,
        pokemonName: { $regex: new RegExp(`^${pokemonName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`, 'i') },
    }).sort({ level: -1 });

    if (!entry) return { success: false, reason: 'not_owned' };

    const listing = await PokemonListing.create({
        sellerId,
        pokemonEntryId: entry._id,
        pokemonName: entry.pokemonName,
        level: entry.level,
        price: cost,
    });

    entry.userId = 'marketplace_listed';
    await entry.save();

    return {
        success: true,
        pokemonName: entry.pokemonName,
        level: entry.level,
        price: cost,
        listingId: listing._id,
    };
}

async function buyPokemon(buyerId, sellerId, pokemonName) {
    if (buyerId === sellerId) return { success: false, reason: 'buy_self' };

    const listing = await PokemonListing.findOne({
        sellerId,
        pokemonName: { $regex: new RegExp(`^${pokemonName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`, 'i') },
    });

    if (!listing) return { success: false, reason: 'listing_not_found' };

    const buyerWallet = await economyStore.getWallet(buyerId);
    if (buyerWallet.pokecoins < listing.price) {
        return {
            success: false,
            reason: 'insufficient_coins',
            needed: listing.price,
            have: buyerWallet.pokecoins,
        };
    }

    const entry = await PokemonEntry.findById(listing.pokemonEntryId);
    if (!entry) {
        await listing.deleteOne();
        return { success: false, reason: 'pokemon_not_found' };
    }

    buyerWallet.pokecoins -= listing.price;
    await buyerWallet.save();

    const sellerWallet = await economyStore.getWallet(sellerId);
    sellerWallet.pokecoins += listing.price;
    await sellerWallet.save();

    entry.userId = buyerId;
    await entry.save();

    await listing.deleteOne();

    return {
        success: true,
        pokemonName: listing.pokemonName,
        level: listing.level,
        price: listing.price,
    };
}

module.exports = {
    countMessage,
    spawnPokemon,
    tickCatchCooldowns,
    getActiveSpawn,
    attemptCatch,
    summonPokemon,
    getSummonedSpawn,
    attemptSummonCatch,
    getUserPokedex,
    getPokemonDetails,
    getUserStats,
    getStaticData,
    giftPokemon,
    isPokelocked,
    markSpawnSent,
    getDexId,
    getTrainerLeaderboard,
    POKEMON_LIST,
    pokemonMetaMap,
    isValidPokemon,
    sellPokemon,
    buyPokemon,
};
