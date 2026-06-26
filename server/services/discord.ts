import { Client, GatewayIntentBits, TextChannel } from 'discord.js';
import { minecraftServer } from './minecraftServer';
import { getDatabase } from '../database';

class DiscordService {
  private client: Client;
  private channelId: string | null = null;
  private initialized = false;

  constructor() {
    this.client = new Client({
      intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.MessageContent,
      ]
    });

    this.client.on('ready', () => {
      console.log(`[Discord] Logged in as ${this.client.user?.tag}!`);
      this.sendMessage('🟢 MineControl OS: Bot connected and ready.');
    });

    this.client.on('messageCreate', (message) => {
      if (message.author.bot) return;
      if (message.channelId !== this.channelId) return;

      // Pipe Discord message to Minecraft
      const content = message.cleanContent.replace(/"/g, '\\"');
      if (minecraftServer.isRunning && content) {
        minecraftServer.sendCommand(`tellraw @a {"text":"[Discord] ${message.author.username}: ${content}","color":"blue"}`).catch(() => {});
      }
    });
  }

  async initialize() {
    if (this.initialized) return;

    const db = getDatabase();
    const tokenRow = db.prepare("SELECT value FROM server_config WHERE key = 'discordToken'").get() as any;
    const channelRow = db.prepare("SELECT value FROM server_config WHERE key = 'discordChannel'").get() as any;

    const token = tokenRow?.value;
    this.channelId = channelRow?.value || null;

    if (token && this.channelId) {
      try {
        await this.client.login(token);
        this.initialized = true;
        this.setupHooks();
      } catch (err) {
        console.error('[Discord] Failed to login:', err);
      }
    }
  }

  async restart() {
    try {
      this.client.destroy();
    } catch {}
    this.initialized = false;
    await this.initialize();
  }

  private setupHooks() {
    minecraftServer.on('server:started', () => {
      this.sendMessage('✅ Minecraft Server has started!');
    });

    minecraftServer.on('server:stopped', (code) => {
      this.sendMessage(`🛑 Minecraft Server stopped (Code: ${code}).`);
    });

    minecraftServer.on('server:crashed', (err) => {
      this.sendMessage(`❌ Minecraft Server crashed!\n\`\`\`\n${err}\n\`\`\``);
    });

    minecraftServer.on('player:chat', (username, message) => {
      this.sendMessage(`**<${username}>** ${message}`);
    });

    minecraftServer.on('player:join', (username) => {
      this.sendMessage(`📥 **${username}** joined the game.`);
    });

    minecraftServer.on('player:leave', (username) => {
      this.sendMessage(`📤 **${username}** left the game.`);
    });
  }

  public async sendMessage(content: string) {
    if (!this.initialized || !this.channelId) return;
    try {
      const channel = await this.client.channels.fetch(this.channelId);
      if (channel && channel.isTextBased()) {
        await (channel as TextChannel).send(content);
      }
    } catch (err) {
      console.error('[Discord] Failed to send message:', err);
    }
  }
}

export const discordService = new DiscordService();
