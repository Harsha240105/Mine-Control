import { Server as SocketIOServer } from 'socket.io';

let io: SocketIOServer | null = null;

export function setIO(instance: SocketIOServer): void {
  io = instance;
}

export function getIO(): SocketIOServer {
  if (!io) {
    throw new Error('Socket.IO not initialized. Call setIO() first.');
  }
  return io;
}

export function emitToAll(event: string, ...args: any[]): void {
  if (io) {
    io.emit(event, ...args);
  }
}
