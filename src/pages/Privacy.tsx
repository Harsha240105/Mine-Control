import React from 'react';
import { Shield, Info } from 'lucide-react';

export default function Privacy() {
  return (
    <div className="max-w-3xl mx-auto space-y-6 animate-fade-in">
      <div>
        <h2 className="text-xl font-bold text-gray-100 flex items-center gap-2">
          <Shield className="text-minecraft-500" size={24} />
          Privacy Policy
        </h2>
        <p className="text-sm text-gray-500 mt-1">How MineControl OS handles your data.</p>
      </div>

      <div className="card p-6 space-y-5 text-sm text-gray-300 leading-relaxed">
        <section>
          <h3 className="text-base font-semibold text-gray-200 mb-2">Data Collection</h3>
          <p>MineControl OS collects minimal data necessary for operation:</p>
          <ul className="list-disc list-inside mt-2 space-y-1 text-gray-400">
            <li>Server configuration files (server.properties, etc.)</li>
            <li>Authentication credentials stored locally as secure tokens</li>
            <li>Usage analytics (page views, feature usage) to improve the application</li>
          </ul>
        </section>

        <section>
          <h3 className="text-base font-semibold text-gray-200 mb-2">Data Storage</h3>
          <p>All server data is stored locally on your machine. We do not upload your server files, world data, or player data to external services unless you explicitly use a cloud backup feature.</p>
        </section>

        <section>
          <h3 className="text-base font-semibold text-gray-200 mb-2">Third-Party Services</h3>
          <p>MineControl OS may communicate with:</p>
          <ul className="list-disc list-inside mt-2 space-y-1 text-gray-400">
            <li>Mojang API (for UUID resolution, skin fetching)</li>
            <li>GitHub API (for update checks and issue submission)</li>
            <li>Discord API (if you configure the Discord integration)</li>
          </ul>
        </section>

        <section>
          <h3 className="text-base font-semibold text-gray-200 mb-2">Your Rights</h3>
          <p>You retain full ownership of all your data. You may delete the application and all associated data at any time by uninstalling MineControl OS and removing its data directory.</p>
        </section>

        <section>
          <h3 className="text-base font-semibold text-gray-200 mb-2">Contact</h3>
          <p>For privacy concerns, please open an issue on our GitHub repository.</p>
        </section>
      </div>

      <div className="flex items-start gap-3 p-4 rounded-lg bg-surface-800/50 border border-surface-700/50">
        <Info size={16} className="text-minecraft-400 mt-0.5 shrink-0" />
        <p className="text-xs text-gray-500">This privacy policy applies to the MineControl OS application only. Your Minecraft server's privacy practices are separate and governed by your own server configuration.</p>
      </div>
    </div>
  );
}
