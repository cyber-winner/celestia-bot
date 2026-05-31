/**
 * Gacha Store — Celestia Wishing System (Genshin Impact-exact pity mechanics)
 *
 * ─── Pity Architecture ───
 *   5-Star: Flat 0.6% for pulls 1–73, soft pity ramp +6% per pull 74–89, hard pity 100% at pull 90
 *   4-Star: Flat 5.1% for pulls 1–8, soft pity 56.1% at pull 9, hard pity 100% at pull 10
 *
 * ─── Featured 50/50 System ───
 *   On 5-star hit: 55% featured, 45% standard pool.
 *   If standard → next 5-star is guaranteed featured (100%).
 *
 * ─── Variant Rolling ───
 *   On 4★/5★ Pokémon hit: 50% base form, 50% random variant card.
 *   All gacha Pokémon are level of user's max level cap with 2× max stats.
 *
 * ─── Reward Pools ───
 *   5-Star: Dialga
 *   4-Star: Venusaur, Kyurem, Umbreon
 *   3-Star: Weighted Pool (Level Orb, Raid Pass, Enchanted Stardust, Dirty Diaper)
 */

const GachaProfile = require('../models/GachaProfile');
const PokemonEntry = require('../models/Pokemon');
const POKEMON_LIST = require('../data/pokemon.json');

// ─── Banner Configuration (loaded from JSON — edit data/gachaBanner.json to change pools) ───

const BANNER = require('../data/gachaBanner.json');

// ─── Pity Rate Constants (Genshin-exact) ───

const BASE_5STAR_RATE = 0.006;       // 0.6%
const SOFT_PITY_5STAR_START = 74;    // Soft pity begins at pull 74
const SOFT_PITY_5STAR_INCREMENT = 0.060; // +6% per pull after 73
const HARD_PITY_5STAR = 90;         // 100% at pull 90

const BASE_4STAR_RATE = 0.051;      // 5.1%
const SOFT_PITY_4STAR_PULL = 9;     // Soft pity at pull 9
const SOFT_PITY_4STAR_RATE = 0.561; // 56.1% at pull 9
const HARD_PITY_4STAR = 10;         // 100% at pull 10

const FEATURED_RATE = 0.55;         // 55% chance to get featured on 5-star win

// ─── Profile CRUD ───

async function getProfile(userId) {
    let profile = await GachaProfile.findOne({ userId });
    if (!profile) {
        profile = await GachaProfile.create({ userId });
    }
    return profile;
}

// ─── Pity Probability Calculators ───

/**
 * Calculate the marginal 5-star probability for a given pity count n.
 */
function get5StarRate(n) {
    if (n >= HARD_PITY_5STAR) return 1.0;
    if (n >= SOFT_PITY_5STAR_START) {
        return Math.min(1.0, BASE_5STAR_RATE + SOFT_PITY_5STAR_INCREMENT * (n - 73));
    }
    return BASE_5STAR_RATE;
}

/**
 * Calculate the marginal 4-star probability for a given pity count n.
 */
function get4StarRate(n) {
    if (n >= HARD_PITY_4STAR) return 1.0;
    if (n >= SOFT_PITY_4STAR_PULL) return SOFT_PITY_4STAR_RATE;
    return BASE_4STAR_RATE;
}

// ─── Variant Picker ───

/**
 * Pick a Pokémon card for the gacha result.
 * If wantVariant is true: pick a random variant (excluding the base form).
 * If wantVariant is false: pick the base form.
 * Matches by National Dex ID.
 */
function pickPokemonCard(baseNameOrId, wantVariant) {
    let baseCard;
    let targetId;

    if (typeof baseNameOrId === 'number' || !isNaN(baseNameOrId)) {
        targetId = parseInt(baseNameOrId);
        // Find all candidates with this ID
        const candidates = POKEMON_LIST.filter(p => p.id === targetId);
        if (candidates.length === 0) return null;
        // The base card is the one with the shortest name (e.g. "Palkia" instead of "Palkia-GX")
        candidates.sort((a, b) => a.name.length - b.name.length);
        baseCard = candidates[0];
    } else {
        const baseLower = baseNameOrId.toLowerCase();
        baseCard = POKEMON_LIST.find(p => p.name.toLowerCase() === baseLower);
        if (baseCard) {
            targetId = baseCard.id;
        }
    }

    if (!baseCard || !targetId) return null;

    // Find all variants sharing this Dex ID
    const allVariants = POKEMON_LIST.filter(p => p.id === targetId);

    // If we want the base form, or if there is only 1 variant (meaning no other forms exist)
    if (!wantVariant || allVariants.length <= 1) {
        return { ...baseCard, isVariant: false };
    }

    // Filter out the exact base card name to get the actual variants
    const variants = allVariants.filter(p => p.name.toLowerCase() !== baseCard.name.toLowerCase());
    if (variants.length === 0) {
        return { ...baseCard, isVariant: false };
    }

    // Pick a random variant
    const picked = variants[Math.floor(Math.random() * variants.length)];
    return { ...picked, isVariant: true };
}

// ─── Single Wish Execution ───

/**
 * Execute a single wish pull for a user.
 * Returns: { rarity: 5|4|3, result: {...}, profile }
 *
 * Rarity precedence: 5★ check first → 4★ check → 3★ default
 */
async function executeSingleWish(profile) {
    profile.pity5++;
    profile.pity4++;
    profile.totalWishes++;

    const currentPity5 = profile.pity5;
    const currentPity4 = profile.pity4;

    // ─── 5-Star Check ───
    const rate5 = get5StarRate(currentPity5);
    if (Math.random() < rate5) {
        // 5-STAR HIT!
        profile.pity5 = 0;  // Reset 5-star pity
        profile.pity4 = 0;  // 5-star also resets 4-star pity
        profile.total5Stars++;

        // Featured 50/50 check:
        // Winning the 50/50 = getting the featured variant (non-standard).
        // Losing the 50/50 = getting the base form of the featured Pokémon (standard).
        let isFeatured;
        if (profile.guaranteed5) {
            // Guaranteed featured (lost 50/50 last time)
            isFeatured = true;
            profile.guaranteed5 = false;
        } else {
            isFeatured = Math.random() < FEATURED_RATE;
            if (!isFeatured) {
                // Lost 50/50 — next 5-star will be guaranteed featured
                profile.guaranteed5 = true;
            }
        }

        const pokemonCard = pickPokemonCard(BANNER.featured5Star, isFeatured);

        return {
            rarity: 5,
            isFeatured, // True = Variant (featured), False = Base (standard)
            won5050: isFeatured && !profile.guaranteed5, // won the coin flip naturally
            pokemon: pokemonCard,
            pityCount: currentPity5,
        };
    }

    // ─── 4-Star Check ───
    const rate4 = get4StarRate(currentPity4);
    if (Math.random() < rate4) {
        // 4-STAR HIT!
        profile.pity4 = 0;  // Reset 4-star pity
        profile.total4Stars++;

        // Pick a random 4-star from the pool
        const chosen4Star = BANNER.pool4Star[Math.floor(Math.random() * BANNER.pool4Star.length)];
        const wantVariant = Math.random() < 0.5;
        const pokemonCard = pickPokemonCard(chosen4Star, wantVariant);

        return {
            rarity: 4,
            pokemon: pokemonCard,
            pityCount: currentPity4,
        };
    }

    // ─── 3-Star (Default) ───
    const pool = BANNER.pool3StarPool || [
        { "itemName": "Level Orb", "chance": 50 },
        { "itemName": "Raid Pass", "chance": 30 },
        { "itemName": "Enchanted Stardust", "chance": 19 },
        { "itemName": "Dirty Diaper", "chance": 1 }
    ];

    const roll3 = Math.random() * 100;
    let item3 = 'Level Orb';
    let cumulative = 0;
    for (const reward of pool) {
        cumulative += reward.chance;
        if (roll3 < cumulative) {
            item3 = reward.itemName;
            break;
        }
    }

    return {
        rarity: 3,
        item: item3,
        quantity: 1,
    };
}

// ─── Multi-Wish Execution ───

/**
 * Execute multiple wishes (1–10) for a user.
 * Handles profile loading, wish execution, Pokémon creation, and inventory updates.
 *
 * @param {string} userId - The user's ID
 * @param {number} wishCount - Number of wishes (1-10)
 * @param {object} economyStore - Reference to economyStore for inventory/crystal operations
 * @returns {object} { results: [...], profile, totalCrystalsSpent }
 */
async function executeWishes(userId, wishCount, economyStore) {
    const profile = await getProfile(userId);
    const results = [];

    for (let i = 0; i < wishCount; i++) {
        const result = await executeSingleWish(profile);

        if (result.rarity === 5 || result.rarity === 4) {
            const pokemon = result.pokemon;
            if (pokemon) {
                const levelCap = await economyStore.getLevelCapForUser(userId);
                const entry = await PokemonEntry.create({
                    userId,
                    pokemonName: pokemon.name,
                    level: levelCap,  // Gacha Pokémon are always max level cap of user
                    dexId: pokemon.id,
                });
                await economyStore.addUserXP(userId, 25);
                result.dbId = entry._id;
                result.pokemonName = pokemon.name;
                result.cardImage = pokemon.cardImage;
                result.types = pokemon.types;
                result.isVariant = pokemon.isVariant;
                result.level = levelCap;

                // Build the 2× max stats object
                const bs = pokemon.baseStats || { hp: 50, atk: 50, def: 50, spAtk: 50, spDef: 50, speed: 50 };
                result.doubledStats = {
                    hp: (bs.hp || 50) * 2,
                    atk: (bs.atk || 50) * 2,
                    def: (bs.def || 50) * 2,
                    spAtk: (bs.spAtk || 50) * 2,
                    spDef: (bs.spDef || 50) * 2,
                    speed: (bs.speed || 50) * 2,
                };
                result.isLegendary = pokemon.isLegendary || false;
                result.isMythical = pokemon.isMythical || false;
            }
        } else if (result.rarity === 3) {
            // Award Level Orb/Raid Pass/etc to inventory
            await economyStore.addInventoryItem(userId, result.item, result.quantity);
        }

        results.push(result);
    }

    // Save the updated profile
    await profile.save();

    return {
        results,
        profile: {
            pity5: profile.pity5,
            pity4: profile.pity4,
            guaranteed5: profile.guaranteed5,
            totalWishes: profile.totalWishes,
            total5Stars: profile.total5Stars,
            total4Stars: profile.total4Stars,
        },
    };
}

// ─── Info Helpers ───

function getBannerInfo() {
    const featured5StarCard = POKEMON_LIST.find(p => p.id === BANNER.featured5Star);
    const featured5StarName = featured5StarCard ? featured5StarCard.name : 'Unknown';

    const pool4StarNames = BANNER.pool4Star.map(id => {
        const card = POKEMON_LIST.find(p => p.id === id);
        return card ? card.name : 'Unknown';
    });

    return {
        name: BANNER.name,
        featured5Star: featured5StarName,
        featured5StarId: BANNER.featured5Star,
        pool4Star: pool4StarNames,
        pool4StarIds: [...BANNER.pool4Star],
        pool3StarPool: BANNER.pool3StarPool || []
    };
}

async function getProfileStats(userId) {
    const profile = await getProfile(userId);
    return {
        pity5: profile.pity5,
        pity4: profile.pity4,
        guaranteed5: profile.guaranteed5,
        totalWishes: profile.totalWishes,
        total5Stars: profile.total5Stars,
        total4Stars: profile.total4Stars,
    };
}

module.exports = {
    executeWishes,
    getProfile,
    getProfileStats,
    getBannerInfo,
    get5StarRate,
    get4StarRate,
    BANNER,
};
