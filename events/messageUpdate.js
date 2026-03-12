const { Events } = require('discord.js');
const Snipe = require('../models/Snipe');

module.exports = {
    name: Events.MessageUpdate,
    async execute(oldMessage, newMessage) {
        if (oldMessage.partial) return;
        if (oldMessage.author?.bot) return;
        if (oldMessage.content === newMessage.content) return; 

        await Snipe.create({
            guildId: oldMessage.guild.id,
            channelId: oldMessage.channel.id,
            authorId: oldMessage.author.id,
            oldContent: oldMessage.content,
            content: newMessage.content,
            attachments: oldMessage.attachments.map(a => a.url),
            type: 'EDIT'
        });
    },
};
