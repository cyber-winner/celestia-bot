const { Events } = require('discord.js');
const Snipe = require('../models/Snipe');

module.exports = {
    name: Events.MessageDelete,
    async execute(message) {
        if (message.partial || message.author?.bot) return;

        await Snipe.create({
            guildId: message.guild.id,
            channelId: message.channel.id,
            authorId: message.author.id,
            content: message.content,
            attachments: message.attachments.map(a => a.url),
            type: 'DELETE'
        });
    },
};
