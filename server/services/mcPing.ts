import net from 'net';

function writeVarInt(value: number): Buffer {
  const buf: number[] = [];
  do {
    let temp = value & 0x7F;
    value >>>= 7;
    if (value !== 0) temp |= 0x80;
    buf.push(temp);
  } while (value !== 0);
  return Buffer.from(buf);
}

function writeString(str: string): Buffer {
  const strBuf = Buffer.from(str, 'utf8');
  return Buffer.concat([writeVarInt(strBuf.length), strBuf]);
}

function readVarInt(buf: Buffer, offset: number): { value: number; bytes: number } {
  let result = 0;
  let shift = 0;
  let bytes = 0;
  while (true) {
    const byte = buf[offset + bytes];
    result |= (byte & 0x7F) << shift;
    shift += 7;
    bytes++;
    if (!(byte & 0x80)) break;
  }
  return { value: result, bytes };
}

export interface McPingResult {
  online: boolean;
  latency?: number;
  version?: { name: string; protocol: number };
  players?: { max: number; online: number; sample?: { name: string; id: string }[] };
  description?: any;
  favicon?: string;
  error?: string;
}

export function mcPing(host: string, port: number, timeout = 5000): Promise<McPingResult> {
  return new Promise((resolve) => {
    const socket = new net.Socket();
    let resolved = false;
    const startTime = Date.now();

    socket.setTimeout(timeout);

    socket.on('connect', () => {
      const handshake = Buffer.concat([
        writeVarInt(0),
        writeVarInt(-1),
        writeString(host),
        Buffer.from([(port >> 8) & 0xFF, port & 0xFF]),
        writeVarInt(1),
      ]);
      const handshakePacket = Buffer.concat([writeVarInt(handshake.length), handshake]);
      const requestPacket = Buffer.concat([writeVarInt(1), writeVarInt(0)]);
      socket.write(Buffer.concat([handshakePacket, requestPacket]));
    });

    let dataBuf = Buffer.alloc(0);

    socket.on('data', (data) => {
      dataBuf = Buffer.concat([dataBuf, data]);
      if (resolved) return;
      try {
        let offset = 0;
        const { bytes: lenBytes } = readVarInt(dataBuf, offset);
        offset += lenBytes;
        const packetId = dataBuf[offset];
        if (packetId !== 0x00) return;
        offset++;
        const { value: strLen, bytes: strBytes } = readVarInt(dataBuf, offset);
        offset += strBytes;
        if (dataBuf.length < offset + strLen) return;
        const jsonStr = dataBuf.slice(offset, offset + strLen).toString('utf8');
        const json = JSON.parse(jsonStr);
        resolved = true;
        socket.destroy();
        resolve({
          online: true,
          latency: Date.now() - startTime,
          version: json.version,
          players: json.players,
          description: json.description,
          favicon: json.favicon,
        });
      } catch {}
    });

    socket.on('error', (err) => {
      if (!resolved) {
        resolved = true;
        socket.destroy();
        resolve({ online: false, error: err.message });
      }
    });

    socket.on('close', () => {
      if (!resolved) {
        resolved = true;
        resolve({ online: false, error: 'Connection closed' });
      }
    });

    socket.on('timeout', () => {
      if (!resolved) {
        resolved = true;
        socket.destroy();
        resolve({ online: false, error: 'Timed out' });
      }
    });

    (socket as any)._connectTime = Date.now();
    socket.connect(port, host);
  });
}

export function formatDescription(desc: any): string {
  if (typeof desc === 'string') return desc;
  if (desc?.text) return desc.text;
  if (Array.isArray(desc?.extra)) {
    return desc.extra.map((e: any) => e.text || '').join('');
  }
  return 'A Minecraft Server';
}
