const { Events } = require('discord.js');
const Guild = require('../models/Guild');

module.exports = {
    name: Events.GuildMemberUpdate,
    async execute(oldMember, newMember) {
        const guild = newMember.guild;
        const settings = await Guild.findOne({ guildId: guild.id });

        if (!settings?.quarantineRoleId) return;

        const qRole = guild.roles.cache.get(settings.quarantineRoleId);
        if (!qRole) return;

        
        
        

        if (qRole.position !== 1 && guild.members.me.permissions.has('ManageRoles')) {
            try {
                await guild.roles.setPositions([{ role: qRole.id, position: 1 }]);
                console.log(`Auto-adjusted Quarantine role position in ${guild.name}`);
            } catch (err) {
                console.error(`Failed to adjust Quarantine role position: ${err}`);
            }
        }
    },
};
