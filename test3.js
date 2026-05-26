const { SectionBuilder, ThumbnailBuilder, TextDisplayBuilder } = require('discord.js');
const s = new SectionBuilder();
s.addTextDisplayComponents(new TextDisplayBuilder().setContent('Test'));
s.setThumbnailAccessory(new ThumbnailBuilder().setURL('https://example.com/img.png'));
console.log(s.toJSON());
