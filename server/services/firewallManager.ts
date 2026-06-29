import { execSync } from 'child_process';
import os from 'os';

const RULE_NAME = 'MineControl OS Minecraft';

export class FirewallManager {
  isWindows(): boolean {
    return os.platform() === 'win32';
  }

  checkRule(): { exists: boolean; enabled: boolean; port?: string; protocol?: string } {
    if (!this.isWindows()) return { exists: false, enabled: false };
    try {
      const out = execSync(`netsh advfirewall firewall show rule name="${RULE_NAME}" dir=in verbose`, { encoding: 'utf-8', timeout: 8000 });
      const exists = out.length > 50;
      const enabled = out.includes('Enabled:               Yes');
      const portMatch = out.match(/LocalPort:\s+(\d+)/);
      return { exists, enabled, port: portMatch?.[1] || undefined, protocol: 'TCP' };
    } catch {
      return { exists: false, enabled: false };
    }
  }

  addRule(port: number = 25565): { success: boolean; message: string } {
    if (!this.isWindows()) return { success: false, message: 'Firewall management is only available on Windows' };
    try {
      const existing = this.checkRule();
      if (existing.exists && existing.enabled) {
        return { success: true, message: 'Firewall rule already exists and is active' };
      }
      if (existing.exists && !existing.enabled) {
        execSync(`netsh advfirewall firewall set rule name="${RULE_NAME}" new enable=yes`, { encoding: 'utf-8', timeout: 10000 });
        return { success: true, message: 'Firewall rule re-enabled' };
      }
      execSync(
        `netsh advfirewall firewall add rule name="${RULE_NAME}" dir=in action=allow protocol=TCP localport=${port} description="Allow Minecraft server connections through MineControl OS"`,
        { encoding: 'utf-8', timeout: 10000 }
      );
      return { success: true, message: `Firewall rule added for TCP port ${port}` };
    } catch (err: any) {
      if (err.message?.includes('Access is denied') || err.message?.includes('required')) {
        return { success: false, message: 'Administrator permission required. Run MineControl OS as Administrator to modify firewall rules.' };
      }
      return { success: false, message: err.message || 'Failed to add firewall rule' };
    }
  }

  removeRule(): { success: boolean; message: string } {
    if (!this.isWindows()) return { success: false, message: 'Firewall management is only available on Windows' };
    try {
      execSync(`netsh advfirewall firewall delete rule name="${RULE_NAME}"`, { encoding: 'utf-8', timeout: 10000 });
      return { success: true, message: 'Firewall rule removed' };
    } catch (err: any) {
      return { success: false, message: err.message || 'Failed to remove firewall rule' };
    }
  }

  repairRule(port: number = 25565): { success: boolean; message: string } {
    if (!this.isWindows()) return { success: false, message: 'Firewall management is only available on Windows' };
    try {
      // Remove existing rule if it exists
      const existing = this.checkRule();
      if (existing.exists) {
        execSync(`netsh advfirewall firewall delete rule name="${RULE_NAME}"`, { encoding: 'utf-8', timeout: 10000 });
      }
      // Re-create fresh
      execSync(
        `netsh advfirewall firewall add rule name="${RULE_NAME}" dir=in action=allow protocol=TCP localport=${port} description="Allow Minecraft server connections through MineControl OS"`,
        { encoding: 'utf-8', timeout: 10000 }
      );
      return { success: true, message: `Firewall rule repaired for TCP port ${port}` };
    } catch (err: any) {
      if (err.message?.includes('Access is denied') || err.message?.includes('required')) {
        return { success: false, message: 'Administrator permission required. Run MineControl OS as Administrator to modify firewall rules.' };
      }
      return { success: false, message: err.message || 'Failed to repair firewall rule' };
    }
  }

  openFirewallSettings(): { success: boolean; message: string } {
    if (!this.isWindows()) return { success: false, message: 'Only available on Windows' };
    try {
      execSync('control firewall.cpl', { timeout: 3000 });
      return { success: true, message: 'Windows Firewall settings opened' };
    } catch (err: any) {
      return { success: false, message: err.message || 'Failed to open firewall settings' };
    }
  }

  openAdvancedFirewall(): { success: boolean; message: string } {
    if (!this.isWindows()) return { success: false, message: 'Only available on Windows' };
    try {
      execSync('wf.msc', { timeout: 3000 });
      return { success: true, message: 'Windows Firewall with Advanced Security opened' };
    } catch (err: any) {
      return { success: false, message: err.message || 'Failed to open advanced firewall' };
    }
  }

  isAdmin(): boolean {
    try {
      execSync('net session', { encoding: 'utf-8', timeout: 3000 });
      return true;
    } catch {
      return false;
    }
  }

  verifyPort(port: number): { allowed: boolean; message: string } {
    try {
      const out = execSync(`netsh advfirewall firewall show rule name="${RULE_NAME}" dir=in verbose`, { encoding: 'utf-8', timeout: 8000 });
      const hasPort = out.includes(`LocalPort: ${port}`);
      const enabled = out.includes('Enabled:               Yes');
      if (enabled && hasPort) return { allowed: true, message: `Port ${port} is allowed through firewall` };
      if (enabled && !hasPort) return { allowed: false, message: `Rule exists but port ${port} is not included` };
      return { allowed: false, message: `Port ${port} is blocked by firewall` };
    } catch {
      return { allowed: false, message: 'No firewall rule found for Minecraft' };
    }
  }
}

export const firewallManager = new FirewallManager();
