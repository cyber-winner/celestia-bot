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
    if (entry.level >= 100) return { success: false, reason: 'max_level' };

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
    const maxGain = 100 - entry.level;
    const levelsGained = Math.floor(Math.random() * maxGain) + 1;
    entry.level = Math.min(entry.level + levelsGained, 100);
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
    claimDaily,
    claimWeekly,
    checkSummonCooldown,
    recordSummonUsage,
    getItemDetails,
    addRadiantCrystals,
    deductRadiantCrystals,
    getRadiantCrystals,
    MARKET_ITEMS,
};
