# MineControl OS v1.0.30 Implementation Plan

This plan addresses all the issues reported by the user, finalizing the missing connectivity and usability bugs.

## Proposed Changes

### 1. Fix Plugin Download 404s
Currently, `Plugins.tsx` uses hardcoded Hangar URLs for popular plugins, but many of these projects (like LuckPerms, EssentialsX) are no longer hosted on Hangar with those specific URL routes.
- **Backend (`plugins.ts`)**: Introduce a meta-URL resolver for `modrinth:` scheme. If a URL is `modrinth:luckperms`, the backend will query `https://api.modrinth.com/v2/project/luckperms/version`, parse the latest release download URL, and download it automatically.
- **Frontend (`Plugins.tsx`)**: Update the `POPULAR_PLUGINS` array to use `modrinth:` schemas where applicable, completely bypassing the broken Hangar API URLs.

### 2. Discord Voice Chat Invite Integration
- **Frontend (`Discord.tsx`)**: Add a new input field for "Voice Chat Invite URL".
- **Backend (`discord.ts` router)**: Add `discordVoiceUrl` to the settings database (or JSON config) so it persists.
- **Backend (`discord.ts` service)**: When the Minecraft server successfully starts, the bot will append `\n🎙️ Join the Voice Chat: <link>` to its "Server Started" message.

### 3. Software Catalog Expansion
The user requested more server software options (like Purpur, Bedrock) to match what they expect from modern panels.
- **Frontend (`Software.tsx`)**: Expand `SOFTWARE_TYPES` to include Purpur, NeoForge, Bedrock, and Pocketmine.
- **Backend (`server.ts`)**: Implement the API fetcher for Purpur (`https://api.purpurmc.org/v2/purpur/`) so versions populate live. Leave more complex options (like Bedrock/Pocketmine) gracefully marked as "Coming Soon" in the UI rather than breaking.

### 4. Local Pathing & Startup Fixes
- The `minecraftServer.ts` will be audited to guarantee that `resolveMinecraftDir()` properly points to the correct local application folder and doesn't get confused by `AppData` roaming profiles on Windows.

## User Review Required
Please review this plan. Once approved, I will begin writing the code and building the `v1.0.30` executable!
