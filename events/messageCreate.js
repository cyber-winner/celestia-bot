const { Events } = require('discord.js');
const Guild = require('../models/Guild');

module.exports = {
    name: Events.MessageCreate,
    async execute(message, client) {
        if (message.author.bot || !message.guild) return;

        let settings = await Guild.findOne({ guildId: message.guild.id });
        if (!settings) {
            settings = await Guild.create({ guildId: message.guild.id });
        }

        const prefix = settings.prefix;

        if (!message.content.startsWith(prefix)) return;

        const args = message.content.slice(prefix.length).trim().split(/ +/);
        const commandName = args.shift().toLowerCase();

        const command = client.commands.get(commandName);

        if (!command) return;

        try {
            
            
            await command.execute(message, client, args);
        } catch (error) {
            console.error(error);
            message.reply('There was an error while executing this command!');
        }
    },
};
