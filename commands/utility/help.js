const {
    SlashCommandBuilder,
    ContainerBuilder,
    TextDisplayBuilder,
    MessageFlags,
    PermissionFlagsBits,
    SeparatorBuilder,
    SeparatorSpacingSize,
    SectionBuilder,
    ThumbnailBuilder,
    ActionRowBuilder,
    StringSelectMenuBuilder,
    StringSelectMenuOptionBuilder,
    ButtonBuilder,
    ButtonStyle,
    ComponentType
} = require('discord.js');

const OVERVIEW_THUMBNAIL = 'https://cdn.discordapp.com/emojis/1351735500800655372.webp?size=32&animated=true';

const CATEGORIES = {
    fun: {
        name: 'Fun & Social',
        emoji: '🎉',
        tagline: 'Entertainment at your fingertips',
        description: 'Engage your community with interactive games, dynamic image generation, memes, and entertaining social commands that bring your server to life.',
        color: 0xff6b8a,
        thumbnail: 'https://cdn.discordapp.com/emojis/1351633994952736831.webp?size=32'
    },
    moderation: {
        name: 'Moderation',
        emoji: '🛡️',
        tagline: 'Keep your server safe & secure',
        description: 'A powerful suite of administrative tools — bans, kicks, timeouts, quarantine systems, channel locks, modlogs, and automated security logging.',
        color: 0xed4245,
        adminOnly: true,
        thumbnail: 'https://cdn.discordapp.com/emojis/1352860974788644945.webp?size=32'
    },
    utility: {
        name: 'Utility Core',
        emoji: '🔧',
        tagline: 'Essential tools for your server',
        description: 'Infrastructure commands offering server configuration, the automated ticketing system, advanced user lookups, and this very help system.',
        color: 0x5865f2,
        thumbnail: 'https://cdn.discordapp.com/attachments/1349371028106772531/1481542749290369186/1306186248662290443.png?ex=69b3b1b5&is=69b26035&hm=37a81a07daddf3d9481143c1e2164d3be0fd3d5e579f9c71705b773f27543350'
    },
    nsfw: {
        name: 'NSFW Hub',
        emoji: '🔞',
        tagline: 'Strictly 18+ content',
        description: 'Exclusive adult media exploration — hentai images, IRL content, and video browsing. Only available in designated NSFW channels.',
        color: 0xe91e63,
        nsfwOnly: true,
        thumbnail: 'https://i0.nekobot.xyz/4/a/2/8686ef170472b4c0da59b0eebaf76.png'
    }
};

const ITEMS_PER_PAGE = 5;

module.exports = {
    category: 'utility',
    data: new SlashCommandBuilder()
        .setName('help')
        .setDescription('Navigate the Celestia Command Center.')
        .addStringOption(opt =>
            opt.setName('module')
                .setDescription('Jump straight to a specific command module')
                .addChoices(
                    { name: '🎉 Fun & Social', value: 'fun' },
                    { name: '🛡️ Moderation', value: 'moderation' },
                    { name: '🔧 Utility Core', value: 'utility' },
                    { name: '🔞 NSFW Hub', value: 'nsfw' }
                )
        ),
    aliases: ['h', 'commands', 'cmd'],
    async execute(interaction, client, args) {
        const isInteraction = interaction.isChatInputCommand?.() || false;
        const member = interaction.member;
        const channel = interaction.channel;
        const user = isInteraction ? interaction.user : interaction.author;

        const activeCategories = [];
        const seenNames = new Set();
        for (const [key, meta] of Object.entries(CATEGORIES)) {
            if (meta.adminOnly && !member.permissions.has(PermissionFlagsBits.ManageMessages)) continue;
            if (meta.nsfwOnly && !channel.nsfw) continue;
            const cmds = [];
            client.commands.filter(c => c.category === key).forEach(cmd => {
                if (cmd.data?.name && !seenNames.has(cmd.data.name)) {
                    seenNames.add(cmd.data.name);
                    cmds.push(cmd);
                }
            });
            activeCategories.push({ key, meta, cmds });
        }

        const totalCommands = activeCategories.reduce((sum, c) => sum + c.cmds.length, 0);

        
        const buildDropdownRow = (selectedKey = 'overview') => {
            const selectMenu = new StringSelectMenuBuilder()
                .setCustomId('help_select')
                .setPlaceholder('📂  Select a module to explore...')
                .setMinValues(1)
                .setMaxValues(1);

            selectMenu.addOptions(
                new StringSelectMenuOptionBuilder()
                    .setLabel('🏠 Command Center')
                    .setDescription('Return to the main overview')
                    .setValue('overview')
                    .setDefault(selectedKey === 'overview')
            );

            for (const { key, meta } of activeCategories) {
                selectMenu.addOptions(
                    new StringSelectMenuOptionBuilder()
                        .setLabel(`${meta.emoji} ${meta.name}`)
                        .setDescription(meta.tagline)
                        .setValue(key)
                        .setDefault(selectedKey === key)
                );
            }

            return new ActionRowBuilder().addComponents(selectMenu);
        };

        
        const buildPaginationRow = (categoryKey, page) => {
            const moduleData = activeCategories.find(c => c.key === categoryKey);
            const maxPages = moduleData ? Math.ceil(moduleData.cmds.length / ITEMS_PER_PAGE) : 1;

            if (maxPages <= 1) return null;

            return new ActionRowBuilder().addComponents(
                new ButtonBuilder()
                    .setCustomId(`help_first_${categoryKey}_0`)
                    .setStyle(ButtonStyle.Secondary)
                    .setEmoji('⏪')
                    .setDisabled(page <= 0),
                new ButtonBuilder()
                    .setCustomId(`help_prev_${categoryKey}_${page - 1}`)
                    .setStyle(ButtonStyle.Secondary)
                    .setEmoji('◀️')
                    .setDisabled(page <= 0),
                new ButtonBuilder()
                    .setCustomId(`help_page_${categoryKey}_${page}`)
                    .setStyle(ButtonStyle.Secondary)
                    .setLabel(`${page + 1}/${maxPages}`)
                    .setDisabled(true),
                new ButtonBuilder()
                    .setCustomId(`help_next_${categoryKey}_${page + 1}`)
                    .setStyle(ButtonStyle.Secondary)
                    .setEmoji('▶️')
                    .setDisabled(page >= maxPages - 1),
                new ButtonBuilder()
                    .setCustomId(`help_last_${categoryKey}_${maxPages - 1}`)
                    .setStyle(ButtonStyle.Secondary)
                    .setEmoji('⏩')
                    .setDisabled(page >= maxPages - 1)
            );
        };

        
        
        
        
        const buildOverviewContainer = () => {
            const container = new ContainerBuilder()
                .setAccentColor(0x5865f2)
                
                .addTextDisplayComponents(
                    new TextDisplayBuilder().setContent(`# ✨ Celestia`)
                )
                
                .addSeparatorComponents(
                    new SeparatorBuilder().setSpacing(SeparatorSpacingSize.Small).setDivider(true)
                )
                
                .addSectionComponents(
                    new SectionBuilder()
                        .addTextDisplayComponents(
                            new TextDisplayBuilder().setContent(
                                `Your all-in-one interactive command directory.\n` +
                                `Browse **${activeCategories.length}** modules with **${totalCommands}** commands.\n\n` +
                                `-# Select a module below or click Browse to jump in.`
                            )
                        )
                        .setThumbnailAccessory(
                            new ThumbnailBuilder().setURL(OVERVIEW_THUMBNAIL)
                        )
                )
                
                .addSeparatorComponents(
                    new SeparatorBuilder().setSpacing(SeparatorSpacingSize.Small).setDivider(true)
                );

            
            for (const { key, meta, cmds } of activeCategories) {
                container.addSectionComponents(
                    new SectionBuilder()
                        .addTextDisplayComponents(
                            new TextDisplayBuilder().setContent(
                                `${meta.emoji} **${meta.name}**  •  \`${cmds.length}\` commands\n` +
                                `-# ${meta.tagline}`
                            )
                        )
                        .setButtonAccessory(
                            new ButtonBuilder()
                                .setCustomId(`help_browse_${key}`)
                                .setLabel('Browse')
                                .setStyle(ButtonStyle.Success)
                        )
                );

                container.addSeparatorComponents(
                    new SeparatorBuilder().setSpacing(SeparatorSpacingSize.Small).setDivider(false)
                );
            }

            
            container.addSeparatorComponents(
                new SeparatorBuilder().setSpacing(SeparatorSpacingSize.Small).setDivider(true)
            );
            container.addTextDisplayComponents(
                new TextDisplayBuilder().setContent(
                    `-# 💡 Use \`/help module:Moderation\` to jump directly  •  ${totalCommands} commands loaded`
                )
            );

            
            container.addActionRowComponents(buildDropdownRow('overview'));

            return container;
        };

        
        
        
        
        const buildModuleContainer = (categoryKey, page = 0) => {
            const moduleData = activeCategories.find(c => c.key === categoryKey);
            if (!moduleData) return buildOverviewContainer();

            const meta = moduleData.meta;
            const allCmds = moduleData.cmds;
            const maxPages = Math.ceil(allCmds.length / ITEMS_PER_PAGE) || 1;

            if (page < 0) page = 0;
            if (page >= maxPages) page = maxPages - 1;

            const startIdx = page * ITEMS_PER_PAGE;
            const endIdx = startIdx + ITEMS_PER_PAGE;
            const pageCmds = allCmds.slice(startIdx, endIdx);

            const container = new ContainerBuilder()
                .setAccentColor(meta.color)
                
                .addTextDisplayComponents(
                    new TextDisplayBuilder().setContent(`# ${meta.emoji} ${meta.name}`)
                )
                
                .addSeparatorComponents(
                    new SeparatorBuilder().setSpacing(SeparatorSpacingSize.Small).setDivider(true)
                )
                
                .addSectionComponents(
                    new SectionBuilder()
                        .addTextDisplayComponents(
                            new TextDisplayBuilder().setContent(
                                `${meta.description}\n\n` +
                                `-# Showing ${pageCmds.length} of ${allCmds.length} commands`
                            )
                        )
                        .setThumbnailAccessory(
                            new ThumbnailBuilder().setURL(meta.thumbnail || OVERVIEW_THUMBNAIL)
                        )
                )
                
                .addSeparatorComponents(
                    new SeparatorBuilder().setSpacing(SeparatorSpacingSize.Small).setDivider(true)
                );

            
            pageCmds.forEach(cmd => {
                const name = cmd.data?.name || 'unknown';
                const desc = cmd.data?.description || 'No description available.';
                const aliases = cmd.aliases?.length
                    ? `\n-# ↳ Aliases: ${cmd.aliases.map(a => `\`${a}\``).join('  ')}`
                    : '';

                container.addTextDisplayComponents(
                    new TextDisplayBuilder().setContent(
                        `**\`/${name}\`**\n> ${desc}${aliases}`
                    )
                );

                container.addSeparatorComponents(
                    new SeparatorBuilder().setSpacing(SeparatorSpacingSize.Small).setDivider(false)
                );
            });

            
            container.addSeparatorComponents(
                new SeparatorBuilder().setSpacing(SeparatorSpacingSize.Small).setDivider(true)
            );

            
            container.addTextDisplayComponents(
                new TextDisplayBuilder().setContent(
                    `-# 📄 Page ${page + 1} of ${maxPages}  •  ${allCmds.length} commands in ${meta.name}`
                )
            );

            
            container.addActionRowComponents(buildDropdownRow(categoryKey));

            
            const paginationRow = buildPaginationRow(categoryKey, page);
            if (paginationRow) {
                container.addActionRowComponents(paginationRow);
            }

            return container;
        };


        
        const requestedModule = isInteraction ? interaction.options.getString('module') : (args?.[0]?.toLowerCase());

        let currentState = 'overview';
        let currentPage = 0;

        if (requestedModule && activeCategories.find(c => c.key === requestedModule)) {
            currentState = requestedModule;
        }

        const initialContainer = currentState === 'overview' ? buildOverviewContainer() : buildModuleContainer(currentState, 0);

        const response = await interaction.reply({
            components: [initialContainer],
            flags: MessageFlags.IsComponentsV2,
            withResponse: true
        });

        
        const message = response.resource?.message;
        if (!message) return;

        const collector = message.createMessageComponentCollector({ time: 300_000 });

        collector.on('collect', async i => {
            if (i.user.id !== user.id) {
                return i.reply({ content: '> ❌ This menu belongs to someone else. Use `/help` to open your own.', flags: MessageFlags.Ephemeral }).catch(() => { });
            }

            if (i.componentType === ComponentType.StringSelect) {
                currentState = i.values[0];
                currentPage = 0;
            } else if (i.componentType === ComponentType.Button) {
                const cid = i.customId;

                
                if (cid.startsWith('help_browse_')) {
                    currentState = cid.replace('help_browse_', '');
                    currentPage = 0;
                } else {
                    
                    const parts = cid.split('_');
                    currentState = parts[2];
                    currentPage = parseInt(parts[3], 10) || 0;
                }
            }

            const newContainer = currentState === 'overview'
                ? buildOverviewContainer()
                : buildModuleContainer(currentState, currentPage);

            await i.update({
                components: [newContainer],
                flags: MessageFlags.IsComponentsV2
            }).catch(() => { });
        });

        collector.on('end', () => {
            try {
                const finalContainer = currentState === 'overview'
                    ? buildOverviewContainer()
                    : buildModuleContainer(currentState, currentPage);

                
                if (finalContainer.data?.components) {
                    finalContainer.data.components = finalContainer.data.components.filter(c => {
                        const t = c.type ?? c.data?.type;
                        return t !== 1; 
                    });
                }

                interaction.editReply({
                    components: [finalContainer],
                    flags: MessageFlags.IsComponentsV2
                }).catch(() => { });
            } catch (e) { }
        });
    },
};
