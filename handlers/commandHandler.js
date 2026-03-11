const fs = require('fs');
const path = require('path');
const { Collection, Events, REST, Routes } = require('discord.js');

module.exports = (client) => {
    client.commands = new Collection();
    client.slashCommands = [];

    const commandsPath = path.join(__dirname, '../commands');
    const commandFolders = fs.readdirSync(commandsPath);

    for (const folder of commandFolders) {
        const folderPath = path.join(commandsPath, folder);
        if (!fs.statSync(folderPath).isDirectory()) continue;

        const commandFiles = fs.readdirSync(folderPath).filter(file => file.endsWith('.js'));

        for (const file of commandFiles) {
            const filePath = path.join(folderPath, file);
            const command = require(filePath);

            if ('data' in command && 'execute' in command) {
                
                client.commands.set(command.data.name, command);
                client.slashCommands.push(command.data.toJSON());

                
                if (command.aliases && Array.isArray(command.aliases)) {
                    for (const alias of command.aliases) {
                        client.commands.set(alias, command);
                    }
                }
            } else {
                console.log(`[WARNING] The command at ${filePath} is missing a required "data" or "execute" property.`);
            }
        }
    }

    client.once(Events.ClientReady, async c => {
        console.log(`Ready! Logged in as ${c.user.tag}`);

        const rest = new REST().setToken(process.env.TOKEN);

        try {
            console.log(`Started refreshing ${client.slashCommands.length} application (/) commands.`);

            const data = await rest.put(
                Routes.applicationCommands(c.user.id),
                { body: client.slashCommands },
            );

            console.log(`Successfully reloaded ${data.length} application (/) commands.`);
        } catch (error) {
            console.error(error);
        }
    });
};
