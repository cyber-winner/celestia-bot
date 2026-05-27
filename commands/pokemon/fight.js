/**
 * /fight — PvP Pokémon battle with Components V2.
 */
const { SlashCommandBuilder, ContainerBuilder, TextDisplayBuilder, SeparatorBuilder, SeparatorSpacingSize, MediaGalleryBuilder, MediaGalleryItemBuilder, MessageFlags } = require('discord.js');
const PokemonEntry = require('../../models/Pokemon');
const pokemonStore = require('../../store/pokemonStore');
const accountStore = require('../../store/accountStore');
const { COLORS, errorContainer, getTypeColor } = require('../../utils/componentBuilder');

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

module.exports = {
    data: new SlashCommandBuilder()
        .setName('fight')
        .setDescription('Battle another trainer\'s Pokémon!')
        .addUserOption(opt => opt.setName('opponent').setDescription('Who to fight').setRequired(true))
        .addStringOption(opt => opt.setName('your_pokemon').setDescription('Your fighter').setRequired(true))
        .addStringOption(opt => opt.setName('their_pokemon').setDescription('Their Pokémon to fight').setRequired(true)),
    aliases: ['battle', 'pvp'],

    async execute(interaction, client, args) {
        const isInteraction = typeof interaction.isChatInputCommand === 'function' && interaction.isChatInputCommand();
        const author = isInteraction ? interaction.user : interaction.author;

        let opponent = null;
        let myPokemonName = null;
        let theirPokemonName = null;

        if (isInteraction) {
            opponent = interaction.options.getUser('opponent');
            myPokemonName = interaction.options.getString('your_pokemon');
            theirPokemonName = interaction.options.getString('their_pokemon');
        } else if (args && args.length > 0) {
            opponent = interaction.mentions?.users?.first();
            const nonMentions = args.filter(a => !a.startsWith('<@') && !a.endsWith('>'));
            myPokemonName = nonMentions[0];
            theirPokemonName = nonMentions[1];
        }

        if (!opponent || !myPokemonName || !theirPokemonName) {
            return interaction.reply({
                components: [errorContainer('Invalid Battle', `👤 **${author.username}**: Specify opponent and both Pokémon: \`!fight @opponent <your_pokemon> <their_pokemon>\``)],
                flags: MessageFlags.IsComponentsV2,
            });
        }

        if (opponent.id === author.id) {
            return interaction.reply({ components: [errorContainer('Error', `👤 **${author.username}**: Can't fight yourself!`)], flags: MessageFlags.IsComponentsV2 });
        }

        if (isInteraction) {
            await interaction.deferReply({ flags: MessageFlags.IsComponentsV2 });
        }

        const myId = await accountStore.resolveUserId(author.id);
        const theirId = await accountStore.resolveUserId(opponent.id);

        const myEntry = await PokemonEntry.findOne({
            userId: myId,
            pokemonName: { $regex: new RegExp(`^${myPokemonName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`, 'i') },
        }).sort({ level: -1 });

        const theirEntry = await PokemonEntry.findOne({
            userId: theirId,
            pokemonName: { $regex: new RegExp(`^${theirPokemonName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`, 'i') },
        }).sort({ level: -1 });

        if (!myEntry) {
            const container = errorContainer('Not Found', `You don't own **${myPokemonName}**!`);
            if (isInteraction) return interaction.editReply({ components: [container], flags: MessageFlags.IsComponentsV2 });
            else return interaction.reply({ components: [container], flags: MessageFlags.IsComponentsV2 });
        }
        if (!theirEntry) {
            const container = errorContainer('Not Found', `**${opponent.username}** doesn't own **${theirPokemonName}**!`);
            if (isInteraction) return interaction.editReply({ components: [container], flags: MessageFlags.IsComponentsV2 });
            else return interaction.reply({ components: [container], flags: MessageFlags.IsComponentsV2 });
        }

        const myData = pokemonStore.getStaticData(myEntry.pokemonName) || { hp: 70, baseStats: {}, types: ['Normal'], attacks: [{ name: 'Tackle', power: 40, type: 'Normal' }] };
        const theirData = pokemonStore.getStaticData(theirEntry.pokemonName) || { hp: 70, baseStats: {}, types: ['Normal'], attacks: [{ name: 'Tackle', power: 40, type: 'Normal' }] };

        const scale = (b, l) => Math.floor((b || 50) * (1 + l / 50));

        const f1 = {
            name: myEntry.pokemonName, level: myEntry.level,
            maxHp: scale(parseInt(myData.hp || 70), myEntry.level),
            atk: scale(myData.baseStats?.atk || 60, myEntry.level),
            def: scale(myData.baseStats?.def || 55, myEntry.level),
            speed: scale(myData.baseStats?.speed || 50, myEntry.level),
            types: myData.types || ['Normal'],
            attacks: (myData.attacks || []).filter(a => a.power > 0),
        };
        f1.hp = f1.maxHp;
        if (f1.attacks.length === 0) f1.attacks = [{ name: 'Tackle', power: 40, type: 'Normal' }];

        const f2 = {
            name: theirEntry.pokemonName, level: theirEntry.level,
            maxHp: scale(parseInt(theirData.hp || 70), theirEntry.level),
            atk: scale(theirData.baseStats?.atk || 60, theirEntry.level),
            def: scale(theirData.baseStats?.def || 55, theirEntry.level),
            speed: scale(theirData.baseStats?.speed || 50, theirEntry.level),
            types: theirData.types || ['Normal'],
            attacks: (theirData.attacks || []).filter(a => a.power > 0),
        };
        f2.hp = f2.maxHp;
        if (f2.attacks.length === 0) f2.attacks = [{ name: 'Tackle', power: 40, type: 'Normal' }];

        // Simulate battle (max 50 turns)
        let battleLog = [];
        const first = f1.speed >= f2.speed ? [f1, f2] : [f2, f1];
        const [attacker1, attacker2] = first;
        const names = { [f1.name]: author.username, [f2.name]: opponent.username };

        for (let turn = 1; turn <= 50; turn++) {
            for (const [atk, def] of [[attacker1, attacker2], [attacker2, attacker1]]) {
                if (atk.hp <= 0 || def.hp <= 0) break;
                const move = atk.attacks[Math.floor(Math.random() * atk.attacks.length)];
                let typeMult = 1.0;
                for (const defType of def.types) {
                    if (TYPE_CHART[move.type]?.[defType] !== undefined) typeMult *= TYPE_CHART[move.type][defType];
                }
                const baseDmg = Math.floor((move.power * (atk.atk / 40) * (atk.level / 30)) + 8);
                const crit = Math.random() < 0.1 ? 1.8 : 1.0;
                const variance = Math.random() * 0.15 + 0.85;
                const beforeDef = Math.floor(baseDmg * crit * typeMult * variance);
                const mit = Math.min(0.55, def.def / (def.def + 180));
                const dmg = Math.max(5, Math.floor(beforeDef * (1 - mit)));
                def.hp = Math.max(0, def.hp - dmg);

                let effectText = typeMult > 1 ? ' ⚡ Super effective!' : typeMult < 1 && typeMult > 0 ? ' 🛡️ Not very effective...' : typeMult === 0 ? ' ❌ No effect!' : '';
                if (crit > 1) effectText += ' 💥 Critical!';
                battleLog.push(`**${atk.name}** used **${move.name}** → ${dmg} dmg${effectText}`);
                if (def.hp <= 0) break;
            }
            if (f1.hp <= 0 || f2.hp <= 0) break;
        }

        const winner = f1.hp > 0 ? author : opponent;
        const winnerPkmn = f1.hp > 0 ? f1 : f2;
        const loserPkmn = f1.hp > 0 ? f2 : f1;

        // Award 10 XP to winner
        try {
            const winnerDbId = await accountStore.resolveUserId(winner.id);
            await economyStore.addUserXP(winnerDbId, 10);
        } catch (xpErr) {
            console.error('[Fight XP Reward] Error:', xpErr);
        }

        const container = new ContainerBuilder().setAccentColor(getTypeColor(winnerPkmn.types));
        container.addTextDisplayComponents(new TextDisplayBuilder().setContent(`## ⚔️ Pokémon Battle!`));

        const images = [];
        if (myData.cardImage) images.push(new MediaGalleryItemBuilder().setURL(myData.cardImage));
        if (theirData.cardImage) images.push(new MediaGalleryItemBuilder().setURL(theirData.cardImage));
        if (images.length > 0) {
            const gallery = new MediaGalleryBuilder();
            images.forEach(img => gallery.addItems(img));
            container.addMediaGalleryComponents(gallery);
        }

        container.addSeparatorComponents(new SeparatorBuilder().setSpacing(SeparatorSpacingSize.Small).setDivider(true));

        // Show last 8 log entries
        const recentLog = battleLog.slice(-8).map(l => `> ${l}`).join('\n');
        container.addTextDisplayComponents(new TextDisplayBuilder().setContent(
            `**${author.username}**'s ${f1.name} (Lv.${f1.level}) vs **${opponent.username}**'s ${f2.name} (Lv.${f2.level})\n\n` +
            `### Battle Log\n${recentLog}\n\n` +
            `### 🏆 Result\n` +
            `**${winner.username}**'s **${winnerPkmn.name}** wins with ${winnerPkmn.hp}/${winnerPkmn.maxHp} HP remaining! (+10 XP)\n` +
            `**${loserPkmn.name}** fainted! 💀`
        ));

        if (isInteraction) {
            await interaction.editReply({ components: [container], flags: MessageFlags.IsComponentsV2 });
        } else {
            await interaction.reply({ components: [container], flags: MessageFlags.IsComponentsV2 });
        }
    },
};
