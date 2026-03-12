const { Events } = require('discord.js');
const Guild = require('../models/Guild');

module.exports = {
    name: Events.GuildRoleCreate,
    async execute(role) {
        try {
            const settings = await Guild.findOne({ guildId: role.guild.id });
            if (!settings || !settings.quarantineRoleId) return;

            const qRole = role.guild.roles.cache.get(settings.quarantineRoleId);
            if (!qRole) return;

            // If a new role is created, and it's placed below the quarantine role,
            // or if the quarantine role isn't at position 1 (right above @everyone), move it down.
            // Note: role hierarchies updates can be tricky, position 1 is above the default role.
            if (qRole.position > 1) {
                await qRole.setPosition(1, { reason: 'Ensuring Quarantine role stays at bottom' });
            }
        } catch (error) {
            console.error('[RoleCreate Event] Error repositioning quarantine role:', error);
        }
    },
};
