# Celestia Bot: Comprehensive Technical Manual and Architectural Specification

## Introduction and Core Philosophy

Celestia is designed as a modular, event-driven Discord application that prioritizes separation of concerns and clear data ownership. The primary goal of the architecture is to allow individual components (commands, events, models) to function independently while communicating through a centralized state managed by MongoDB. This manual provides a deep-dive into every module, explaining the underlying code logic, the flow of data, and the intentionality behind specific implementation details.

---

## Part 1: Bootstrapping and Global Infrastructure

### The Orchestrator: index.js

The initialization process is strictly sequential to ensure that dependencies are resolved before the bot attempts to interact with the Discord gateway.

1. Environment Injection: The first line invokes the dotenv library, which parses the .env file. This is critical because the subsequent connection to MongoDB and the login to Discord require immediate access to process.env.TOKEN and process.env.MONGODB_URI.
2. Client Configuration: The Discord.js Client is instantiated with a specific set of GatewayIntents. These intents act as a filter for the types of events the bot will receive from Discord. By enabling MessageContent, ServerMembers, and Presence intents, the bot opts into high-data streams necessary for moderation and real-time status tracking.
3. Database Handshake: Mongoose is used to connect to the MongoDB instance. The connection is initiated asynchronously, and the bot logs the status to the console. This connection is globally shared across all models.
4. Handler Execution: The bot delegates the loading of logic to commandHandler.js and eventHandler.js. These are passed the client instance to allow them to attach collections and listeners.

### Command Registration: handlers/commandHandler.js

This module is responsible for the transition from raw JavaScript files to functional Discord interactions.

- Logic Flow: It uses a synchronous file system scan (fs.readdirSync) to find all directories within the commands folder. It then iterates through each file, requiring it and checking for the mandatory data and execute properties.
- Dual Registry: Every command is stored in a client.commands Collection. If a command defines an array of aliases, the handler maps each alias to the same command object in the collection, facilitating legacy prefix-based lookups without duplicating logic.
- REST Integration: Once the client is authenticated (ClientReady), the handler aggregates the data property of every slash command, converts them to JSON, and performs a bulk "PUT" request to the Discord API. This ensures that the command UI in the Discord client is updated globally for all servers.

### Event Dispatching: handlers/eventHandler.js

The event handler abstracts the gateway listeners away from the entry point. It identifies .js files in the events folder and registers them using client.on() or client.once(). By passing the client instance to the execute function of each event, it allows events to trigger other bot actions, such as fetching users or modifying guild settings.

---

## Part 2: Data Persistence Layer (Models)

The persistence layer is managed by three primary Mongoose schemas, each serving a distinct role in the bot's ecosystem.

### Server Configuration: models/Guild.js
This model tracks the "personality" of each server. Key fields include:
- prefix: Defaults to '!', allowing per-server customization for legacy commands.
- quarantineRoleId: Stores the snowflake ID of the role used by the isolation system.
- automod: A nested object containing a toggle and a sensitivity threshold (aiThreshold), used for future AI-driven filtering.

### Action History: models/ModLog.js
A document-based approach to accountability. It records every destructive action (BAN, KICK, TIMEOUT) along with metadata like the moderator's ID and an optional "proof" string (usually a link to a message or image).

### Transient Data: models/Snipe.js
The snipe system handles high-velocity data. Each record stores the content and attachments of a deleted or edited message.
- Technical Detail: It utilizes the MongoDB expires index. By setting this to 7d, MongoDB's background task will automatically purge documents older than a week, ensuring the database remains lean and privacy standards are maintained.

---

## Part 3: Interaction and Event Pipeline

### The Interaction Hub: events/interactionCreate.js
This is the most complex event in the bot's lifecycle. It acts as a switchboard for three types of interactions:
1. Chat Inputs: Standard slash commands. It lookups the command in the client.commands collection and triggers its execute function.
2. String Select Menus: Primarily used in the help system. When a user selects a category, the event parses the value (e.g., 'moderation') and rebuilds the helper UI with the corresponding command list.
3. Buttons: Used for the ticket system and NSFW pagination. It uses a customId naming convention (e.g., hentai_img:category) to pass state from the message back to the execution logic, allowing for "Another One" style functionality without needing separate command calls.

### Message Monitoring: events/messageDelete.js
Every time a message is deleted, the gateway emits an event. This module filters out bot messages (to prevent infinite loops and noise) and creates a new document in the Snipe collection. It maps the attachment URLs into an array, preserving the media link even if the original message is gone from Discord's servers.

---

## Part 4: Command Logic Deep-Dive

### Moderation: commands/moderation/quarantine.js
The quarantine system is a manual override of the standard permission model.
- Internal Logic: When a user is quarantined, the bot assigns a designated role. Crucially, the code includes a check to ensure the quarantine role has no permissions itself. It also interacts with the Guild model to restrict the user to a specific channel.
- Permission Check: It ensures the moderator has ManageMembers and makes a role hierarchy check (role.position >= highestRole.position) to prevent staff from quarantining each other or the bot itself.

### Utility: commands/utility/help.js
The help system demonstrates the power of Discord Components V2. It doesn't just list commands; it provides an interactive browser. It dynamically counts the number of commands in each category from the live client.commands collection, ensuring the documentation is always accurate to the current build.

### Utility: commands/utility/snipe.js
Retrieval logic:
1. Query: It searches the Snipe collection for the most recent document matching the current channel's ID.
2. Resolution: It uses client.users.fetch to turn the authorId snowflake into a readable user object (including avatar and tag).
3. UI Construction: It builds a multi-section container, displaying the original text content in a blockquote and any attachments in a media gallery.

---

## Part 5: Service Layer and External Providers

### The NSFW Wrapper: utils/nsfw-api-wrapper.js
This utility acts as a facade pattern. Instead of commands calling Axios directly, they call the wrapper. This centralization allows for global error logging and easier swapping of providers.

### Provider Mechanics: utils/providers/redgifs.js
RedGifs requires a temporary authentication token. The implementation includes an intelligent caching layer:
- It stores the token and its expiry locally in the class instance.
- Before every search, it checks if Date.now() is less than the expiry time.
- If expired or missing, it performs an asynchronous fetch to /auth/temporary and updates the cache. This minimizes redundant network requests.

### Provider Mechanics: utils/providers/hanime.js
Interestingly, this provider is currently configured to interface with Danbooru's JSON API for video content. It sanitizes user search queries by replacing spaces with underscores (the tag format used by Booru-style APIs) and appends rating:explicit and video tags to ensure the content remains within the expected NSFW scope.

---

## Part 6: Deployment and Operational Security

### Intent Requirements
For the bot to function, the following Privileged Gateway Intents must be enabled in the Discord Developer Portal:
- PRESENCE INTENT: Required for status-related commands and tracking member activity.
- SERVER MEMBERS INTENT: Essential for the quarantine and ban systems to resolve member objects.
- MESSAGE CONTENT INTENT: Critical for the legacy prefix system and the snipe engine to read message text.

### Scaling and Maintenance
The use of Mongoose and a modular folder structure allows Celestia to scale to hundreds of commands without performance degradation. The asynchronous nature of the execute functions ensures that the bot remains responsive to other gateway events while performing database transactions or API requests.
