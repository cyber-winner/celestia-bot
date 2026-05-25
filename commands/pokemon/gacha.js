/**
 * /gacha — View active gacha banners, rates, and pity status.
 */
const { SlashCommandBuilder, ContainerBuilder, TextDisplayBuilder, SeparatorBuilder, SeparatorSpacingSize, ActionRowBuilder, ButtonBuilder, ButtonStyle, MessageFlags } = require('discord.js');
const gachaStore = require('../../store/gachaStore');
const accountStore = require('../../store/accountStore');
const { COLORS } = require('../../utils/componentBuilder');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('gacha')
        .setDescription('View active gacha banner details, rates, and pity status')
        .addStringOption(opt =>
            opt.setName('action')
                .setDescription('Select view')
                .setRequired(false)
                .addChoices(
                    { name: 'Active Banner', value: 'banner' },
                    { name: 'Wishing Guide', value: 'info' }
                )
        ),
    aliases: ['banner', 'banners', 'gachainfo'],

    async execute(interaction, client, args) {
        const isInteraction = typeof interaction.isChatInputCommand === 'function' && interaction.isChatInputCommand();
        const author = isInteraction ? interaction.user : interaction.author;
        const userId = await accountStore.resolveUserId(author.id);

        let action = 'banner';
        if (isInteraction) {
            action = interaction.options.getString('action') || 'banner';
        } else if (args && args.length > 0) {
            const sub = args[0].toLowerCase();
            if (sub === 'info' || sub === 'help' || sub === 'guide') {
                action = 'info';
            }
        }

        const banner = gachaStore.getBannerInfo();

        if (action === 'info') {
            const container = new ContainerBuilder()
                .setAccentColor(COLORS.CELESTIA)
                .addTextDisplayComponents(new TextDisplayBuilder().setContent(`## 🧭 Celestia Wishing Guide`))
                .addSeparatorComponents(new SeparatorBuilder().setSpacing(SeparatorSpacingSize.Small).setDivider(true))
                .addTextDisplayComponents(new TextDisplayBuilder().setContent(
                    `Welcome to the Celestia Gacha Wishing Guide. Here is a breakdown of the mathematical probabilities, pity mechanics, and currencies.\n\n` +
                    `### 💎 1. Currency & Wishing Cost\n` +
                    `* **Wishing Compass** (🧭): Required to make a wish pull.\n` +
                    `  * Cost: **160 Radiant Crystals** (💎) per Compass.\n` +
                    `  * Purchase: \`/pokemart buy item:wishing compass\`\n\n` +
                    `* **How to earn Radiant Crystals (💎):**\n` +
                    `  * Catch a **Legendary Pokémon** in the wild: **+80** 💎\n` +
                    `  * Catch a **Mythical / Ultra Beast** in the wild: **+160** 💎\n` +
                    `  * Win a **Global Raid Battle**: **+480** 💎 (all active winners)\n\n` +
                    `### 📊 2. Rates & Pity Calculations\n` +
                    `Celestia uses a custom piece-wise probability distribution with a Soft Pity system and a Hard Pity cap.\n\n` +
                    `🌟 **5-Star Pokémon (Legendary/Mythical):**\n` +
                    `  * **Base Probability:** **0.6%** (Pulls 1 to 73)\n` +
                    `  * **Soft Pity:** Begins at pull **74**. Rate increases by **+6.0%** per pull (e.g., pull 74 has a 6.6% rate, pull 75 has 12.6%, etc.).\n` +
                    `  * **Hard Pity:** **100%** guaranteed at pull **90**.\n\n` +
                    `💜 **4-Star Pokémon (Featured Pool):**\n` +
                    `  * **Base Probability:** **5.1%** (Pulls 1 to 8)\n` +
                    `  * **Soft Pity:** Pull **9** has a boosted **56.1%** rate.\n` +
                    `  * **Hard Pity:** **100%** guaranteed at pull **10**.\n\n` +
                    `### ⚖️ 3. Featured 50/50 Guarantee System\n` +
                    `When you hit a 5-star Pokémon:\n` +
                    `* There is a **55%** chance it will be the **Featured Pokémon Variant** (e.g., *${banner.featured5Star}* variants like GX/EX/LV.X).\n` +
                    `* There is a **45%** chance it will be the **Standard Base Pokémon** (e.g., standard *${banner.featured5Star}*).\n` +
                    `* **The Guarantee:** If you lose the 50/50 and get the Standard Base Pokémon, your **next 5-star is 100% guaranteed** to be the Featured Pokémon Variant.\n\n` +
                    `### ✨ 4. Gacha Boosts & Variants\n` +
                    `* **Variant Form Chance:** Any 4-star Pokémon won from wishing has a **50%** chance to be a premium **Variant card** instead of its base form.\n` +
                    `* **Max Level & Double Stats:** All Pokémon obtained via wishes are pre-trained to **Level 100** with **2× Max Stats** permanently!`
                ));

            const row = new ActionRowBuilder().addComponents(
                new ButtonBuilder().setCustomId('gacha_view_banner').setLabel('View Active Banner').setStyle(ButtonStyle.Primary).setEmoji('🧭')
            );

            return interaction.reply({ components: [container, row], flags: MessageFlags.IsComponentsV2 });
        }

        // Active Banner view
        const profile = await gachaStore.getProfileStats(userId);
        const current5Rate = gachaStore.get5StarRate(profile.pity5 + 1);
        const current4Rate = gachaStore.get4StarRate(profile.pity4 + 1);

        const container = new ContainerBuilder()
            .setAccentColor(COLORS.CELESTIA)
            .addTextDisplayComponents(new TextDisplayBuilder().setContent(`## 🧭 Active Banner: ${banner.name}`))
            .addSeparatorComponents(new SeparatorBuilder().setSpacing(SeparatorSpacingSize.Small).setDivider(true))
            .addTextDisplayComponents(new TextDisplayBuilder().setContent(
                `### ⭐⭐⭐⭐⭐ 5-STAR POOL:\n` +
                `* 👑 **${banner.featured5Star}** — Legendary Ruler\n` +
                `  *(Standard Base Form or premium Variant Form)*\n\n` +
                `### ⭐⭐⭐⭐ 4-STAR POOL:\n` +
                `* 🔥 ${banner.pool4Star.join(' | ')}\n\n` +
                `### ⭐⭐⭐ 3-STAR REWARD:\n` +
                `* 🔮 Level Orb ×1\n\n` +
                `### 📈 Pity Status — ${author.username}\n` +
                `* ⭐ 5★ Pity Counter: **${profile.pity5}/90**\n` +
                `* 💜 4★ Pity Counter: **${profile.pity4}/10**\n` +
                `* 🎯 Next 5★: ${profile.guaranteed5 ? '✅ **GUARANTEED VARIANT**' : '🎲 50/50 Coin Flip'}\n\n` +
                `### 📊 Current Rates (Next Pull)\n` +
                `* ⭐ 5★ Rate: **${(current5Rate * 100).toFixed(1)}%**${profile.pity5 >= 73 ? ' 🔥 SOFT PITY!' : ''}\n` +
                `* 💜 4★ Rate: **${(current4Rate * 100).toFixed(1)}%**${profile.pity4 >= 8 ? ' 🔥 SOFT PITY!' : ''}\n\n` +
                `### 📊 Lifetime Stats\n` +
                `* 🎰 Total Wishes: ${profile.totalWishes} · 5★: ${profile.total5Stars} · 4★: ${profile.total4Stars}\n\n` +
                `> _All gacha Pokémon are Lv. 100 with 2× boosted stats!_ 🔥`
            ));

        const row = new ActionRowBuilder().addComponents(
            new ButtonBuilder().setCustomId('gacha_view_guide').setLabel('Wishing Guide').setStyle(ButtonStyle.Primary).setEmoji('📖')
        );

        return interaction.reply({ components: [container, row], flags: MessageFlags.IsComponentsV2 });
    },

    async handleButton(interaction) {
        const id = interaction.customId;
        if (id === 'gacha_view_banner') {
            interaction.options = { getString: () => 'banner' };
            await this.execute(interaction);
        } else if (id === 'gacha_view_guide') {
            interaction.options = { getString: () => 'info' };
            await this.execute(interaction);
        }
    }
};
