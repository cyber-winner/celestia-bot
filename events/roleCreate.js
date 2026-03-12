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

            
            
            
            if (qRole.position > 1) {
                await qRole.setPosition(1, { reason: 'Ensuring Quarantine role stays at bottom' });
            }
        } catch (error) {
            console.error('[RoleCreate Event] Error repositioning quarantine role:', error);
        }
    },
};
