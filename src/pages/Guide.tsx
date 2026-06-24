import React from 'react';
import { BookOpen, Server, Puzzle, Map, Wifi, Github, Shield, RefreshCw } from 'lucide-react';

const sections = [
  {
    icon: Server,
    title: 'How to Start the Server',
    content: [
      'Go to the Dashboard tab.',
      'Click the green Start button in the sidebar or the dashboard.',
      'Wait for the status to change to "Online" (usually 10-30 seconds).',
      'Once online, players can connect to your server.',
      'Use the Stop button to shut down, or Restart to reboot.',
    ],
  },
  {
    icon: RefreshCw,
    title: 'How to Change Minecraft Version',
    content: [
      'Go to Settings → Version Selector.',
      'Choose any PaperMC version from the list (1.20.1 to latest).',
      'Click "Switch Version" — the app downloads the correct server jar automatically.',
      'Restart the server for the new version to take effect.',
    ],
  },
  {
    icon: Puzzle,
    title: 'How to Add Plugins',
    content: [
      'Go to the Plugins tab.',
      'Click "Install Plugin" to add a custom plugin by URL.',
      'Or click a "Quick Install" button for popular plugins (LuckPerms, EssentialsX, etc).',
      'You can also drag and drop .jar files into the minecraft/plugins/ folder manually.',
      'Use the toggle to enable/disable plugins without removing them.',
      'Restart the server after adding or removing plugins.',
    ],
  },
  {
    icon: Map,
    title: 'How to Use the Live Map',
    content: [
      'Install BlueMap or Dynmap plugin in your server (use the Plugins tab).',
      'Restart the server to generate map data.',
      'Go to the World Map tab in the app.',
      'Select your map plugin and enter the correct port (BlueMap: 8100, Dynmap: 8123).',
      'The live map will appear in the app — you can also open it in a browser.',
    ],
  },
  {
    icon: Shield,
    title: 'How to Use Claims & Boundaries',
    content: [
      'Install a land claim plugin like GriefPrevention or WorldGuard in your server.',
      'Players can claim land in-game using the plugin commands.',
      'The app shows claimed areas on the map (coming soon with plugin integration).',
      'To set a claim from the app, go to the Worlds tab and configure boundaries.',
    ],
  },
  {
    icon: Wifi,
    title: 'How to Share the Join Link',
    content: [
      'Go to the Connection tab.',
      'You will see: Localhost, LAN IP, Public IP, and Playit.gg addresses.',
      'Click Copy next to any address to copy it to clipboard.',
      'For friends outside your network: use Public IP (requires port forwarding) or Playit.gg.',
      'Playit.gg is recommended — no port forwarding needed, works with CGNAT.',
    ],
  },
  {
    icon: Github,
    title: 'How to Report Bugs & Request Features',
    content: [
      'Go to the GitHub tab in the app.',
      'Fill out the Bug Report form with a title, description, and attach logs/images/videos.',
      'Or fill out the Feature Request form with your idea.',
      'Reports are stored locally and linked to GitHub.',
      'The owner can review, accept, or delay requests.',
    ],
  },
  {
    icon: Shield,
    title: 'Premium vs Non-Premium Mode',
    content: [
      'Premium mode: Only official Minecraft accounts can join.',
      'Non-premium (Cracked) mode: Any launcher can join (TLauncher, etc.).',
      'Switch modes in Settings under "Connection Mode".',
      'Restart the server after switching for the change to take effect.',
    ],
  },
];

export default function Guide() {
  return (
    <div className="space-y-6 animate-fade-in max-w-4xl">
      <div>
        <h2 className="text-xl font-bold text-gray-100 flex items-center gap-2">
          <BookOpen className="text-minecraft-500" size={24} />
          Beginner's Guide
        </h2>
        <p className="text-sm text-gray-500 mt-0.5">
          Everything you need to know to manage your Minecraft server
        </p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {sections.map((section) => (
          <div key={section.title} className="card-hover">
            <div className="flex items-center gap-3 mb-3">
              <div className="p-2 rounded-lg bg-minecraft-500/10 text-minecraft-500">
                <section.icon size={20} />
              </div>
              <h3 className="text-sm font-semibold text-gray-200">{section.title}</h3>
            </div>
            <ol className="space-y-1.5">
              {section.content.map((step, i) => (
                <li key={i} className="text-xs text-gray-400 flex items-start gap-2">
                  <span className="w-4 h-4 rounded-full bg-surface-800 text-gray-500 flex items-center justify-center flex-shrink-0 mt-0.5 text-[10px] font-medium">
                    {i + 1}
                  </span>
                  <span>{step}</span>
                </li>
              ))}
            </ol>
          </div>
        ))}
      </div>

      <div className="card bg-surface-900/50 border border-surface-700">
        <h3 className="text-sm font-medium text-gray-200 mb-2">Need More Help?</h3>
        <p className="text-xs text-gray-400">
          Join our Discord community or check the GitHub repository for more detailed documentation.
          Use the GitHub tab in the app to report bugs or request new features.
        </p>
      </div>
    </div>
  );
}
