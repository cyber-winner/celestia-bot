/**
 * Terms of Service — Celestia Bot
 * Sent via DM when a user first interacts with the bot.
 */

const TOS_VERSION = 2; // Increment this to force all users to re-accept

const TOS_TEXT =
    `Welcome, Trainer! Before you begin your journey with **Celestia**, you must read and agree to the following rules. These exist to keep the game fair, fun, and enjoyable for everyone.\n\n` +

    `**1. 🤖 No Automation — Zero Tolerance**\n` +
    `> The use of any form of automation is **strictly prohibited** and is a **permanently bannable offence**. This includes auto-clickers, macro scripts, scheduled bots, or any software that interacts with Celestia without direct human input.\n\n` +

    `**2. 🏠 Pokémon Features — Designated Servers**\n` +
    `> Celestia's Pokémon features are primarily available in designated servers. You must receive **personal permission from Cyber (Father)** to enable Pokémon features in additional servers.\n\n` +

    `**3. 👑 Cyber's Authority — No External Rules**\n` +
    `> No server using Celestia will be bound by rules not implemented by Cyber (Father). The only rules that apply are those enforced by the bot and set by Cyber.\n\n` +

    `**4. 🐛 Glitch & Bug Reporting**\n` +
    `> Intentionally abusing glitches or exploits is a **bannable offence**. Report bugs immediately to Cyber — do not share them or use them for personal gain.\n\n` +

    `**5. 🚫 No Gatekeeping — Everyone Plays**\n` +
    `> Telling other players to stop playing, leave, or go somewhere else is **strictly forbidden**. Celestia is for everyone.\n\n` +

    `**6. 💬 Respectful Conduct — Be Kind**\n` +
    `> Personal attacks, slurs, harassment, bullying, discrimination, or hate speech are **not tolerated**.\n\n` +

    `**7. ⚡ Gameplay Changes — No Prior Notice Required**\n` +
    `> Any part of the game may be edited, modified, rebalanced, reset, or removed at any time without prior notice. Cyber is not liable for any changes.\n\n` +

    `**8. 📝 Terms Are Subject to Change**\n` +
    `> These Terms of Service may be updated at any time. You may be required to re-accept updated terms.\n\n` +

    `**9. 💰 Economy & Trading**\n` +
    `> Real-Money Trading (RMT) is permitted only with Cyber's direct involvement and approval. No scamming. All transactions are final.\n\n` +

    `**10. 🔐 Account Responsibility**\n` +
    `> You are solely responsible for all actions taken on your account. Lost items due to account sharing will not be restored.\n\n` +

    `**11. 🛡️ Data & Privacy**\n` +
    `> Celestia stores your Discord user ID, game progress, and interaction history solely for bot functionality. No data is sold or shared.\n\n` +

    `**12. ⏳ Service Availability**\n` +
    `> Celestia is provided as-is with no guarantees of uptime. Cyber is not liable for losses caused by downtime.\n\n` +

    `**⚖️ Violations & Enforcement**\n` +
    `> Breaking any rule may result in temporary/permanent bans, loss of Pokémon/items/currency, or removal from Celestia-enabled servers. Cyber's judgment is final.\n\n` +

    `*By clicking the button below, you acknowledge that you have read, understood, and accepted all terms listed above.*`;

const TOS_ACCEPTED_MSG = `Thank you for agreeing to Celestia's Terms of Service!\n\n🔓 **Your account is now unlocked!**\nAll commands and features are now available to you.\n\n🎮 Use \`/help\` to see all available commands!`;

const TOS_ALREADY_ACCEPTED_MSG = `You have already accepted the Terms of Service!\n\nYour account is fully unlocked. Enjoy your adventure! 🎮`;

module.exports = {
    TOS_VERSION,
    TOS_TEXT,
    TOS_ACCEPTED_MSG,
    TOS_ALREADY_ACCEPTED_MSG,
};
