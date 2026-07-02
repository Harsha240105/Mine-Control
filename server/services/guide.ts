import { getDatabase } from '../database';
import os from 'os';
import { activeServer } from '../activeServer';
import { getIO } from '../socketManager';

// ============================
// CONTENT DEFINITIONS
// ============================

const SECTIONS: Record<string, { id: string; title: string; icon: string; articles: Article[] }> = {

  getting_started: {
    id: 'getting_started', title: 'Getting Started', icon: 'Rocket',
    articles: [
      {
        id: 'install', title: 'Installing MineControl OS',
        summary: 'How to install MineControl OS on your computer',
        content: [
          { type: 'step', title: 'Download the Installer', text: 'Go to the GitHub releases page and download the latest installer for your platform (Windows .exe, macOS .dmg, or Linux .AppImage).' },
          { type: 'step', title: 'Run the Installer', text: 'Double-click the downloaded file and follow the on-screen instructions. The installer will set up MineControl OS and all its dependencies.' },
          { type: 'step', title: 'Launch the Application', text: 'After installation, launch MineControl OS from your Start Menu (Windows), Applications folder (macOS), or Applications list (Linux).' },
          { type: 'step', title: 'Create Your Account', text: 'On first launch, you will be prompted to create an owner account. Use a strong password and store it safely.' },
          { type: 'info', title: 'Data Directory', text: 'All data is stored in the "MineControl OS" folder in your user directory. Your servers, backups, and settings are all there.' },
        ],
        related: ['first_server', 'start_stop', 'join_local'],
      },
      {
        id: 'first_server', title: 'Creating Your First Server',
        summary: 'Set up a new Minecraft server from scratch',
        content: [
          { type: 'step', title: 'Open Software Page', text: 'Navigate to the Software page from the sidebar. This is where you manage your server software.' },
          { type: 'step', title: 'Choose Server Type', text: 'Select your preferred server software: Paper (recommended for most users), Vanilla, Fabric, or NeoForge for modded gameplay.' },
          { type: 'step', title: 'Select Minecraft Version', text: 'Choose a Minecraft version from the list. The latest stable release is recommended for new servers.' },
          { type: 'step', title: 'Download & Switch', text: 'Click "Download & Switch" to download the selected version. Wait for the download to complete.' },
          { type: 'step', title: 'Configure Settings', text: 'Go to the Options page to configure server name, port, RAM allocation, and other settings.' },
          { type: 'step', title: 'Start Your Server', text: 'Return to the Dashboard and click the Start button. Your server will begin loading.' },
          { type: 'tip', title: 'Quick Tip', text: 'You can change the server software and version at any time without losing your world data.' },
        ],
        related: ['install', 'start_stop', 'settings'],
      },
      {
        id: 'import_server', title: 'Importing an Existing Server',
        summary: 'Import a server you already have on your computer',
        content: [
          { type: 'step', title: 'Go to Import Page', text: 'Navigate to the Import page from the sidebar or the Server Home page.' },
          { type: 'step', title: 'Select Import Type', text: 'Choose "Import Existing Server" from the options. You have two choices: import from a ZIP file or import from an existing folder.' },
          { type: 'step', title: 'Locate Your Server', text: 'Browse to the folder where your existing server files are located. This should contain your server JAR, worlds folder, and configuration files.' },
          { type: 'step', title: 'Analyze Server', text: 'MineControl OS will analyze the server folder and detect the server software, version, and settings automatically.' },
          { type: 'step', title: 'Confirm Import', text: 'Review the detected settings and confirm the import. Your server will be added to the server list.' },
        ],
        related: ['first_server', 'start_stop', 'world_import'],
      },
      {
        id: 'start_stop', title: 'Starting & Stopping the Server',
        summary: 'How to control your Minecraft server',
        content: [
          { type: 'step', title: 'Start the Server', text: 'On the Dashboard, click the green Start button. The server status will change to "Starting..." and then "Online" when ready.' },
          { type: 'step', title: 'Stop the Server', text: 'Click the red Stop button to safely shut down the server. All players will be kicked and the world will be saved.' },
          { type: 'step', title: 'Restart the Server', text: 'Click the yellow Restart button to stop and start the server again. Useful after installing plugins or changing settings.' },
          { type: 'warn', title: 'Important', text: 'Always use the Stop button instead of closing the application. Unsaved data may be lost if you force-quit.' },
        ],
        related: ['first_server', 'console', 'settings'],
      },
      {
        id: 'join_local', title: 'Joining from the Same PC',
        summary: 'Connect to your server from the same computer',
        content: [
          { type: 'step', title: 'Start the Server', text: 'Make sure your server is running (green "Online" indicator on the Dashboard).' },
          { type: 'step', title: 'Open Minecraft', text: 'Launch Minecraft Java Edition on the same computer.' },
          { type: 'step', title: 'Add Server', text: 'Go to Multiplayer > Add Server. Enter any name you like.' },
          { type: 'step', title: 'Enter Address', text: 'Type "localhost" (without quotes) as the server address. The port should match what is shown on your Dashboard (default: 25565).' },
          { type: 'step', title: 'Join', text: 'Click Done, then double-click your server in the list to join.' },
        ],
        related: ['start_stop', 'join_lan', 'join_playit'],
      },
      {
        id: 'join_lan', title: 'Joining from Another Laptop (LAN)',
        summary: 'Connect from another computer on the same network',
        content: [
          { type: 'step', title: 'Start the Server', text: 'Ensure the server is running on the host computer.' },
          { type: 'step', title: 'Check Connection Page', text: 'Open the Connection page in MineControl OS. It will show the LAN IP address (e.g., 192.168.1.100:25565).' },
          { type: 'step', title: 'Configure Firewall', text: 'If the firewall is blocking connections, use the "Open Firewall" button on the Connection page.' },
          { type: 'step', title: 'Connect from Other PC', text: 'On the other computer, open Minecraft > Multiplayer > Add Server, and enter the LAN IP address shown on the Connection page.' },
          { type: 'tip', title: 'Troubleshooting', text: 'Both computers must be on the same Wi-Fi network. If connection fails, check the firewall and try disabling Windows Defender Firewall temporarily.' },
        ],
        related: ['join_local', 'join_playit', 'firewall'],
      },
      {
        id: 'join_playit', title: 'Joining Through Playit.gg',
        summary: 'Let friends join from anywhere in the world',
        content: [
          { type: 'step', title: 'Open Connection Page', text: 'Go to the Connection page in MineControl OS.' },
          { type: 'step', title: 'Enable Playit Tunnel', text: 'Click "Start Playit Tunnel". MineControl OS will start the Playit.gg tunnel service.' },
          { type: 'step', title: 'Wait for Connection', text: 'Wait a few seconds for the tunnel to establish. You will see a playit.gg address appear (e.g., my-server.playit.gg:12345).' },
          { type: 'step', title: 'Share the Address', text: 'Share the playit.gg address with your friends. They can join from anywhere without needing port forwarding.' },
          { type: 'warn', title: 'Free Tier Limits', text: 'Playit.gg has a free tier with bandwidth limits. For heavy usage, consider upgrading their paid plan.' },
        ],
        related: ['join_local', 'join_lan', 'connection'],
      },
      {
        id: 'discord_setup', title: 'Connecting Discord',
        summary: 'Set up Discord bot integration',
        content: [
          { type: 'step', title: 'Open Discord Page', text: 'Navigate to the Discord page from the sidebar.' },
          { type: 'step', title: 'Create a Bot', text: 'Go to the Discord Developer Portal, create a new application, then create a bot. Copy the bot token.' },
          { type: 'step', title: 'Invite Bot to Server', text: 'Use the Discord Developer Portal to generate an invite link with the necessary permissions. Invite the bot to your Discord server.' },
          { type: 'step', title: 'Configure in App', text: 'Paste the bot token, guild ID, and channel IDs into the Discord configuration page in MineControl OS.' },
          { type: 'step', title: 'Connect', text: 'Click "Connect" to start the bot. Once connected, the status will show as "Connected" on the Dashboard.' },
        ],
        related: ['discord', 'settings'],
      },
      {
        id: 'backup_restore', title: 'Restoring Backups',
        summary: 'How to restore your server from a backup',
        content: [
          { type: 'step', title: 'Open Backups Page', text: 'Go to the Backups page from the sidebar.' },
          { type: 'step', title: 'Select Backup', text: 'Browse the list of available backups. You can search by name or date.' },
          { type: 'step', title: 'Click Restore', text: 'Click the Restore button next to the backup you want to restore. A safety backup will be created automatically.' },
          { type: 'step', title: 'Confirm Restoration', text: 'Confirm the restoration. The server will stop, files will be restored, and the server will restart.' },
          { type: 'warn', title: 'Stop Server First', text: 'The server must be stopped before restoring. MineControl OS will handle this automatically.' },
        ],
        related: ['backups', 'first_server'],
      },
      {
        id: 'install_plugins', title: 'Installing Plugins',
        summary: 'Add plugins to your Paper/Spigot server',
        content: [
          { type: 'step', title: 'Open Plugins Page', text: 'Go to the Plugins page from the sidebar.' },
          { type: 'step', title: 'Browse or Search', text: 'Browse the available plugins or use the search bar to find specific ones. Results come from BukkitDev, Hangar, and CurseForge.' },
          { type: 'step', title: 'Install Plugin', text: 'Click the Install button on a plugin. It will be downloaded and placed in your server\'s plugins folder.' },
          { type: 'step', title: 'Restart Server', text: 'Restart the server to load the new plugin. Some plugins may require configuration before they work properly.' },
          { type: 'tip', title: 'Plugin Conflicts', text: 'Some plugins conflict with each other. Install one at a time and test before adding more.' },
        ],
        related: ['plugins', 'start_stop', 'troubleshooting'],
      },
      {
        id: 'install_mods', title: 'Installing Mods',
        summary: 'Add mods to your Fabric/NeoForge server',
        content: [
          { type: 'step', title: 'Set Up Modded Server', text: 'First, ensure your server is running Fabric or NeoForge software from the Software page.' },
          { type: 'step', title: 'Open Mods Page', text: 'Go to the Mods page from the sidebar.' },
          { type: 'step', title: 'Browse Mods', text: 'Search for mods from Modrinth and CurseForge. Filter by Minecraft version and mod loader.' },
          { type: 'step', title: 'Install Mod', text: 'Click Install next to a mod. It will be downloaded and added to your mods folder.' },
          { type: 'step', title: 'Restart Server', text: 'Restart the server. Both the server and all clients must have the same mods installed.' },
        ],
        related: ['mods', 'software', 'start_stop'],
      },
      {
        id: 'world_import', title: 'Importing Worlds',
        summary: 'Import a world into your server',
        content: [
          { type: 'step', title: 'Open Worlds Page', text: 'Go to the Worlds page from the sidebar.' },
          { type: 'step', title: 'Click Import', text: 'Click the Import button. You can upload a ZIP file or point to an existing world folder.' },
          { type: 'step', title: 'Select World', text: 'Choose your world file or folder. MineControl OS will validate the world and check for issues.' },
          { type: 'step', title: 'Configure World', text: 'Set the world name, gamemode, difficulty, and other settings.' },
          { type: 'step', title: 'Confirm Import', text: 'Click Import to add the world to your server. The server will load the new world on next start.' },
        ],
        related: ['worlds', 'world_export', 'first_server'],
      },
      {
        id: 'world_export', title: 'Exporting Worlds',
        summary: 'Download or export your worlds',
        content: [
          { type: 'step', title: 'Open Worlds Page', text: 'Go to the Worlds page and find the world you want to export.' },
          { type: 'step', title: 'Click Export', text: 'Click the download button next to the world. The world will be packaged into a ZIP file.' },
          { type: 'step', title: 'Save File', text: 'Choose where to save the ZIP file. The world can now be shared or imported into another server.' },
          { type: 'tip', title: 'Backup First', text: 'Exporting is safe, but it is good practice to create a backup before exporting large worlds.' },
        ],
        related: ['worlds', 'world_import', 'backups'],
      },
    ],
  },

  tutorials: {
    id: 'tutorials', title: 'Tutorials', icon: 'BookOpen',
    articles: [
      {
        id: 'tut_dashboard', title: 'Dashboard Tutorial',
        summary: 'Learn how to use the server Dashboard',
        content: [
          { type: 'purpose', title: 'Purpose', text: 'The Dashboard is the main control center for your Minecraft server. It shows real-time status, performance metrics, and quick controls.' },
          { type: 'step', title: 'Understanding the Cards', text: 'The Dashboard displays several cards: Server Status, Online Players, CPU Usage, MC RAM, System RAM, TPS, Backups, Disk Storage, Discord, and Feedback.' },
          { type: 'step', title: 'Server Controls', text: 'Use the Start, Stop, and Restart buttons in the sidebar to control your server. The status indicator shows the current state.' },
          { type: 'step', title: 'Performance Monitoring', text: 'Watch the CPU, RAM, and TPS gauges to monitor server performance. Green is good, yellow is warning, red indicates issues.' },
          { type: 'step', title: 'Online Players', text: 'The Connected Players panel shows who is online, their ping, and allows you to click on players for detailed information.' },
          { type: 'expected', title: 'Expected Result', text: 'You should see live-updating information about your server with no placeholder values.' },
          { type: 'common_mistakes', title: 'Common Mistakes', text: 'Ignoring high RAM usage or low TPS. Check these regularly to ensure smooth gameplay.' },
        ],
        related: ['dashboard', 'console', 'players'],
      },
      {
        id: 'tut_server', title: 'Server Management Tutorial',
        summary: 'Managing your server software and versions',
        content: [
          { type: 'purpose', title: 'Purpose', text: 'The Software page lets you choose, download, and switch between different server software and Minecraft versions.' },
          { type: 'step', title: 'Choosing Software', text: 'Select from Paper (best performance), Vanilla (official), Fabric (lightweight modding), or NeoForge (heavy modding).' },
          { type: 'step', title: 'Selecting Version', text: 'Click on a version to expand details. Use the search bar to find specific versions. The current version is highlighted in green.' },
          { type: 'step', title: 'Downloading', text: 'Click "Download & Switch" to download the selected version. Progress is shown during download.' },
          { type: 'step', title: 'After Switching', text: 'The server will use the new version on next start. Some settings may need to be reconfigured for different versions.' },
          { type: 'expected', title: 'Expected Result', text: 'The version list populates from Mojang/PaperMC APIs. Downloads complete without errors.' },
          { type: 'common_mistakes', title: 'Common Mistakes', text: 'Switching versions without checking plugin compatibility. Always verify your plugins support the target version.' },
        ],
        related: ['software', 'plugins', 'mods'],
      },
      {
        id: 'tut_plugins', title: 'Plugins Tutorial',
        summary: 'Managing plugins on your server',
        content: [
          { type: 'purpose', title: 'Purpose', text: 'The Plugins page allows you to discover, install, and manage server plugins from multiple sources.' },
          { type: 'step', title: 'Browsing Plugins', text: 'Browse featured plugins or search by name. Results come from BukkitDev, Hangar, and CurseForge.' },
          { type: 'step', title: 'Installing', text: 'Click Install on any plugin. It will be downloaded to your server\'s plugins folder.' },
          { type: 'step', title: 'Managing Installed', text: 'Toggle plugins on/off with the switch. Use the delete button to remove plugins permanently.' },
          { type: 'expected', title: 'Expected Result', text: 'Plugins appear in the installed list. Toggling updates the server\'s plugins folder immediately.' },
          { type: 'common_mistakes', title: 'Common Mistakes', text: 'Installing incompatible plugin versions. Always match the plugin version to your server version.' },
        ],
        related: ['plugins', 'tut_mods', 'software'],
      },
      {
        id: 'tut_mods', title: 'Mods Tutorial',
        summary: 'Managing mods on Fabric/NeoForge servers',
        content: [
          { type: 'purpose', title: 'Purpose', text: 'The Mods page lets you install and manage Minecraft mods from Modrinth and CurseForge.' },
          { type: 'step', title: 'Checking Software', text: 'Ensure your server is running Fabric or NeoForge. Mods will not work on Paper or Vanilla servers.' },
          { type: 'step', title: 'Searching Mods', text: 'Use the search bar to find mods. Filter by Minecraft version and mod loader.' },
          { type: 'step', title: 'Installing', text: 'Click Install to download and add a mod to your server\'s mods folder.' },
          { type: 'expected', title: 'Expected Result', text: 'Mods are added to the mods folder and listed in the installed mods table.' },
          { type: 'common_mistakes', title: 'Common Mistakes', text: 'Mixing mod loaders (Fabric vs NeoForge mods are not compatible). Ensure client and server have identical mod sets.' },
        ],
        related: ['mods', 'tut_plugins', 'software'],
      },
      {
        id: 'tut_players', title: 'Players Tutorial',
        summary: 'Managing players, roles, and permissions',
        content: [
          { type: 'purpose', title: 'Purpose', text: 'The Players page lets you view and manage all players who have joined your server.' },
          { type: 'step', title: 'Viewing Players', text: 'The player list shows username, UUID, role, status, playtime, and approval status.' },
          { type: 'step', title: 'Managing Roles', text: 'Assign roles to players (Owner, Admin, Moderator, etc.) to control permissions.' },
          { type: 'step', title: 'Banning Players', text: 'Use the ban button to permanently ban a player. Provide a reason for the audit log.' },
          { type: 'step', title: 'Whitelist', text: 'Enable whitelist mode in Settings to restrict access to approved players only.' },
          { type: 'expected', title: 'Expected Result', text: 'Player actions (ban, kick, mute) take effect immediately with audit trail.' },
        ],
        related: ['players', 'settings', 'console'],
      },
      {
        id: 'tut_worlds', title: 'Worlds Tutorial',
        summary: 'Managing server worlds',
        content: [
          { type: 'purpose', title: 'Purpose', text: 'The Worlds page lets you view, create, import, export, and manage your Minecraft worlds.' },
          { type: 'step', title: 'Viewing Worlds', text: 'See all worlds with details like size, seed, gamemode, difficulty, and chunk count.' },
          { type: 'step', title: 'Creating Worlds', text: 'Use the "New World" button to create a world with custom seed, gamemode, and world type.' },
          { type: 'step', title: 'Managing Dimensions', text: 'View and manage the Overworld, Nether, and End dimensions for each world.' },
          { type: 'expected', title: 'Expected Result', text: 'World operations (create, clone, optimize) complete successfully.' },
        ],
        related: ['worlds', 'world_import', 'world_export'],
      },
      {
        id: 'tut_backups', title: 'Backups Tutorial',
        summary: 'Creating and managing backups',
        content: [
          { type: 'purpose', title: 'Purpose', text: 'The Backups page allows you to create, restore, export, and manage backups of your server.' },
          { type: 'step', title: 'Creating a Backup', text: 'Click "Create Backup" to manually back up your server. You can name the backup and add notes.' },
          { type: 'step', title: 'Scheduled Backups', text: 'Configure automatic backups in the Backup Schedule section. Choose frequency, retention, and content.' },
          { type: 'step', title: 'Restoring', text: 'Click Restore on any backup. A safety backup is created automatically before restoration.' },
          { type: 'expected', title: 'Expected Result', text: 'Backups are created with integrity verification. Restores complete without data loss.' },
        ],
        related: ['backups', 'backup_restore', 'settings'],
      },
      {
        id: 'tut_connection', title: 'Connection Tutorial',
        summary: 'Setting up server connectivity',
        content: [
          { type: 'purpose', title: 'Purpose', text: 'The Connection page and wizard help you set up how players connect to your server.' },
          { type: 'step', title: 'Connection Wizard', text: 'Run the Connection Wizard to automatically detect the best connection method for your setup.' },
          { type: 'step', title: 'Local Connection', text: 'For playing on the same computer, use localhost. No configuration needed.' },
          { type: 'step', title: 'LAN Connection', text: 'For same-network play, use the detected LAN IP. Open the firewall if needed.' },
          { type: 'step', title: 'Playit Tunnel', text: 'For internet play, start the Playit.gg tunnel to get a public address.' },
          { type: 'expected', title: 'Expected Result', text: 'The wizard detects the correct method. Connection diagnostics show green indicators.' },
        ],
        related: ['connection', 'join_local', 'join_lan', 'join_playit'],
      },
      {
        id: 'tut_discord', title: 'Discord Integration Tutorial',
        summary: 'Setting up and using Discord bot',
        content: [
          { type: 'purpose', title: 'Purpose', text: 'The Discord integration lets you receive server notifications and control the server from Discord.' },
          { type: 'step', title: 'Configuration', text: 'Enter your bot token, guild ID, and channel IDs to connect.' },
          { type: 'step', title: 'Notifications', text: 'Choose which events trigger Discord notifications (server start, stop, crash, player join, etc.).' },
          { type: 'step', title: 'Testing', text: 'Use the "Test Message" button to verify the bot is working correctly.' },
          { type: 'expected', title: 'Expected Result', text: 'Bot connects successfully and sends notifications for configured events.' },
        ],
        related: ['discord', 'discord_setup', 'settings'],
      },
      {
        id: 'tut_feedback', title: 'Feedback & Issues Tutorial',
        summary: 'Reporting problems and requesting features',
        content: [
          { type: 'purpose', title: 'Purpose', text: 'The Feedback system lets you report bugs, request features, and track issues — all without a GitHub account.' },
          { type: 'step', title: 'Creating a Report', text: 'Choose the issue type, fill in the guided template, add screenshots, and submit.' },
          { type: 'step', title: 'Reviewing Data', text: 'Click "Review data before submitting" to see what diagnostic information will be included.' },
          { type: 'step', title: 'Tracking Status', text: 'View your tickets in the list. Status changes (Open, In Review, Resolved, Closed) are tracked with history.' },
          { type: 'expected', title: 'Expected Result', text: 'Tickets are created with unique IDs. Offline reports are queued and auto-synced.' },
        ],
        related: ['feedback', 'diagnostics', 'settings'],
      },
      {
        id: 'tut_settings', title: 'Settings Tutorial',
        summary: 'Configuring MineControl OS',
        content: [
          { type: 'purpose', title: 'Purpose', text: 'The Settings page lets you configure server properties, change passwords, manage versions, and set up integrations.' },
          { type: 'step', title: 'Server Properties', text: 'Edit server name, port, RAM allocation, MOTD, difficulty, gamemode, and more.' },
          { type: 'step', title: 'Version Management', text: 'Change Minecraft version and server software from the Version Manager section.' },
          { type: 'step', title: 'Security', text: 'Change your password regularly. Keep your owner credentials safe.' },
          { type: 'step', title: 'Issue Tracker', text: 'Configure GitHub/GitLab/Jira integration for automatic issue syncing.' },
          { type: 'expected', title: 'Expected Result', text: 'Settings save and take effect on next server restart.' },
        ],
        related: ['settings', 'software', 'security'],
      },
      {
        id: 'tut_privacy', title: 'Privacy Tutorial',
        summary: 'Understanding data privacy in MineControl OS',
        content: [
          { type: 'purpose', title: 'Purpose', text: 'The Privacy page shows you what data MineControl OS stores and lets you manage it.' },
          { type: 'step', title: 'Viewing Data', text: 'See a summary of stored data including logs, backups, player data, and feedback tickets.' },
          { type: 'step', title: 'Clearing Logs', text: 'Delete application logs to free up space and remove activity records.' },
          { type: 'step', title: 'Exporting Data', text: 'Export all your data for backup or migration purposes.' },
          { type: 'expected', title: 'Expected Result', text: 'Data operations complete as expected. Cleared data cannot be recovered.' },
        ],
        related: ['privacy', 'settings', 'feedback'],
      },
    ],
  },

  faq: {
    id: 'faq', title: 'FAQ', icon: 'HelpCircle',
    articles: [
      {
        id: 'faq_friends_join', title: 'Why can\'t friends join my server?',
        summary: 'Troubleshooting connection issues for friends',
        content: [
          { type: 'answer', title: 'Common Causes', text: 'Several things could prevent friends from joining: (1) Firewall blocking the port, (2) Server not running, (3) Wrong IP address, (4) Online mode issues, (5) ISP blocking port forwarding.' },
          { type: 'step', title: 'Check Server Status', text: 'Make sure the server is running (green indicator on Dashboard).' },
          { type: 'step', title: 'Check Firewall', text: 'Go to Connection page and verify the firewall rule is active. Use "Open Firewall" to add a rule.' },
          { type: 'step', title: 'Try Playit.gg', text: 'The easiest way to let friends join is using Playit.gg tunnel. Go to Connection page and start the tunnel.' },
          { type: 'link', title: 'Related Guides', text: 'See "Joining Through Playit.gg" and "Joining from Another Laptop" for detailed instructions.' },
        ],
        related: ['join_playit', 'join_lan', 'firewall', 'connection'],
      },
      {
        id: 'faq_change_version', title: 'How do I change the Minecraft version?',
        summary: 'Steps to switch your server to a different Minecraft version',
        content: [
          { type: 'answer', title: 'Process', text: 'Go to the Software page, find the version you want, and click "Download & Switch". The server will download the new version and switch to it.' },
          { type: 'warn', title: 'Important', text: 'Changing versions may break plugins and mods that are not compatible with the new version. Always check compatibility first.' },
        ],
        related: ['software', 'tut_server', 'plugins'],
      },
      {
        id: 'faq_import_world', title: 'How do I import a world?',
        summary: 'Importing an existing world into your server',
        content: [
          { type: 'answer', title: 'Process', text: 'Go to Worlds page, click Import, and upload a ZIP file or select an existing world folder. MineControl OS will validate and import it.' },
          { type: 'tip', title: 'Format', text: 'The world folder should contain region files (.mca), level.dat, and other standard Minecraft world files.' },
        ],
        related: ['world_import', 'worlds', 'world_export'],
      },
      {
        id: 'faq_backup_location', title: 'Where are backups stored?',
        summary: 'Finding your backup files on disk',
        content: [
          { type: 'answer', title: 'Location', text: 'Backups are stored in the "MineControl OS/data/backups/" directory in your user folder. Each backup is a ZIP file with a timestamped name.' },
          { type: 'info', title: 'Access', text: 'You can also download or export backups from the Backups page in the application.' },
        ],
        related: ['backups', 'backup_restore', 'tut_backups'],
      },
      {
        id: 'faq_restore_backup', title: 'How do I restore a backup?',
        summary: 'Restoring your server from a previous backup',
        content: [
          { type: 'answer', title: 'Process', text: 'Go to Backups page, find the backup you want, click Restore. A safety backup is created, then the server stops, files are restored, and the server restarts.' },
          { type: 'warn', title: 'Caution', text: 'Restoring will overwrite current server files. Make sure you have a recent safety backup before proceeding.' },
        ],
        related: ['backup_restore', 'backups', 'tut_backups'],
      },
      {
        id: 'faq_firewall', title: 'Why is the firewall blocking connections?',
        summary: 'Understanding and fixing firewall issues',
        content: [
          { type: 'answer', title: 'Explanation', text: 'Windows Firewall blocks incoming connections by default. MineControl OS needs a firewall rule to allow Minecraft traffic on port 25565.' },
          { type: 'step', title: 'Fix', text: 'Go to the Connection page and click "Open Firewall". This adds a rule for Minecraft traffic. You need administrator privileges.' },
        ],
        related: ['firewall', 'connection', 'join_lan'],
      },
      {
        id: 'faq_playit', title: 'How do I use Playit.gg?',
        summary: 'Setting up the Playit.gg tunnel service',
        content: [
          { type: 'answer', title: 'Process', text: 'Go to Connection page, click "Start Playit Tunnel". After a few seconds, a public playit.gg address will appear that you can share with friends.' },
          { type: 'tip', title: 'No Port Forwarding', text: 'Playit.gg works without port forwarding. It creates a secure tunnel from the internet to your server.' },
        ],
        related: ['join_playit', 'connection', 'faq_friends_join'],
      },
      {
        id: 'faq_update_server', title: 'How do I update my server?',
        summary: 'Updating to a newer Minecraft version',
        content: [
          { type: 'answer', title: 'Process', text: 'Go to the Software page, find the new version, and click "Download & Switch". For minor updates (e.g., 1.20.4 to 1.20.5), plugins usually work. For major updates, check plugin compatibility.' },
        ],
        related: ['software', 'faq_change_version', 'plugins'],
      },
      {
        id: 'faq_move_server', title: 'How do I move the server to another computer?',
        summary: 'Migrating your server to a different machine',
        content: [
          { type: 'answer', title: 'Process', text: 'Create a full backup on the current computer, install MineControl OS on the new computer, use the Import feature to restore the backup.' },
          { type: 'step', title: 'Step 1', text: 'Create a full backup from the Backups page.' },
          { type: 'step', title: 'Step 2', text: 'Install MineControl OS on the new computer.' },
          { type: 'step', title: 'Step 3', text: 'Copy the backup file to the new computer and use Import to restore it.' },
        ],
        related: ['backups', 'import_server', 'first_server'],
      },
      {
        id: 'faq_reinstall', title: 'How do I reinstall without losing data?',
        summary: 'Safe reinstallation procedure',
        content: [
          { type: 'answer', title: 'Process', text: 'Your data is stored separately from the application. Uninstall MineControl OS, reinstall it, and your data will still be in the "MineControl OS" folder.' },
          { type: 'warn', title: 'Backup First', text: 'Always create a full backup before reinstalling, just in case something goes wrong.' },
        ],
        related: ['backups', 'backup_restore', 'import_server'],
      },
      {
        id: 'faq_java', title: 'Why do I get Java errors?',
        summary: 'Troubleshooting Java installation issues',
        content: [
          { type: 'answer', title: 'Explanation', text: 'Minecraft servers require Java 17 or later. MineControl OS includes Java detection, but you may need to install Java separately.' },
          { type: 'step', title: 'Fix', text: 'Download and install Java 17 or later from adoptium.net. In Settings, set the Java path to your installation.' },
        ],
        related: ['settings', 'diagnostics', 'troubleshooting'],
      },
      {
        id: 'faq_plugins_not_loading', title: 'Why aren\'t my plugins loading?',
        summary: 'Troubleshooting plugin loading issues',
        content: [
          { type: 'answer', title: 'Common Causes', text: 'Plugins may not load if: (1) They are incompatible with your server version, (2) They depend on other plugins, (3) The server is running Vanilla instead of Paper/Spigot.' },
          { type: 'step', title: 'Check', text: 'Verify your server software supports plugins (Paper, Spigot, Purpur). Check the console for plugin loading errors.' },
        ],
        related: ['plugins', 'software', 'console'],
      },
      {
        id: 'faq_performance', title: 'How can I improve server performance?',
        summary: 'Tips for better server performance',
        content: [
          { type: 'answer', title: 'Tips', text: '(1) Use Paper instead of Vanilla, (2) Allocate enough RAM (4-8GB recommended), (3) Use performance plugins like Spark, (4) Reduce view-distance, (5) Use world optimization tools.' },
          { type: 'link', title: 'Related', text: 'Check the Performance troubleshooting guide for detailed optimization steps.' },
        ],
        related: ['settings', 'diagnostics', 'troubleshooting'],
      },
    ],
  },

  documentation: {
    id: 'documentation', title: 'Documentation', icon: 'FileText',
    articles: [
      {
        id: 'doc_architecture', title: 'Architecture Overview',
        summary: 'How MineControl OS is built',
        content: [
          { type: 'desc', title: 'Description', text: 'MineControl OS is a desktop application built with Electron, React, TypeScript, and Express. It uses SQLite for local storage and Socket.IO for real-time communication.' },
          { type: 'workflow', title: 'Application Flow', text: 'The app starts an Express server on port 3001. The React frontend connects via Socket.IO for real-time updates. All data is stored locally in SQLite. The Minecraft server runs as a child process managed by the backend.' },
          { type: 'architecture', title: 'Component Architecture', text: 'Frontend: React with TypeScript, Vite build, Tailwind CSS. Backend: Express.js, better-sqlite3, Socket.IO. Desktop: Electron for native OS integration. The Minecraft server process is managed independently.' },
          { type: 'config', title: 'Configuration', text: 'Server settings are stored in the SQLite database and server.properties file. Application preferences use localStorage and the ui_state table.' },
          { type: 'reqs', title: 'Requirements', text: 'Node.js 18+, Java 17+, 4GB+ RAM, Windows/macOS/Linux with Electron support.' },
          { type: 'module', title: 'Related Modules', text: 'Dashboard, Server, Software, Settings, Connection — all integrate with the core architecture.' },
        ],
        related: ['dashboard', 'settings', 'connection'],
      },
      {
        id: 'doc_dashboard', title: 'Dashboard Module',
        summary: 'The server control center',
        content: [
          { type: 'desc', title: 'Description', text: 'The Dashboard is the main interface for monitoring and controlling your Minecraft server. It displays real-time status, performance metrics, player information, and quick-action controls.' },
          { type: 'workflow', title: 'Workflow', text: 'The Dashboard polls the backend API every 5 seconds for status updates and listens to Socket.IO events for real-time changes. Stats history is maintained in memory for chart display.' },
          { type: 'config', title: 'Configuration', text: 'The Dashboard reflects the currently active server. Switch servers from the sidebar dropdown.' },
          { type: 'module', title: 'Related Modules', text: 'Console, Players, Backups, Connection, Discord, Feedback' },
        ],
        related: ['dashboard', 'console', 'players'],
      },
      {
        id: 'doc_servers', title: 'Server Management Module',
        summary: 'Multi-server support',
        content: [
          { type: 'desc', title: 'Description', text: 'MineControl OS supports multiple Minecraft server instances. Each server has its own directory, port, version, and configuration.' },
          { type: 'workflow', title: 'Workflow', text: 'The Servers page lists all configured servers. One server is "active" at a time. Switch between servers using the sidebar dropdown or the Servers page.' },
          { type: 'config', title: 'Configuration', text: 'Each server stores its config in the servers table. The active server ID is stored in server_config.' },
          { type: 'module', title: 'Related Modules', text: 'Dashboard, Settings, Software, Backups' },
        ],
        related: ['servers', 'first_server', 'import_server'],
      },
      {
        id: 'doc_players', title: 'Player Management Module',
        summary: 'Managing server players',
        content: [
          { type: 'desc', title: 'Description', text: 'The Players system provides comprehensive player management including whitelist, bans, roles, permissions, and player tracking.' },
          { type: 'workflow', title: 'Workflow', text: 'Players are auto-detected from the Minecraft server directory. Player data is synced with the database. Roles control permissions via the permission system.' },
          { type: 'config', title: 'Configuration', text: 'Player roles are configurable in the Players page. Whitelist and ban lists sync with Minecraft server files.' },
          { type: 'module', title: 'Related Modules', text: 'Dashboard, Console, Settings' },
        ],
        related: ['players', 'tut_players', 'settings'],
      },
      {
        id: 'doc_worlds', title: 'World Management Module',
        summary: 'Managing Minecraft worlds',
        content: [
          { type: 'desc', title: 'Description', text: 'The Worlds system lets you create, import, export, and manage Minecraft worlds and their dimensions.' },
          { type: 'workflow', title: 'Workflow', text: 'Worlds are detected from the server directory. Each world can have multiple dimensions (Overworld, Nether, End). Operations include create, clone, optimize, repair, import, and export.' },
          { type: 'config', title: 'Configuration', text: 'World settings include gamemode, difficulty, seed, world type, and simulation distance.' },
          { type: 'module', title: 'Related Modules', text: 'Dashboard, Backups, Settings' },
        ],
        related: ['worlds', 'tut_worlds', 'world_import', 'world_export'],
      },
      {
        id: 'doc_backups', title: 'Backup & Recovery Module',
        summary: 'Protecting your server data',
        content: [
          { type: 'desc', title: 'Description', text: 'The Backup system provides manual and scheduled backups with encryption, integrity verification, and restoration capabilities.' },
          { type: 'workflow', title: 'Workflow', text: 'Backups are created as ZIP files with configurable content selection (worlds, players, plugins, config). Each backup is verified for integrity. Restoration creates a safety backup first.' },
          { type: 'config', title: 'Configuration', text: 'Schedule backups by frequency (hourly, daily, weekly) with retention policies. Encryption uses AES-256.' },
          { type: 'module', title: 'Related Modules', text: 'Dashboard, Worlds, Settings' },
        ],
        related: ['backups', 'tut_backups', 'backup_restore'],
      },
      {
        id: 'doc_connection', title: 'Connection Module',
        summary: 'Server connectivity options',
        content: [
          { type: 'desc', title: 'Description', text: 'The Connection module provides multiple methods for players to connect: localhost, LAN, and Playit.gg tunnel for internet access.' },
          { type: 'workflow', title: 'Workflow', text: 'The Connection Wizard auto-detects the best connection method. Diagnostics check firewall, port availability, and network configuration.' },
          { type: 'config', title: 'Configuration', text: 'Firewall rules, Playit.gg tunnel, and connection preferences are configurable.' },
          { type: 'module', title: 'Related Modules', text: 'Dashboard, Settings, Diagnostics' },
        ],
        related: ['connection', 'join_local', 'join_lan', 'join_playit'],
      },
      {
        id: 'doc_discord', title: 'Discord Integration Module',
        summary: 'Discord bot integration',
        content: [
          { type: 'desc', title: 'Description', text: 'The Discord integration connects a Discord bot to your server for notifications and remote control.' },
          { type: 'workflow', title: 'Workflow', text: 'The bot connects using a bot token and joins your Discord server. It sends notifications for configurable events and can execute commands.' },
          { type: 'config', title: 'Configuration', text: 'Bot token, guild ID, channel IDs, and notification toggles are stored in discord_config.' },
          { type: 'module', title: 'Related Modules', text: 'Dashboard, Settings, Notifications' },
        ],
        related: ['discord', 'discord_setup', 'tut_discord'],
      },
      {
        id: 'doc_feedback', title: 'Feedback & Issues Module',
        summary: 'Issue tracking system',
        content: [
          { type: 'desc', title: 'Description', text: 'The Feedback system provides local-first issue reporting with automatic diagnostics, screenshot support, and offline queue.' },
          { type: 'workflow', title: 'Workflow', text: 'Users create tickets with guided templates. Diagnostic data is automatically collected. Tickets are stored locally and queued for sync. The system supports full lifecycle management.' },
          { type: 'config', title: 'Configuration', text: 'Issue tracker integration (GitHub/GitLab/Jira) is configurable in Settings.' },
          { type: 'module', title: 'Related Modules', text: 'Dashboard, Diagnostics, Settings, Privacy' },
        ],
        related: ['feedback', 'tut_feedback', 'diagnostics'],
      },
      {
        id: 'doc_privacy', title: 'Privacy Module',
        summary: 'Data privacy management',
        content: [
          { type: 'desc', title: 'Description', text: 'The Privacy module gives users control over their data with view, export, and delete capabilities.' },
          { type: 'workflow', title: 'Workflow', text: 'Data is stored locally in SQLite and files. Users can view a summary of all stored data, export it, or delete specific categories.' },
          { type: 'module', title: 'Related Modules', text: 'Settings, Feedback, Backups' },
        ],
        related: ['privacy', 'tut_privacy', 'settings'],
      },
    ],
  },

  troubleshooting: {
    id: 'troubleshooting', title: 'Troubleshooting', icon: 'AlertTriangle',
    articles: [
      {
        id: 'ts_server_wont_start', title: 'Server Won\'t Start',
        summary: 'Server fails to launch or crashes immediately',
        detect: { type: 'server_status', check: 'stopped', pattern: 'failed' },
        content: [
          { type: 'problem', title: 'Problem', text: 'The server fails to start or crashes immediately after launching.' },
          { type: 'cause', title: 'Common Causes', text: '(1) Java not installed or wrong version, (2) Port already in use, (3) Corrupted server files, (4) Insufficient RAM allocation, (5) Invalid server.properties configuration.' },
          { type: 'fix', title: 'Check Java', text: 'Verify Java 17+ is installed. Go to Settings and check the Java path. Use the "Detect Java" button.' },
          { type: 'fix', title: 'Check Port', text: 'Ensure port 25565 is not in use by another application. Check Connection page for port status.' },
          { type: 'fix', title: 'Increase RAM', text: 'Try allocating more RAM in Settings. 4GB minimum is recommended for most servers.' },
          { type: 'link', title: 'Related Documentation', text: 'See "Starting & Stopping the Server" and "Settings Tutorial" for more details.' },
        ],
        related: ['start_stop', 'settings', 'faq_java', 'diagnostics'],
      },
      {
        id: 'ts_version_download_failed', title: 'Version Download Failed',
        summary: 'Cannot download Minecraft server version',
        content: [
          { type: 'problem', title: 'Problem', text: 'Downloading a Minecraft version fails with a network error.' },
          { type: 'cause', title: 'Common Causes', text: '(1) Internet connection issues, (2) Mojang/PaperMC servers down, (3) Antivirus blocking downloads, (4) Disk space full.' },
          { type: 'fix', title: 'Check Internet', text: 'Verify your internet connection is working. Try visiting https://papermc.io in a browser.' },
          { type: 'fix', title: 'Check Disk Space', text: 'Ensure you have sufficient disk space for the download (at least 1GB free).' },
          { type: 'link', title: 'Related', text: 'See "Server Management Tutorial" for alternative version switching methods.' },
        ],
        related: ['software', 'tut_server', 'connection'],
      },
      {
        id: 'ts_port_blocked', title: 'Port 25565 is Blocked',
        summary: 'Cannot connect to the server due to port issues',
        content: [
          { type: 'problem', title: 'Problem', text: 'Port 25565 shows as blocked or unreachable on the Connection page.' },
          { type: 'cause', title: 'Common Causes', text: '(1) Windows Firewall blocking the port, (2) Another application using the port, (3) ISP blocking incoming connections, (4) Router firewall.' },
          { type: 'fix', title: 'Open Firewall', text: 'Go to Connection page and click "Open Firewall". This needs administrator privileges.' },
          { type: 'fix', title: 'Change Port', text: 'Try using a different port (e.g., 25566) in Settings > Server Properties.' },
          { type: 'link', title: 'Related', text: 'See "Firewall" and "Connection Tutorial" for detailed guidance.' },
        ],
        related: ['firewall', 'connection', 'join_lan', 'join_playit'],
      },
      {
        id: 'ts_firewall', title: 'Firewall Issue',
        summary: 'Windows Firewall is blocking connections',
        detect: { type: 'firewall', check: 'inactive' },
        content: [
          { type: 'problem', title: 'Problem', text: 'Windows Firewall is blocking Minecraft server connections.' },
          { type: 'cause', title: 'Cause', text: 'Windows Firewall blocks incoming connections by default. A specific rule is needed to allow Minecraft traffic.' },
          { type: 'fix', title: 'One-Click Fix', text: 'Go to Connection page and click "Open Firewall". This adds the required inbound rule.' },
          { type: 'fix', title: 'Manual Fix', text: 'Open Windows Defender Firewall > Advanced Settings > Inbound Rules > New Rule. Allow port 25565 TCP.' },
        ],
        related: ['firewall', 'connection', 'join_lan'],
      },
      {
        id: 'ts_playit_offline', title: 'Playit.gg Tunnel Offline',
        summary: 'Playit tunnel keeps disconnecting',
        content: [
          { type: 'problem', title: 'Problem', text: 'The Playit.gg tunnel goes offline or fails to start.' },
          { type: 'cause', title: 'Common Causes', text: '(1) Internet connectivity issues, (2) Playit.gg service outage, (3) Firewall blocking Playit, (4) Account tier limits reached.' },
          { type: 'fix', title: 'Restart Tunnel', text: 'Stop and restart the Playit tunnel from the Connection page.' },
          { type: 'fix', title: 'Check Internet', text: 'Verify your internet connection. Playit requires a stable connection.' },
          { type: 'link', title: 'Related', text: 'See "Joining Through Playit.gg" for setup instructions.' },
        ],
        related: ['join_playit', 'connection', 'firewall'],
      },
      {
        id: 'ts_java_missing', title: 'Java Not Found',
        summary: 'Java is not installed or not detected',
        detect: { type: 'java', check: 'missing' },
        content: [
          { type: 'problem', title: 'Problem', text: 'MineControl OS cannot find a Java installation on your system.' },
          { type: 'cause', title: 'Cause', text: 'Java is not installed or the PATH environment variable is not set correctly.' },
          { type: 'fix', title: 'Install Java', text: 'Download and install Java 17 (LTS) or later from https://adoptium.net. Restart MineControl OS after installation.' },
          { type: 'fix', title: 'Set Path', text: 'In Settings, manually set the Java path to your Java installation (e.g., C:\\Program Files\\Java\\jdk-17\\bin\\java.exe).' },
        ],
        related: ['settings', 'faq_java', 'diagnostics'],
      },
      {
        id: 'ts_plugin_failed', title: 'Plugin Failed to Load',
        summary: 'Plugin causes errors or server crash',
        content: [
          { type: 'problem', title: 'Problem', text: 'A plugin fails to load or causes errors in the console.' },
          { type: 'cause', title: 'Common Causes', text: '(1) Plugin version incompatible with server version, (2) Missing dependencies, (3) Corrupted plugin file, (4) Configuration errors.' },
          { type: 'fix', title: 'Check Version', text: 'Verify the plugin supports your Minecraft version. Update both server and plugin if needed.' },
          { type: 'fix', title: 'Disable Plugin', text: 'Go to Plugins page and toggle the plugin off. If the server starts, the plugin was the cause.' },
        ],
        related: ['plugins', 'tut_plugins', 'console'],
      },
      {
        id: 'ts_mod_conflict', title: 'Mod Conflict',
        summary: 'Mods are conflicting with each other',
        content: [
          { type: 'problem', title: 'Problem', text: 'Multiple mods cause crashes or unexpected behavior.' },
          { type: 'cause', title: 'Cause', text: 'Mods may conflict when they modify the same game systems or depend on incompatible versions of libraries.' },
          { type: 'fix', title: 'Isolate Mods', text: 'Disable all mods, then enable them one by one to find the conflicting combination.' },
          { type: 'fix', title: 'Check Mixin Conflicts', text: 'Look for "mixin" errors in the console. These indicate mod compatibility issues.' },
        ],
        related: ['mods', 'tut_mods', 'software'],
      },
      {
        id: 'ts_database_error', title: 'Database Error',
        summary: 'SQLite database issues',
        detect: { type: 'database', check: 'error' },
        content: [
          { type: 'problem', title: 'Problem', text: 'A database error has occurred. The application may not function correctly.' },
          { type: 'cause', title: 'Common Causes', text: '(1) Database file corruption from improper shutdown, (2) Disk full, (3) Permission issues.' },
          { type: 'fix', title: 'Restart Application', text: 'Close and restart MineControl OS. WAL mode helps recover from crashes.' },
          { type: 'fix', title: 'Check Disk Space', text: 'Ensure the drive has free space. SQLite needs room for WAL files.' },
        ],
        related: ['diagnostics', 'settings', 'backups'],
      },
      {
        id: 'ts_backup_failed', title: 'Backup Failed',
        summary: 'Backup creation or restoration fails',
        content: [
          { type: 'problem', title: 'Problem', text: 'Creating or restoring a backup fails with an error.' },
          { type: 'cause', title: 'Common Causes', text: '(1) Disk space full, (2) File permission issues, (3) Server running during backup, (4) Corrupted backup file.' },
          { type: 'fix', title: 'Check Disk', text: 'Ensure sufficient free disk space for the backup file.' },
          { type: 'fix', title: 'Stop Server', text: 'Stop the server before creating or restoring backups for best results.' },
        ],
        related: ['backups', 'tut_backups', 'backup_restore'],
      },
      {
        id: 'ts_world_import_failed', title: 'World Import Failed',
        summary: 'Cannot import a world file',
        content: [
          { type: 'problem', title: 'Problem', text: 'Importing a world ZIP file fails with an error.' },
          { type: 'cause', title: 'Common Causes', text: '(1) Invalid ZIP format, (2) Missing level.dat file, (3) World from a newer Minecraft version, (4) File too large.' },
          { type: 'fix', title: 'Check Format', text: 'Ensure the ZIP file contains a valid Minecraft world folder with level.dat and region files.' },
          { type: 'fix', title: 'Check Version', text: 'Worlds from newer Minecraft versions may not be compatible with older server versions.' },
        ],
        related: ['world_import', 'worlds', 'tut_worlds'],
      },
    ],
  },

  tips: {
    id: 'tips', title: 'Quick Tips', icon: 'Lightbulb',
    articles: [
      {
        id: 'tip_first_launch', title: 'First Launch Tips',
        summary: 'Tips for new users',
        content: [
          { type: 'tip', title: 'Welcome', text: 'Welcome to MineControl OS! Start by creating your first server on the Software page, then configure it in Settings.' },
          { type: 'tip', title: 'Explore', text: 'Take a tour of all pages in the sidebar. Each page has a specific purpose for managing your server.' },
          { type: 'tip', title: 'Need Help?', text: 'This Guide page has tutorials and troubleshooting for every feature. Use the search bar above to find what you need.' },
        ],
        related: ['first_server', 'install', 'settings'],
      },
      {
        id: 'tip_first_server', title: 'First Server Tips',
        summary: 'Tips when setting up your first server',
        content: [
          { type: 'tip', title: 'Start Simple', text: 'Start with Paper (recommended) and a recent stable Minecraft version. Add plugins and mods gradually.' },
          { type: 'tip', title: 'RAM Setting', text: 'Allocate at least 4GB of RAM to your server. Too little RAM causes lag, too much can cause garbage collection issues.' },
          { type: 'tip', title: 'Backup Early', text: 'Create your first backup right after setting up the server. You will thank yourself later.' },
        ],
        related: ['first_server', 'settings', 'backups'],
      },
      {
        id: 'tip_plugins', title: 'Plugin Tips',
        summary: 'Best practices for plugins',
        content: [
          { type: 'tip', title: 'Essential Plugins', text: 'Start with essential plugins: LuckPerms (permissions), EssentialsX (commands), WorldEdit (building), and CoreProtect (rollback).' },
          { type: 'tip', title: 'Less is More', text: 'Too many plugins cause lag and conflicts. Only install what you actually need.' },
          { type: 'tip', title: 'Update Regularly', text: 'Keep your plugins updated. Outdated plugins may have security vulnerabilities or compatibility issues.' },
        ],
        related: ['plugins', 'install_plugins', 'tut_plugins'],
      },
      {
        id: 'tip_connection', title: 'Connection Tips',
        summary: 'Tips for server connectivity',
        content: [
          { type: 'tip', title: 'Use Playit', text: 'For the easiest setup to let friends join, use the Playit.gg tunnel. No port forwarding needed.' },
          { type: 'tip', title: 'Firewall First', text: 'If connection fails, always check the firewall first. Use the "Open Firewall" button on the Connection page.' },
          { type: 'tip', title: 'Test Locally', text: 'Always test connecting from localhost first before troubleshooting external connections.' },
        ],
        related: ['connection', 'join_local', 'join_playit', 'firewall'],
      },
      {
        id: 'tip_backup', title: 'Backup Tips',
        summary: 'Best practices for backups',
        content: [
          { type: 'tip', title: 'Schedule Backups', text: 'Set up automatic backups on a schedule. Daily backups are recommended for active servers.' },
          { type: 'tip', title: 'Keep Multiple', text: 'Keep at least 3-5 recent backups. You never know when you might need to go back further.' },
          { type: 'tip', title: 'Test Restores', text: 'Periodically test that your backups can be restored. A backup you cannot restore is worthless.' },
        ],
        related: ['backups', 'tut_backups', 'backup_restore'],
      },
    ],
  },

  shortcuts: {
    id: 'shortcuts', title: 'Keyboard Shortcuts', icon: 'Keyboard',
    articles: [
      {
        id: 'shortcuts_global', title: 'Global Shortcuts',
        summary: 'Keyboard shortcuts available throughout the app',
        content: [
          { type: 'shortcut', title: 'Navigate', keys: 'Ctrl + 1-9', desc: 'Quick switch between sidebar pages (1=Dashboard, 2=Software, etc.)' },
          { type: 'shortcut', title: 'Console Focus', keys: 'Ctrl + `', desc: 'Jump to the Console page' },
          { type: 'shortcut', title: 'Search', keys: 'Ctrl + F', desc: 'Search the current page (where supported)' },
          { type: 'shortcut', title: 'Refresh', keys: 'Ctrl + R', desc: 'Refresh the current page data' },
          { type: 'shortcut', title: 'Server Start', keys: 'Ctrl + Shift + S', desc: 'Start the server' },
          { type: 'shortcut', title: 'Server Stop', keys: 'Ctrl + Shift + X', desc: 'Stop the server' },
          { type: 'shortcut', title: 'Full Screen', keys: 'F11', desc: 'Toggle full screen mode' },
          { type: 'shortcut', title: 'Guide', keys: 'Ctrl + H', desc: 'Open this Guide page' },
        ],
        related: [],
      },
      {
        id: 'shortcuts_console', title: 'Console Shortcuts',
        summary: 'Shortcuts for the Console page',
        content: [
          { type: 'shortcut', title: 'Send Command', keys: 'Enter', desc: 'Send the typed command to the server' },
          { type: 'shortcut', title: 'Clear Console', keys: 'Ctrl + L', desc: 'Clear the console output' },
          { type: 'shortcut', title: 'Command History', keys: '↑/↓', desc: 'Cycle through previously sent commands' },
          { type: 'shortcut', title: 'Autocomplete', keys: 'Tab', desc: 'Autocomplete commands (where supported)' },
        ],
        related: ['console'],
      },
    ],
  },

  whats_new: {
    id: 'whats_new', title: "What's New", icon: 'Sparkles',
    articles: [
      {
        id: 'release_current', title: 'Current Release Notes',
        summary: 'What is new in the current version',
        content: [
          { type: 'version', title: 'Version 1.0.52', text: 'Latest stable release' },
          { type: 'feature', title: 'Phase 9 — Guide & Knowledge Center', text: 'Complete built-in help system with Getting Started guides, Tutorials, FAQ, Documentation, Troubleshooting, Search, Quick Tips, and Keyboard Shortcuts.' },
          { type: 'feature', title: 'Phase 8 — Feedback & Issue Management', text: 'Local-first issue reporting with automatic diagnostics, screenshots, offline queue, and issue tracker integration.' },
          { type: 'feature', title: 'Phase 7 — Discord Integration', text: 'Discord bot with configurable notifications for server events, player activity, and backup status.' },
          { type: 'feature', title: 'Phase 6 — Universal Connection Management', text: 'Connection Wizard, Playit.gg tunnel, LAN detection, firewall management, and comprehensive diagnostics.' },
          { type: 'feature', title: 'Phase 5 — Backup & Recovery', text: 'Scheduled backups, encryption, integrity verification, export/import, and one-click restore.' },
          { type: 'feature', title: 'Phase 4 — World Management', text: 'World import/export, dimension management, optimization, repair, and cloning.' },
          { type: 'feature', title: 'Phase 3 — Player Management', text: 'Player approval workflow, role-based permissions, ban/kick/mute, and whitelist management.' },
          { type: 'fix', title: 'Bug Fixes', text: 'Discord listener leak fix, preload IPC deduplication, SQLite performance indexes, graceful shutdown chain.' },
          { type: 'known', title: 'Known Issues', text: 'Plugin marketplace may show limited results on slow connections. Playit tunnel may take up to 30 seconds to establish.' },
          { type: 'future', title: 'Coming Soon', text: 'Advanced automation (conditional scheduling), Performance profiler integration (Spark), Multi-language support.' },
        ],
        related: ['guide', 'feedback', 'discord'],
      },
    ],
  },
};

// ============================
// SEARCH ENGINE
// ============================

interface SearchResult {
  sectionId: string;
  sectionTitle: string;
  articleId: string;
  articleTitle: string;
  summary: string;
  score: number;
  matches: string[];
}

function tokenize(text: string): string[] {
  return text.toLowerCase().split(/[^a-z0-9]+/).filter(Boolean);
}

function scoreArticle(query: string, article: Article, sectionTitle: string): SearchResult | null {
  const qTokens = tokenize(query);
  if (qTokens.length === 0) return null;

  const searchableText = `${article.title} ${article.summary} ${article.content.map(c => `${c.title} ${c.text}`).join(' ')}`;
  const textLower = searchableText.toLowerCase();
  const tokens = tokenize(searchableText);

  let score = 0;
  const matches: string[] = [];

  for (const qt of qTokens) {
    if (article.title.toLowerCase().includes(qt)) score += 10;
    if (article.summary.toLowerCase().includes(qt)) score += 5;
    if (tokens.includes(qt)) score += 2;

    const regex = new RegExp(qt.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'gi');
    const found = textLower.match(regex);
    if (found) {
      const idx = textLower.indexOf(qt);
      if (idx >= 0) {
        const snippet = searchableText.substring(Math.max(0, idx - 30), idx + qt.length + 30);
        matches.push(snippet);
      }
    }
  }

  if (score === 0) return null;

  return {
    sectionId: sectionTitle,
    sectionTitle,
    articleId: article.id,
    articleTitle: article.title,
    summary: article.summary,
    score,
    matches: matches.slice(0, 3),
  };
}

interface Article {
  id: string;
  title: string;
  summary: string;
  content: ContentBlock[];
  related?: string[];
  detect?: { type: string; check: string; pattern?: string };
}

interface ContentBlock {
  type: string;
  title: string;
  text?: string;
  keys?: string;
  desc?: string;
}

// ============================
// SERVICE
// ============================

function getCurrentVersion(): string {
  try {
    return require('../../package.json').version;
  } catch {
    try {
      return require('../package.json').version;
    } catch {
      return '1.0.52';
    }
  }
}

export const guideService = {
  getSections() {
    const db = getDatabase();
    const prefs = db.prepare("SELECT key, value FROM guide_preferences WHERE user_id = 'default'").all() as any[];
    const prefMap: Record<string, string> = {};
    for (const p of prefs) prefMap[p.key] = p.value;

    const result: Record<string, any> = {};
    for (const [key, section] of Object.entries(SECTIONS)) {
      result[key] = {
        id: section.id,
        title: section.title,
        icon: section.icon,
        articleCount: section.articles.length,
        articles: section.articles.map(a => ({
          id: a.id,
          title: a.title,
          summary: a.summary,
          hasDetect: !!a.detect,
        })),
      };
    }
    return { sections: result, preferences: { tips_enabled: prefMap.tips_enabled !== 'false', ...prefMap } };
  },

  getArticle(sectionId: string, articleId: string) {
    const section = SECTIONS[sectionId];
    if (!section) return null;
    const article = section.articles.find(a => a.id === articleId);
    if (!article) return null;

    // Track view
    const db = getDatabase();
    db.prepare(`
      INSERT INTO guide_recently_viewed (user_id, section_id, article_id, title, viewed_at)
      VALUES ('default', ?, ?, ?, datetime('now'))
    `).run(sectionId, articleId, article.title);

    // Clean old entries (keep last 50)
    db.prepare(`
      DELETE FROM guide_recently_viewed WHERE id NOT IN (
        SELECT id FROM guide_recently_viewed WHERE user_id = 'default' ORDER BY viewed_at DESC LIMIT 50
      )
    `).run();

    // Get related articles
    const related = (article.related || [])
      .map((relId: string) => {
        for (const [, sec] of Object.entries(SECTIONS)) {
          const a = sec.articles.find((art: Article) => art.id === relId);
          if (a) return { sectionId: sec.id, sectionTitle: sec.title, articleId: a.id, title: a.title, summary: a.summary };
        }
        return null;
      })
      .filter(Boolean);

    return {
      section: { id: section.id, title: section.title },
      article: {
        ...article,
        related,
        hasDetect: !!article.detect,
      },
    };
  },

  search(query: string): SearchResult[] {
    if (!query || query.trim().length < 2) return [];

    const results: SearchResult[] = [];
    for (const [, section] of Object.entries(SECTIONS)) {
      for (const article of section.articles) {
        const result = scoreArticle(query, article, section.title);
        if (result) results.push(result);
      }
    }

    results.sort((a, b) => b.score - a.score);

    // Track search
    const db = getDatabase();
    db.prepare(`
      INSERT INTO guide_search_history (user_id, query, result_count, searched_at)
      VALUES ('default', ?, ?, datetime('now'))
    `).run(query, results.length);

    return results.slice(0, 50);
  },

  getTroubleshootingDetections() {
    const detections: any[] = [];
    const db = getDatabase();

    for (const [, section] of Object.entries(SECTIONS)) {
      for (const article of section.articles) {
        if (!article.detect) continue;

        const detect = article.detect;
        let detected = false;
        let detail = '';

        if (detect.type === 'server_status') {
          try {
            const server = activeServer.current;
            if (server?.status === detect.check || server?.status?.includes(detect.pattern || '')) {
              detected = true;
              detail = `Server status: ${server.status}`;
            }
          } catch {}
        } else if (detect.type === 'firewall') {
          try {
            const { firewallManager } = require('./firewallManager');
            if (!firewallManager.isAdmin()) {
              if (detect.check === 'missing') { detected = true; detail = 'Cannot check firewall without admin'; }
            } else {
              const { execSync } = require('child_process');
              const out = execSync('netsh advfirewall firewall show rule name="MineControl OS Minecraft" dir=in verbose', { encoding: 'utf-8', timeout: 3000 });
              const isActive = out.includes('Enabled:               Yes');
              if ((detect.check === 'active' && !isActive) || (detect.check === 'inactive' && isActive)) {
                detected = true;
                detail = 'Firewall rule is ' + (isActive ? 'active' : 'inactive');
              }
            }
          } catch {
            if (detect.check === 'missing') { detected = true; detail = 'No firewall rule found'; }
          }
        } else if (detect.type === 'java') {
          try {
            const { execSync } = require('child_process');
            execSync('java -version', { encoding: 'utf-8', timeout: 3000 });
          } catch {
            detected = true;
            detail = 'Java not found in PATH';
          }
        }

        if (detected) {
          detections.push({ sectionId: section.id, articleId: article.id, title: article.title, summary: article.summary, detail });
        }
      }
    }

    return detections;
  },

  getBookmarks() {
    const db = getDatabase();
    return db.prepare("SELECT * FROM guide_bookmarks WHERE user_id = 'default' ORDER BY created_at DESC").all();
  },

  addBookmark(sectionId: string, articleId: string, title: string) {
    const db = getDatabase();
    db.prepare(`
      INSERT OR IGNORE INTO guide_bookmarks (user_id, section_id, article_id, title)
      VALUES ('default', ?, ?, ?)
    `).run(sectionId, articleId, title);
    return this.getBookmarks();
  },

  removeBookmark(sectionId: string, articleId: string) {
    const db = getDatabase();
    db.prepare("DELETE FROM guide_bookmarks WHERE user_id = 'default' AND section_id = ? AND article_id = ?")
      .run(sectionId, articleId);
    return this.getBookmarks();
  },

  getRecentlyViewed() {
    const db = getDatabase();
    return db.prepare(`
      SELECT DISTINCT section_id, article_id, title, viewed_at FROM guide_recently_viewed
      WHERE user_id = 'default'
      ORDER BY viewed_at DESC LIMIT 10
    `).all();
  },

  getSearchHistory() {
    const db = getDatabase();
    return db.prepare("SELECT DISTINCT query FROM guide_search_history WHERE user_id = 'default' ORDER BY searched_at DESC LIMIT 10").all();
  },

  getTutorialProgress() {
    const db = getDatabase();
    return db.prepare("SELECT * FROM guide_tutorial_progress WHERE user_id = 'default'").all();
  },

  updateTutorialProgress(tutorialId: string, stepIndex: number, completed: boolean) {
    const db = getDatabase();
    const existing = db.prepare("SELECT id FROM guide_tutorial_progress WHERE user_id = 'default' AND tutorial_id = ?").get(tutorialId) as any;
    if (existing) {
      if (completed) {
        db.prepare(`
          UPDATE guide_tutorial_progress SET step_index = ?, completed = 1, completed_at = datetime('now')
          WHERE user_id = 'default' AND tutorial_id = ?
        `).run(stepIndex, tutorialId);
      } else {
        db.prepare(`
          UPDATE guide_tutorial_progress SET step_index = ?
          WHERE user_id = 'default' AND tutorial_id = ?
        `).run(stepIndex, tutorialId);
      }
    } else {
      db.prepare(`
        INSERT INTO guide_tutorial_progress (user_id, tutorial_id, step_index, completed)
        VALUES ('default', ?, ?, ?)
      `).run(tutorialId, stepIndex, completed ? 1 : 0);
    }
    return this.getTutorialProgress();
  },

  setPreference(key: string, value: string) {
    const db = getDatabase();
    db.prepare(`
      INSERT OR REPLACE INTO guide_preferences (user_id, key, value, updated_at)
      VALUES ('default', ?, ?, datetime('now'))
    `).run(key, value);
  },

  getPreferences() {
    const db = getDatabase();
    const rows = db.prepare("SELECT key, value FROM guide_preferences WHERE user_id = 'default'").all() as any[];
    const prefs: Record<string, string> = {};
    for (const r of rows) prefs[r.key] = r.value;
    return prefs;
  },

  getDashboardWidget() {
    const recent = this.getRecentlyViewed();
    const bookmarks = this.getBookmarks();
    const detections = this.getTroubleshootingDetections();
    const version = getCurrentVersion();

    return {
      recentArticles: recent,
      bookmarks: bookmarks.slice(0, 3),
      detections: detections.slice(0, 3),
      version,
      tip: this.getRandomTip(),
    };
  },

  getRandomTip() {
    const tipSection = SECTIONS.tips;
    if (!tipSection || tipSection.articles.length === 0) return null;
    const allTips = tipSection.articles.flatMap(a =>
      a.content.filter(c => c.type === 'tip').map(c => ({ articleId: a.id, title: a.title, tip: c.text }))
    );
    if (allTips.length === 0) return null;
    const prefs = this.getPreferences();
    if (prefs.tips_enabled === 'false') return null;
    return allTips[Math.floor(Math.random() * allTips.length)];
  },

  getReleaseNotes() {
    return SECTIONS.whats_new.articles[0];
  },

  getQuickStartArticles() {
    return SECTIONS.getting_started.articles.map(a => ({
      id: a.id,
      title: a.title,
      summary: a.summary,
    }));
  },
};
