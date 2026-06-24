import { exec } from 'child_process';
import { promisify } from 'util';
import { EventEmitter } from 'events';

const execAsync = promisify(exec);

class MCController extends EventEmitter {
  constructor() {
    super();
    this._monitorInterval = null;
    this._lastStatus = false;
  }

  async getStatus() {
    try {
      const { stdout } = await execAsync('systemctl is-active minecraft.service');
      return stdout.trim() === 'active';
    } catch {
      return false;
    }
  }

  async start() {
    await execAsync('sudo systemctl start minecraft.service');
  }

  async stop() {
    await execAsync('sudo systemctl stop minecraft.service');
  }

  async restart() {
    await execAsync('sudo systemctl restart minecraft.service');
  }

  async getMetrics() {
    try {
      const [cpuRaw, memRaw, tpsRaw] = await Promise.all([
        execAsync("top -bn1 2>/dev/null | grep 'Cpu(s)' | awk '{print $2}'"),
        execAsync("free -m 2>/dev/null | awk '/^Mem:/ {print $3, $2}'"),
        execAsync(
          "journalctl -u minecraft.service -n 1 --no-pager --output=cat 2>/dev/null | grep -oP '\\d+\\.\\d+ tps' | tail -1"
        )
      ]);

      const cpu = parseFloat(cpuRaw.stdout) || 0;
      const memParts = memRaw.stdout.trim().split(' ').map(Number);
      const memUsed = memParts[0] || 0;
      const memTotal = memParts[1] || 1;
      const tps = parseFloat(tpsRaw.stdout) || -1;

      return {
        cpu,
        memory: {
          used: memUsed,
          total: memTotal,
          percent: (memUsed / memTotal) * 100
        },
        tps
      };
    } catch {
      return null;
    }
  }

  async getLogs(lines = 100) {
    try {
      const { stdout } = await execAsync(
        `journalctl -u minecraft.service -n ${lines} --no-pager --output=cat 2>/dev/null`
      );
      return stdout.split('\n').filter(Boolean);
    } catch {
      return [];
    }
  }

  startPolling() {
    this.stopPolling();
    this._monitorInterval = setInterval(async () => {
      const metrics = await this.getMetrics();
      if (metrics) {
        this.emit('metrics', metrics);
      }

      const running = await this.getStatus();
      if (running !== this._lastStatus) {
        this._lastStatus = running;
        this.emit('status', running);
      }
    }, 3000);
  }

  stopPolling() {
    if (this._monitorInterval) {
      clearInterval(this._monitorInterval);
      this._monitorInterval = null;
    }
  }
}

export const mcController = new MCController();
