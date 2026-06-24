import { mcController } from '../services/mcControl.js';

export function setupSocketHandlers(io) {
  mcController.startPolling();

  io.on('connection', (socket) => {
    console.log(`[Socket] Client connected: ${socket.id}`);

    socket.on('subscribe:server', async () => {
      const status = await mcController.getStatus();
      socket.emit('server:status', status);

      const logs = await mcController.getLogs(50);
      socket.emit('server:logs:initial', logs);
    });

    socket.on('server:start', async () => {
      try {
        await mcController.start();
        socket.emit('server:action:result', { success: true, action: 'start' });
      } catch (error) {
        socket.emit('server:action:result', { success: false, action: 'start', error: error.message });
      }
    });

    socket.on('server:stop', async () => {
      try {
        await mcController.stop();
        socket.emit('server:action:result', { success: true, action: 'stop' });
      } catch (error) {
        socket.emit('server:action:result', { success: false, action: 'stop', error: error.message });
      }
    });

    socket.on('server:restart', async () => {
      try {
        await mcController.restart();
        socket.emit('server:action:result', { success: true, action: 'restart' });
      } catch (error) {
        socket.emit('server:action:result', { success: false, action: 'restart', error: error.message });
      }
    });

    const metricsHandler = (metrics) => socket.emit('server:metrics', metrics);
    const statusHandler = (status) => socket.emit('server:status', status);

    mcController.on('metrics', metricsHandler);
    mcController.on('status', statusHandler);

    const logInterval = setInterval(async () => {
      const logs = await mcController.getLogs(5);
      if (logs.length > 0) {
        socket.emit('server:logs', logs);
      }
    }, 2000);

    socket.on('disconnect', () => {
      console.log(`[Socket] Client disconnected: ${socket.id}`);
      clearInterval(logInterval);
      mcController.removeListener('metrics', metricsHandler);
      mcController.removeListener('status', statusHandler);
    });
  });
}
