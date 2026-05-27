/**
 * Economy Store — Manages PokéCoins, Pokéballs, Inventory, and the PokéMart.
 *
 * ─── Market Items ───
 *   Pokéball    → 10 for 250 coins
 *   Level Orb   → 1 for 800 coins
 *
 * ─── Coin Rewards ───
 *   Earned randomly on catch, based on Pokémon rank (level).
 *   Max 500 coins per catch.
 *
 * ─── Pokéball Mechanics ───
 *   - Every catch attempt consumes 1 Pokéball.
 *   - Pass chance: 85%, Fail chance: 15%
 *   - On fail, ball is wasted and Pokémon stays.
 *   - On pass, ball is consumed and Pokémon is captured.
 *
 * ─── Level Orb Mechanics ───
 *   - Used on a Pokémon to gain random levels up to max 100.
 *   - Pass chance: 60%, Fail chance: 40%
 *   - On fail, orb is wasted.
 */

const PlayerWallet = require('../models/PlayerWallet');
const PokemonEntry = require('../models/Pokemon');
const itemsList = require('../data/items.json');

// ─── Market Catalog loaded dynamically from JSON db ───
const MARKET_ITEMS = {};
for (const item of itemsList) {
    MARKET_ITEMS[item.id] = {
        id: item.id,
        displayName: item.displayName,
        emoji: item.emoji,
        description: item.description,
        price: item.price,
        quantity: item.quantity,
        category: item.category,
        aliases: item.aliases || [],
        guide: item.guide || ''
    };
}

/**
 * Find item details by its ID, displayName, or aliases.
 */
function getItemDetails(nameOrAlias) {
    if (!nameOrAlias) return null;
    const cleaned = nameOrAlias.toLowerCase().trim();

    // Direct ID match
    if (MARKET_ITEMS[cleaned]) {
        return { id: cleaned, ...MARKET_ITEMS[cleaned] };
    }

    // Alias search
    for (const [id, details] of Object.entries(MARKET_ITEMS)) {
        if (details.aliases.some(a => a.toLowerCase() === cleaned)) {
            return { id, ...details };
        }
    }

    // Display name search
    for (const [id, details] of Object.entries(MARKET_ITEMS)) {
        if (details.displayName.toLowerCase() === cleaned) {
            return { id, ...details };
        }
    }

    return null;
}

// ─── Wallet CRUD ───

/**
 * Get or create a player's wallet. New players start with 20 Pokéballs.
 */
async function getWallet(userId) {
    let wallet = await PlayerWallet.findOne({ userId });
    if (!wallet) {
        wallet = await PlayerWallet.create({ userId, pokecoins: 0, pokeballs: 20, inventory: [] });
    }
    return wallet;
}

/**
 * Calculate coin reward based on Pokémon rank (level).
 * Higher rank → higher reward range, max 500.
 *   S-Rank (75-100): 300-500 coins
 *   A-Rank (50-74):  150-350 coins
 *   B-Rank (25-49):  50-200 coins
 *   C-Rank (1-24):   10-100 coins
 */
/**
 * Calculate coin reward based on Pokémon card properties instead of its level.
 * Higher BST, legendary status, and lower capture rate → higher reward, max 650.
 */
function calculateCoinReward(pkmn) {
    if (!pkmn) return 50;

    // 1. Base Coins from BST (Base Stat Total) - typical range 180 to 720
    const bs = pkmn.baseStats || { hp: 50, atk: 50, def: 50, spAtk: 50, spDef: 50, speed: 50 };
    const bst = (bs.hp || 50) + (bs.atk || 50) + (bs.def || 50) + (bs.spAtk || 50) + (bs.spDef || 50) + (bs.speed || 50);
    const bstCoins = (bst / 720) * 220; // Up to 220 coins

    // 2. Rarity Prestige Bonus (Legendary / Mythical)
    const rarityCoins = (pkmn.isLegendary ? 160 : 0) + (pkmn.isMythical ? 200 : 0);

    // 3. Capture Rate Bonus (lower rate = harder catch = more reward)
    const capRate = pkmn.captureRate || 45;
    const capCoins = ((255 - capRate) / 252) * 80; // Up to 80 coins

    // 4. TCG HP Bonus
    const tcgHp = parseInt(pkmn.hp) || 70;
    const hpCoins = Math.min(50, (tcgHp / 340) * 50); // Up to 50 coins

    // 5. RPG Move Pool Power Bonus
    const movesList = pkmn.attacks || pkmn.moves || [];
    const maxPower = Math.max(...movesList.map(m => m.power || 0), 0);
    const moveCoins = Math.min(50, (maxPower / 180) * 50); // Up to 50 coins

    // Combine factors with a dynamic random variance
    const baseReward = bstCoins + rarityCoins + capCoins + hpCoins + moveCoins;
    const variance = Math.floor(Math.random() * 41) - 20; // -20 to +20 coins variance

    const finalCoins = Math.round(baseReward + variance);

    // Minimum reward is 30, maximum capped at 650 coins for absolute legendaries!
    return Math.min(650, Math.max(30, finalCoins));
}

/**
 * Award coins to a player.
 */
async function addCoins(userId, amount) {
    const wallet = await getWallet(userId);
    wallet.pokecoins += amount;
    await wallet.save();
    return wallet;
}

/**
 * Deduct coins from a player. Returns false if insufficient.
 */
async function deductCoins(userId, amount) {
    const wallet = await getWallet(userId);
    if (wallet.pokecoins < amount) return { success: false, balance: wallet.pokecoins };
    wallet.pokecoins -= amount;
    await wallet.save();
    return { success: true, balance: wallet.pokecoins };
}

/**
 * Transfer coins between players.
 */
async function transferCoins(fromUserId, toUserId, amount) {
    if (amount <= 0) return { success: false, reason: 'invalid_amount' };

    const fromWallet = await getWallet(fromUserId);
    if (fromWallet.pokecoins < amount) {
        return { success: false, reason: 'insufficient', balance: fromWallet.pokecoins };
    }

    fromWallet.pokecoins -= amount;
    await fromWallet.save();

    const toWallet = await getWallet(toUserId);
    toWallet.pokecoins += amount;
    await toWallet.save();

    return {
        success: true,
        fromBalance: fromWallet.pokecoins,
        toBalance: toWallet.pokecoins,
    };
}

/**
 * Get coin balance.
 */
async function getBalance(userId) {
    const wallet = await getWallet(userId);
    return { pokecoins: wallet.pokecoins, pokeballs: wallet.pokeballs, radiantCrystals: wallet.radiantCrystals || 0 };
}

// ─── Pokéball Management ───

/**
 * Check if player has pokeballs.
 */
async function hasPokeballs(userId) {
    const wallet = await getWallet(userId);
    return wallet.pokeballs > 0;
}

/**
 * Consume one pokeball. Returns remaining count or false if none.
 */
async function consumePokeball(userId) {
    const wallet = await getWallet(userId);
    if (wallet.pokeballs <= 0) return { success: false, remaining: 0 };
    wallet.pokeballs -= 1;
    await wallet.save();
    return { success: true, remaining: wallet.pokeballs };
}

/**
 * Add pokeballs to player.
 */
async function addPokeballs(userId, amount) {
    const wallet = await getWallet(userId);
    wallet.pokeballs += amount;
    await wallet.save();
    return wallet.pokeballs;
}

// ─── Inventory Management ───

/**
 * Add item to player's inventory.
 */
async function addInventoryItem(userId, itemName, quantity = 1) {
    const wallet = await getWallet(userId);
    const existing = wallet.inventory.find(i => i.itemName.toLowerCase() === itemName.toLowerCase());
    if (existing) {
        existing.quantity += quantity;
    } else {
        wallet.inventory.push({ itemName, quantity });
    }
    await wallet.save();
    return wallet.inventory;
}

/**
 * Remove item from player's inventory. Returns false if insufficient.
 */
async function removeInventoryItem(userId, itemName, quantity = 1) {
    const wallet = await getWallet(userId);
    const existing = wallet.inventory.find(i => i.itemName.toLowerCase() === itemName.toLowerCase());
    if (!existing || existing.quantity < quantity) return false;
    existing.quantity -= quantity;
    if (existing.quantity <= 0) {
        wallet.inventory = wallet.inventory.filter(i => i.itemName.toLowerCase() !== itemName.toLowerCase());
    }
    await wallet.save();
    return true;
}

/**
 * Get player's inventory.
 */
async function getInventory(userId) {
    const wallet = await getWallet(userId);
    return {
        pokecoins: wallet.pokecoins,
        pokeballs: wallet.pokeballs,
        radiantCrystals: wallet.radiantCrystals || 0,
        items: wallet.inventory,
    };
}

// ─── Market ───

/**
 * Buy an item from the market.
 */
async function buyItem(userId, itemKey, qty = 1) {
    const item = MARKET_ITEMS[itemKey];
    if (!item) return { success: false, reason: 'not_found' };
    if (qty < 1) qty = 1;

    const wallet = await getWallet(userId);
    const totalPrice = item.price * qty;
    const totalQty = item.quantity * qty;

    // ─── Special Currency: Wishing Compass uses Radiant Crystals instead of PokéCoins ───
    if (itemKey === 'wishing compass') {
        const crystals = wallet.radiantCrystals || 0;
        if (crystals < totalPrice) {
            return {
                success: false,
                reason: 'insufficient_crystals',
                needed: totalPrice,
                have: crystals,
                currency: 'Radiant Crystals',
            };
        }
        wallet.radiantCrystals -= totalPrice;

        // Add Wishing Compasses to inventory
        const existing = wallet.inventory.find(i => i.itemName === item.displayName);
        if (existing) {
            existing.quantity += totalQty;
        } else {
            wallet.inventory.push({ itemName: item.displayName, quantity: totalQty });
        }

        await wallet.save();
        return {
            success: true,
            item: item.displayName,
            quantity: totalQty,
            spent: totalPrice,
            currency: 'Radiant Crystals',
            newBalance: wallet.radiantCrystals,
        };
    }

    // ─── Standard PokéCoin purchases ───
    if (wallet.pokecoins < totalPrice) {
        return {
            success: false,
            reason: 'insufficient_coins',
            needed: totalPrice,
            have: wallet.pokecoins,
        };
    }

    wallet.pokecoins -= totalPrice;

    // Special handling for pokeballs — add to pokeballs count directly
    if (itemKey === 'pokeball') {
        wallet.pokeballs += totalQty;
    } else {
        // Add to inventory
        const existing = wallet.inventory.find(i => i.itemName === item.displayName);
        if (existing) {
            existing.quantity += totalQty;
        } else {
            wallet.inventory.push({ itemName: item.displayName, quantity: totalQty });
        }
    }

    await wallet.save();
    return {
        success: true,
        item: item.displayName,
        quantity: totalQty,
        spent: totalPrice,
        newBalance: wallet.pokecoins,
    };
}

// ─── Level Orb Usage ───

/**
 * Use a Level Orb on a Pokémon.
 * 60% pass, 40% fail. On pass, adds random levels up to 100.
 */
async function useLevelOrb(userId, pokemonName) {
    const wallet = await getWallet(userId);
    const orbItem = wallet.inventory.find(i => i.itemName === 'Level Orb');
    if (!orbItem || orbItem.quantity <= 0) {
        return { success: false, reason: 'no_orbs' };
    }

    // Find the best-level copy of this Pokémon
    const entry = await PokemonEntry.findOne({
        userId,
        pokemonName: { $regex: new RegExp(`^${pokemonName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`, 'i') },
    }).sort({ level: -1 });

    if (!entry) return { success: false, reason: 'no_pokemon' };
    const levelCap = getLevelCap(wallet);
    if (entry.level >= levelCap) return { success: false, reason: 'max_level', cap: levelCap };

    // Consume the orb
    orbItem.quantity -= 1;
    if (orbItem.quantity <= 0) {
        wallet.inventory = wallet.inventory.filter(i => i.itemName !== 'Level Orb');
    }
    await wallet.save();

    // 60% pass, 40% fail
    const roll = Math.random();
    if (roll > 0.60) {
        // FAIL — orb wasted
        return {
            success: false,
            reason: 'failed',
            pokemonName: entry.pokemonName,
            level: entry.level,
        };
    }

    // PASS — add random levels
    const maxGain = levelCap - entry.level;
    const levelsGained = Math.floor(Math.random() * maxGain) + 1;
    entry.level = Math.min(entry.level + levelsGained, levelCap);
    await entry.save();

    return {
        success: true,
        pokemonName: entry.pokemonName,
        oldLevel: entry.level - levelsGained,
        newLevel: entry.level,
        levelsGained,
    };
}

/**
 * Get the full market catalog.
 */
function getMarketCatalog() {
    return MARKET_ITEMS;
}

/**
 * Get top richest players.
 */
async function getBalTop(limit = 10) {
    return PlayerWallet.find({}).sort({ pokecoins: -1 }).limit(limit);
}

/**
 * Get players with the most Radiant Crystals.
 */
async function getCrystalTop(limit = 10) {
    return PlayerWallet.find({}).sort({ radiantCrystals: -1 }).limit(limit);
}

/**
 * Get top players by Net Worth.
 */
async function getNetWorthTop(limit = 10) {
    const wallets = await PlayerWallet.find({});
    const results = [];

    for (const w of wallets) {
        let itemWorth = 0;
        for (const item of w.inventory || []) {
            const details = getItemDetails(item.itemName);
            if (details) {
                itemWorth += (details.price || 0) * (item.quantity || 0);
            }
        }
        const crystalWorth = (w.radiantCrystals || 0) * 1500;
        const netWorth = (w.pokecoins || 0) + crystalWorth + itemWorth + ((w.pokeballs || 0) * 25);
        results.push({ userId: w.userId, netWorth, pokecoins: w.pokecoins, radiantCrystals: w.radiantCrystals || 0, pokeballs: w.pokeballs || 0 });
    }

    results.sort((a, b) => b.netWorth - a.netWorth);
    return results.slice(0, limit);
}

// ─── Daily Reward ───

const DAILY_COOLDOWN_MS = 24 * 60 * 60 * 1000; // 24 hours
const DAILY_COINS = 800;
const DAILY_BALLS = 10;

/**
 * Claim daily reward. Returns reward info or cooldown remaining.
 */
async function claimDaily(userId) {
    const wallet = await getWallet(userId);
    const now = Date.now();

    if (wallet.lastDaily) {
        const elapsed = now - wallet.lastDaily.getTime();
        if (elapsed < DAILY_COOLDOWN_MS) {
            const remaining = DAILY_COOLDOWN_MS - elapsed;
            const hours = Math.floor(remaining / (60 * 60 * 1000));
            const minutes = Math.floor((remaining % (60 * 60 * 1000)) / (60 * 1000));
            return {
                success: false,
                reason: 'cooldown',
                hours,
                minutes,
            };
        }
    }

    wallet.pokecoins += DAILY_COINS;
    wallet.pokeballs += DAILY_BALLS;
    wallet.lastDaily = new Date(now);
    await wallet.save();

    return {
        success: true,
        coinsAwarded: DAILY_COINS,
        ballsAwarded: DAILY_BALLS,
        totalCoins: wallet.pokecoins,
        totalBalls: wallet.pokeballs,
    };
}

// ─── Weekly Reward ───

const WEEKLY_COOLDOWN_MS = 7 * 24 * 60 * 60 * 1000; // 7 days
const WEEKLY_COINS = 10000;
const WEEKLY_BALLS = 50;
const WEEKLY_ORBS = 3;

/**
 * Claim weekly reward. Returns reward info or cooldown remaining.
 */
async function claimWeekly(userId) {
    const wallet = await getWallet(userId);
    const now = Date.now();

    if (wallet.lastWeekly) {
        const elapsed = now - wallet.lastWeekly.getTime();
        if (elapsed < WEEKLY_COOLDOWN_MS) {
            const remaining = WEEKLY_COOLDOWN_MS - elapsed;
            const days = Math.floor(remaining / (24 * 60 * 60 * 1000));
            const hours = Math.floor((remaining % (24 * 60 * 60 * 1000)) / (60 * 60 * 1000));
            const minutes = Math.floor((remaining % (60 * 60 * 1000)) / (60 * 1000));
            return {
                success: false,
                reason: 'cooldown',
                days,
                hours,
                minutes,
            };
        }
    }

    // Award coins and pokéballs
    wallet.pokecoins += WEEKLY_COINS;
    wallet.pokeballs += WEEKLY_BALLS;

    // Award Level Orbs to inventory
    const existing = wallet.inventory.find(i => i.itemName === 'Level Orb');
    if (existing) {
        existing.quantity += WEEKLY_ORBS;
    } else {
        wallet.inventory.push({ itemName: 'Level Orb', quantity: WEEKLY_ORBS });
    }

    wallet.lastWeekly = new Date(now);
    await wallet.save();

    return {
        success: true,
        coinsAwarded: WEEKLY_COINS,
        ballsAwarded: WEEKLY_BALLS,
        orbsAwarded: WEEKLY_ORBS,
        totalCoins: wallet.pokecoins,
        totalBalls: wallet.pokeballs,
    };
}

// ─── Monthly Reward ───

const MONTHLY_COOLDOWN_MS = 30 * 24 * 60 * 60 * 1000; // 30 days
const MONTHLY_COINS = 100000;
const MONTHLY_BALLS = 100;
const MONTHLY_ORBS = 15;
const MONTHLY_PASSES = 15;
const MONTHLY_COMPASSES = 30;

/**
 * Claim monthly reward. Returns reward info or cooldown remaining.
 */
async function claimMonthly(userId) {
    const wallet = await getWallet(userId);
    const now = Date.now();

    if (wallet.lastMonthly) {
        const elapsed = now - wallet.lastMonthly.getTime();
        if (elapsed < MONTHLY_COOLDOWN_MS) {
            const remaining = MONTHLY_COOLDOWN_MS - elapsed;
            const days = Math.floor(remaining / (24 * 60 * 60 * 1000));
            const hours = Math.floor((remaining % (24 * 60 * 60 * 1000)) / (60 * 60 * 1000));
            const minutes = Math.floor((remaining % (60 * 60 * 1000)) / (60 * 1000));
            return {
                success: false,
                reason: 'cooldown',
                days,
                hours,
                minutes,
            };
        }
    }

    // Award coins and pokéballs
    wallet.pokecoins += MONTHLY_COINS;
    wallet.pokeballs += MONTHLY_BALLS;

    // Helper to add to inventory
    const addToInv = (itemName, qty) => {
        const existing = wallet.inventory.find(i => i.itemName === itemName);
        if (existing) {
            existing.quantity += qty;
        } else {
            wallet.inventory.push({ itemName, quantity: qty });
        }
    };

    addToInv('Level Orb', MONTHLY_ORBS);
    addToInv('Raid Pass', MONTHLY_PASSES);
    addToInv('Wishing Compass', MONTHLY_COMPASSES);

    wallet.lastMonthly = new Date(now);
    await wallet.save();

    return {
        success: true,
        coinsAwarded: MONTHLY_COINS,
        ballsAwarded: MONTHLY_BALLS,
        orbsAwarded: MONTHLY_ORBS,
        passesAwarded: MONTHLY_PASSES,
        compassesAwarded: MONTHLY_COMPASSES,
        totalCoins: wallet.pokecoins,
        totalBalls: wallet.pokeballs,
    };
}

const SUMMON_COOLDOWN_MS = 24 * 60 * 60 * 1000; // 24 hours (1 day)

/**
 * Check if the user is allowed to summon (i.e. check 1-day cooldown).
 */
async function checkSummonCooldown(userId) {
    const wallet = await getWallet(userId);
    const now = Date.now();

    if (wallet.lastSummon) {
        const elapsed = now - wallet.lastSummon.getTime();
        if (elapsed < SUMMON_COOLDOWN_MS) {
            const remaining = SUMMON_COOLDOWN_MS - elapsed;
            const hours = Math.floor(remaining / (60 * 60 * 1000));
            const minutes = Math.floor((remaining % (60 * 60 * 1000)) / (60 * 1000));
            return {
                allowed: false,
                hours,
                minutes,
            };
        }
    }

    return { allowed: true };
}

/**
 * Update the lastSummon timestamp for the user.
 */
async function recordSummonUsage(userId) {
    const wallet = await getWallet(userId);
    wallet.lastSummon = new Date();
    await wallet.save();
}

// ─── Radiant Crystal Management ───

/**
 * Add Radiant Crystals to a player.
 */
async function addRadiantCrystals(userId, amount) {
    const wallet = await getWallet(userId);
    wallet.radiantCrystals = (wallet.radiantCrystals || 0) + amount;
    await wallet.save();
    return wallet.radiantCrystals;
}

/**
 * Deduct Radiant Crystals from a player. Returns false if insufficient.
 */
async function deductRadiantCrystals(userId, amount) {
    const wallet = await getWallet(userId);
    const crystals = wallet.radiantCrystals || 0;
    if (crystals < amount) return { success: false, balance: crystals };
    wallet.radiantCrystals -= amount;
    await wallet.save();
    return { success: true, balance: wallet.radiantCrystals };
}

/**
 * Get Radiant Crystal balance.
 */
async function getRadiantCrystals(userId) {
    const wallet = await getWallet(userId);
    return wallet.radiantCrystals || 0;
}

// ─── Progression System: Level Cap ───

function getLevelCap(walletOrValues) {
    const prestige = walletOrValues.prestigeLevel || 0;
    const omega = walletOrValues.omegaLevel || 0;
    return 100 + (prestige * 100) + (omega * 1000);
}

async function getLevelCapForUser(userId) {
    const wallet = await getWallet(userId);
    return getLevelCap(wallet);
}

// ─── Prestige System ───

function getPrestigeRequirements(currentPrestige) {
    return {
        minDex: 100,
        minLeveledPokemon: 20,
        minPokemonLevel: 100 + (currentPrestige * 100),
        minCoins: 300000 + (currentPrestige * 100000),
    };
}

async function checkPrestigeEligibility(userId) {
    const wallet = await getWallet(userId);
    const reqs = getPrestigeRequirements(wallet.prestigeLevel);

    const allEntries = await PokemonEntry.find({ userId });
    const pokemonStore = require('./pokemonStore');
    if (allEntries.length < reqs.minDex) {
        return { eligible: false, reason: 'insufficient_dex', have: allEntries.length, need: reqs.minDex, requirements: reqs };
    }

    const qualifyingPokemon = allEntries.filter(e => e.level >= reqs.minPokemonLevel);
    if (qualifyingPokemon.length < reqs.minLeveledPokemon) {
        return { eligible: false, reason: 'insufficient_leveled', have: qualifyingPokemon.length, need: reqs.minLeveledPokemon, minLevel: reqs.minPokemonLevel, requirements: reqs };
    }

    if (wallet.pokecoins < reqs.minCoins) {
        return { eligible: false, reason: 'insufficient_coins', have: wallet.pokecoins, need: reqs.minCoins, requirements: reqs };
    }

    return { eligible: true, requirements: reqs, wallet };
}

async function performPrestige(userId) {
    const eligibility = await checkPrestigeEligibility(userId);
    if (!eligibility.eligible) return { success: false, ...eligibility };

    const wallet = eligibility.wallet || await getWallet(userId);
    const reqs = eligibility.requirements;

    wallet.pokecoins -= reqs.minCoins;
    wallet.prestigeLevel += 1;
    wallet.totalPrestigeCount += 1;
    wallet.userXP = (wallet.userXP || 0) + 500;

    wallet.lastDaily = null;
    wallet.lastWeekly = null;
    wallet.lastMonthly = null;
    wallet.lastSummon = null;

    await wallet.save();
    await PokemonEntry.updateMany({ userId }, { level: 1 });

    return {
        success: true,
        newPrestige: wallet.prestigeLevel,
        newLevelCap: getLevelCap(wallet),
        coinsDeducted: reqs.minCoins,
    };
}

// ─── Omega System ───

function getOmegaRequirements(currentOmega) {
    return {
        minPrestige: 10 + currentOmega,
        minCoins: 1000000,
        minLeveledPokemon: 30,
        minPokemonLevel: 500 + (currentOmega * 500),
        minTotalPokemon: 800,
    };
}

async function checkOmegaEligibility(userId) {
    const wallet = await getWallet(userId);
    const reqs = getOmegaRequirements(wallet.omegaLevel);

    if (wallet.prestigeLevel < reqs.minPrestige) {
        return { eligible: false, reason: 'insufficient_prestige', have: wallet.prestigeLevel, need: reqs.minPrestige, requirements: reqs };
    }

    if (wallet.pokecoins < reqs.minCoins) {
        return { eligible: false, reason: 'insufficient_coins', have: wallet.pokecoins, need: reqs.minCoins, requirements: reqs };
    }

    const allEntries = await PokemonEntry.find({ userId });
    if (allEntries.length < reqs.minTotalPokemon) {
        return { eligible: false, reason: 'insufficient_pokemon', have: allEntries.length, need: reqs.minTotalPokemon, requirements: reqs };
    }

    const qualifyingPokemon = allEntries.filter(e => e.level >= reqs.minPokemonLevel);
    if (qualifyingPokemon.length < reqs.minLeveledPokemon) {
        return { eligible: false, reason: 'insufficient_leveled', have: qualifyingPokemon.length, need: reqs.minLeveledPokemon, minLevel: reqs.minPokemonLevel, requirements: reqs };
    }

    return { eligible: true, requirements: reqs, wallet };
}

async function performOmega(userId) {
    const eligibility = await checkOmegaEligibility(userId);
    if (!eligibility.eligible) return { success: false, ...eligibility };

    const wallet = eligibility.wallet || await getWallet(userId);

    wallet.pokecoins = 0;
    wallet.pokeballs = 20;
    
    // Preserve Wishing Compasses, wipe other items
    const compassItem = wallet.inventory.find(i => i.itemName === 'Wishing Compass');
    wallet.inventory = compassItem && compassItem.quantity > 0 ? [compassItem] : [];
    wallet.prestigeLevel = 0;
    wallet.omegaLevel += 1;
    wallet.totalOmegaCount += 1;
    wallet.userXP = (wallet.userXP || 0) + 2000;

    wallet.lastDaily = null;
    wallet.lastWeekly = null;
    wallet.lastMonthly = null;
    wallet.lastSummon = null;

    await wallet.save();
    await PokemonEntry.updateMany({ userId }, { level: 1 });

    return {
        success: true,
        newOmega: wallet.omegaLevel,
        newLevelCap: getLevelCap(wallet),
        summonCandlesPerDay: 5,
    };
}

// ─── User XP / Level System ───
// Progressive scaling: Level 1→2 = 100 XP, each subsequent level +50 more
// XP for level N to N+1 = 100 + (N-1)*50
// Total XP to reach level N = 25*(N-1)*(N+2)

function xpForLevel(level) {
    return 100 + ((level - 1) * 50);
}

function totalXPForLevel(level) {
    if (level <= 1) return 0;
    return 25 * (level - 1) * (level + 2);
}

function getRankBadge(level, levelCap = 100) {
    if (!levelCap || levelCap < 100) levelCap = 100;
    const ratio = level / levelCap;
    if (ratio > 0.90) return '🔥 S-Rank';
    if (ratio > 0.80) return '⭐ A-Rank';
    if (ratio > 0.70) return '🟢 B-Rank';
    if (ratio > 0.60) return '🔵 C-Rank';
    if (ratio > 0.50) return '🟣 D-Rank';
    return '⬜ F-Rank';
}

function calculateUserLevel(xp) {
    if (!xp || xp <= 0) return 1;
    const L = Math.floor((-1 + Math.sqrt(1 + 4 * (2 + xp / 25))) / 2);
    return Math.max(1, L);
}

async function addUserXP(userId, amount) {
    const wallet = await getWallet(userId);
    wallet.userXP = (wallet.userXP || 0) + amount;
    await wallet.save();
    return wallet.userXP;
}

// ─── Profile ───

async function getUserProfile(userId) {
    const wallet = await getWallet(userId);
    const allEntries = await PokemonEntry.find({ userId });
    const pokemonStore = require('./pokemonStore');
    const uniqueIds = new Set(allEntries.map(e => e.dexId || pokemonStore.getDexId(e.pokemonName)));
    uniqueIds.delete(0);
    uniqueIds.delete(undefined);
    const bestLevel = allEntries.length > 0 ? Math.max(...allEntries.map(e => e.level)) : 0;
    const sumLevels = allEntries.reduce((sum, e) => sum + e.level, 0);
    const avgLevel = allEntries.length > 0 ? Math.round(sumLevels / allEntries.length) : 0;

    let legendariesCaught = 0;
    let mythicalsCaught = 0;
    for (const entry of allEntries) {
        const meta = pokemonStore.pokemonMetaMap[entry.pokemonName.toLowerCase()];
        if (meta) {
            if (meta.isLeg) legendariesCaught++;
            if (meta.isMyth) mythicalsCaught++;
        }
    }

    const levelCap = getLevelCap(wallet);
    const userLevel = calculateUserLevel(wallet.userXP || 0);
    const xpNeededForNext = totalXPForLevel(userLevel + 1);
    const xpToNext = xpNeededForNext - (wallet.userXP || 0);
    const xpForCurrentLevel = xpForLevel(userLevel);
    const xpProgressInLevel = (wallet.userXP || 0) - totalXPForLevel(userLevel);

    let itemWorth = 0;
    for (const item of wallet.inventory) {
        const details = getItemDetails(item.itemName);
        if (details) {
            itemWorth += (details.price || 0) * (item.quantity || 0);
        }
    }
    const crystalWorth = (wallet.radiantCrystals || 0) * 1500;
    const netWorth = wallet.pokecoins + crystalWorth + itemWorth + (wallet.pokeballs * 25);

    return {
        pokecoins: wallet.pokecoins,
        pokeballs: wallet.pokeballs,
        radiantCrystals: wallet.radiantCrystals || 0,
        prestigeLevel: wallet.prestigeLevel || 0,
        omegaLevel: wallet.omegaLevel || 0,
        totalPrestigeCount: wallet.totalPrestigeCount || 0,
        totalOmegaCount: wallet.totalOmegaCount || 0,
        userLevel,
        userXP: wallet.userXP || 0,
        xpToNext,
        xpForCurrentLevel,
        xpProgressInLevel,
        levelCap,
        totalPokemon: allEntries.length,
        uniquePokemon: uniqueIds.size,
        legendariesCaught,
        mythicalsCaught,
        bestLevel,
        avgLevel,
        netWorth,
        itemWorth,
        crystalWorth,
        inventory: wallet.inventory,
        createdAt: wallet.createdAt,
    };
}

module.exports = {
    getWallet,
    calculateCoinReward,
    addCoins,
    deductCoins,
    transferCoins,
    getBalance,
    hasPokeballs,
    consumePokeball,
    addPokeballs,
    addInventoryItem,
    removeInventoryItem,
    getInventory,
    buyItem,
    useLevelOrb,
    getMarketCatalog,
    getBalTop,
    getCrystalTop,
    getNetWorthTop,
    claimDaily,
    claimWeekly,
    claimMonthly,
    checkSummonCooldown,
    recordSummonUsage,
    getItemDetails,
    addRadiantCrystals,
    deductRadiantCrystals,
    getRadiantCrystals,
    getLevelCap,
    getLevelCapForUser,
    getPrestigeRequirements,
    checkPrestigeEligibility,
    performPrestige,
    getOmegaRequirements,
    checkOmegaEligibility,
    performOmega,
    calculateUserLevel,
    addUserXP,
    getUserProfile,
    getRankBadge,
    MARKET_ITEMS,
};
