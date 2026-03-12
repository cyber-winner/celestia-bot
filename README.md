# ✨ Celestia: The Ultimate Hyper-Detailed Technical Manual & Architectural Specification

**Version:** 2.0.0  
**Concept:** Premium Discord Engineering & State-of-the-Art UX Demonstration  
**License:** Open Source (Educational)

---

## 📖 Introduction: The Celestia Philosophy

**Celestia** is an advanced, modular, event-driven Discord application that sets a new industry standard for premium bot design and robust backend engineering. Unlike standard bots, Celestia is built with a deep emphasis on **separation of concerns**, **data ownership**, and **Premium UX (Discord Components V2)**.

This manual serves as a comprehensive deep-dive into every atom of the codebase. It details the underlying logic, the flow of data through the interaction pipeline, and the intentionality behind every architectural decision. Whether you are a user looking to deploy the bot or a developer seeking to learn state-of-the-art Discord.js patterns, this is your definitive guide.

---

## 🏛️ Phase 1: Global Infrastructure & Bootstrapping

The initialization of Celestia is a strictly choreographed sequence designed to ensure stability and race-condition prevention.

### 1.1 The Orchestrator: `index.js`

The entry point of the application manages the entire lifecycle of the bot.

- **Safe Environment Injection**: Early-stage invocation of `dotenv` ensures that all subsequent initializations (DB connections, REST registrations) have immediate access to `TOKEN` and `MONGODB_URI`.
- **High-Fidelity Gateway Intents**: Instantiated with `GatewayIntentBits` including `Guilds`, `GuildMembers`, `GuildMessages`, `MessageContent`, and `GuildPresences`. This opts the bot into high-data streams required for real-time moderation and state tracking.
- **Shared Database Instance**: Mongoose is used to establish a persistent connection to MongoDB. This connection is shared globally across all models, ensuring that data is never fragmented.
- **Modular Delegation**: The bot offloads logic to `handlers/commandHandler.js` and `handlers/eventHandler.js`, which dynamically attach collections and listeners to the client.

### 1.2 Dynamic Registry: `handlers/commandHandler.js`

This module transitions raw JS files into functional Discord Slash Commands.

- **Synchronous Discovery**: Navigates the `commands/` directory to mapping subfolders to categories.
- **Dual-Layer Collection**: Commands are stored in a `client.commands` Collection. If a command defines an alias, the handler creates a pointer to the original command object, ensuring zero-duplication of logic.
- **Global REST Sync**: Once the client is ready, the handler aggregates all command metadata, converts it to JSON, and performs a bulk `PUT` request to the Discord API. This refreshes the command UI in the Discord client for every server the bot is in.

### 1.3 Reactive Pipeline: `handlers/eventHandler.js`

Abstracts the gateway listeners away from the entry point. It registers every file in the `events/` folder using `client.on()` or `client.once()`. This ensures that as the bot grows, the `index.js` remains clean and maintainable.

---

## 💎 Phase 2: Premium UI Standard (Discord Components V2)

Celestia implements a **Unified Design System** that mimics premium mobile and desktop applications. Every interaction is architected within a `ContainerBuilder`.

### 2.1 The Visual Layout Standard

Every command output follows this strict hierarchy for maximum aesthetic impact:

1. **Level 1 Title (`# Header`)**: Uses large-scale markdown to provide immediate context (e.g., `# 🔨 User Banned`).
2. **Interactive Separators**: `SeparatorBuilder` is used with `.setDivider(true)` to create clean, readable segments.
3. **The Information Section**: `SectionBuilder` acts as the primary data carrier. It typically pairs detailed text with a `ThumbnailAccessory` (User avatars or Server icons).
4. **Side-Action Buttons**: Standardized use of `setButtonAccessory` on sections for high-tier interactive patterns like "Another One" (NSFW) or "Open Ticket" (Utility).
5. **Main Content Block**: Where the core data resides—from Audit logs to Anime GIFs.
6. **Media Galleries**: `MediaGalleryBuilder` is utilized for all visual media, ensuring images and GIFs are presented in a high-quality grid or singular focus.
7. **Interactive Footer**: Small-scale text displaying powered-by credits and timestamps.

### 2.2 Instant Transitions

Celestia utilizes `i.update()` for all interactive elements. This eliminates the "thinking" lag seen in other bots, providing an instantaneous, fluid UX that feels alive and responsive.

---

## 🛡️ Phase 3: Moderation & Security Systems

The moderation suite is designed for "Absolute Server Integrity."

### 3.1 The Quarantine Protocol (`quarantine.js`)

This is the most complex moderation command in the bot. It goes beyond simple roles:

- **Manual Override**: Isolates a user by assigning a stripped role.
- **Dynamic Permission Tuning**: Offers a **UI-based toggle system**. Moderators can configure 7 different permissions (View, Send, History, Reactions, etc.) using buttons that switch between `True` and `False` in real-time.
- **Channel Binding**: Binds the quarantine process to a specific server configuration found in `models/Guild.js`.

### 3.2 Snipe & Retention Engine (`snipe.js`)

A sophisticated retrieval system for deleted/edited messages:

- **Real-time Capture**: The `messageDelete` and `messageUpdate` events instantly documents activity in MongoDB.
- **Data Preservation**: Even if a message is deleted, Celestia keeps a temporary cache of the text and attachments.
- **Automatic Purging**: Utilizes the MongoDB **TTL (Time To Live)** index. Every snipe record is automatically deleted after 7 days, balancing utility with user privacy.

### 3.3 Audit Log Integration (`modlog.js`)

Records every destructive action (BAN, KICK, TIMEOUT, LOCK, QUARANTINE). It generates a permanent history that can be retrieved via `/modlog show`, featuring pagination inside a clean UI container.

---

## 🔞 Phase 4: The Definitive NSFW Engineering Masterclass

Celestia features an industry-leading, high-fidelity NSFW engine designed for the ultimate content discovery experience. This is not a simple image fetcher; it is a **centralized media delivery system** that aggregates the finest content from the web's most prominent adult providers.

### 4.1 The "Facade" Architecture (`nsfw-api-wrapper.js`)

At the core of the NSFW system is the **Facade Design Pattern**. Commands never touch external APIs directly. Instead, they communicate with a centralized wrapper that:

- **Normalizes Data**: Converts varying API responses (JSON, XML, Plaintext) into a unified internal format.
- **Load Balancing & Redundancy**: Intelligent fallback logic ensures that if one provider is down, the system maintains service.
- **Security & Sanitization**: Filters and validates all outgoing search queries and incoming media links.

### 4.2 The "Elite" Provider Suite (`utils/providers/`)

Our engine is powered by a diverse array of specialized scrapers and API integrations:

- **🎬 RedGifs (IRL Media)**:
  - **The Auth Challenge**: RedGifs requires a temporary Bearer token for every session.
  - **Intelligent Token Caching**: Celestia implements a proactive caching layer that stores and monitors token expiry. New auth requests are only triggered when necessary, resulting in lightning-fast content delivery.
  - **High-Res Scrapers**: Dedicated logic for fetching the highest available resolution for video previews.
- **🌸 Hanime & Booru-Style (Hentai Video)**:
  - **Semantic Search**: Converts user search terms into optimized Booru-tags (e.g., "school girl" → `school_girl`).
  - **Implicit Filtering**: Automatically appends `rating:explicit` and `video` tags to ensure content strictly follows the command's intent.
- **🖼️ NekoBot & Waifu.pics (Anime Art)**:
  - **Categorical Depth**: Access to over 20+ specialized categories including `Paizuri`, `Tentacle`, `Midriff`, and `Kitsune`.
  - **Dynamic GIF Support**: Intelligent detection of animated vs. static content for optimal rendering.

### 4.3 The "Another One" Premium UX

The NSFW commands (`/hentai`, `/porn`) are the gold standard for Celestia's UI philosophy:

- **Side-Button Refresh**: Unlike other bots that require re-typing, Celestia places a green `Another One` button accessory directly on the info section. This triggers an **Instant State Update**, refreshing the content without cluttering the channel with new messages.
- **Subcommand Organization**: Content is organized into clean, searchable subcommands, making the entire library accessible at a glance.
- **Direct Media Delivery**: For videos, the bot prioritizes direct attachment sending to leverage Discord's native player, with a URL fallback for oversized files.

---

---

## 🎫 Phase 5: Utility & Engagement

### 5.1 Support Tickets (`ticket.js`)

A streamlined system for server support:

- **Single-Button UI**: Persistent "Open Ticket" button inside a premium container.
- **Permission Logic**: Automatically creates private channels with overrides for the user and staff roles.

### 5.2 Interactive Help (`help.js`)

A dynamic browser that scans the `client.commands` Collection in real-time. It provides a string select menu to filter by category, ensuring the user always sees the most up-to-date documentation.

---

## 💾 Phase 6: Data Persistence Layer (Mongoose)

Celestia uses a document-oriented data model:

- **`Guild.js`**: Stores server configuration (prefixes, quarantine roles, log channels).
- **`ModLog.js`**: A secure, read-only history of staff actions.
- **`Snipe.js`**: A high-velocity, auto-expiring collection for message recovery.
- **`QuarantineUser.js`**: Tracks the state of currently isolated members to prevent "leave-to-bypass" exploits.

---

## 🚀 Phase 7: Deployment & Operational Security

### 7.1 Gateway Intents

For full functionality, ensure these are enabled in your Discord Developer Portal:

- **Presence Intent**: For status tracking.
- **Server Members Intent**: For hierarchy/role management.
- **Message Content Intent**: For prefix commands and the Snipe engine.

### 7.2 GitHub Actions Hosting (The "Persistent Host")

The repository includes a world-class CI/CD hosting pipeline:

- **Automatic Resumption**: A 30-minute cron heartbeat checks bot status.
- **Session Guard**: Uses GitHub's `concurrency` groups to prevent overlapping instances.
- **Clean Shutdown**: Sessions are capped at 5.5 hours to avoid GitHub's 6-hour hard hard-kill, allowing for a graceful transition between runners.

---

## 📜 Educational Disclaimer

Celestia is designed to be **Self-Documenting Source Code**. We have removed cluttered comments in favor of clean, descriptive naming conventions and modular folder structures. This project is a living tutorial on how to build high-performance, high-aesthetic Discord applications in the modern era.

*Made with 💖 by the Celestia Engineering Team. Freedom to learn. Freedom to build.*
