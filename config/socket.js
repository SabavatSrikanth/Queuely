const { Server } = require('socket.io');

let io;

/**
 * Initialize Socket.io server
 * @param {http.Server} server - HTTP server instance
 */
const initSocket = (server) => {
  io = new Server(server, {
    cors: {
      origin: process.env.CLIENT_URL || 'http://localhost:3000',
      methods: ['GET', 'POST'],
      credentials: true,
    },
    pingTimeout: 60000,
    pingInterval: 25000,
  });

  io.on('connection', (socket) => {
    console.log(`[Socket.io] Client connected: ${socket.id}`);

    // ── Join a queue room (public — customers watching a service queue) ──
    socket.on('join:queue_room', ({ serviceId }) => {
      if (!serviceId) return;
      socket.join(`queue:${serviceId}`);
      console.log(`[Socket.io] ${socket.id} joined queue room: queue:${serviceId}`);
    });

    // ── Join a personal ticket room ──
    socket.on('join:ticket_room', ({ ticketId }) => {
      if (!ticketId) return;
      socket.join(`ticket:${ticketId}`);
    });

    // ── Join a business room (staff/owner) ──
    socket.on('join:business_room', ({ businessId }) => {
      if (!businessId) return;
      socket.join(`business:${businessId}`);
    });

    // ── Join personal user room (for in-app notifications) ──
    socket.on('join:user_room', ({ userId }) => {
      if (!userId) return;
      socket.join(`user:${userId}`);
    });

    // ── Leave a queue room ──
    socket.on('leave:queue_room', ({ serviceId }) => {
      if (!serviceId) return;
      socket.leave(`queue:${serviceId}`);
    });

    // ── Heartbeat ──
    socket.on('ping', () => socket.emit('pong'));

    socket.on('disconnect', (reason) => {
      console.log(`[Socket.io] Client disconnected: ${socket.id} (${reason})`);
    });
  });

  console.log('[Socket.io] Initialized');
  return io;
};

/**
 * Get the Socket.io instance (call after initSocket)
 */
const getIO = () => {
  if (!io) throw new Error('Socket.io not initialized. Call initSocket() first.');
  return io;
};

// ── Emit Helpers ──────────────────────────────────────────────────────────────

/** Broadcast live queue update to all watchers of a service */
const emitQueueUpdate = (serviceId, data) => {
  getIO().to(`queue:${serviceId}`).emit('queue:live_update', data);
};

/** Notify a specific ticket's status change */
const emitTicketUpdate = (ticketId, event, data) => {
  getIO().to(`ticket:${ticketId}`).emit(event, data);
};

/** Notify all staff in a business room */
const emitBusinessEvent = (businessId, event, data) => {
  getIO().to(`business:${businessId}`).emit(event, data);
};

/** Send in-app notification to a specific user */
const emitUserNotification = (userId, notification) => {
  getIO().to(`user:${userId}`).emit('notification:new', notification);
};

/** Update unread notification badge for a user */
const emitNotificationCount = (userId, count) => {
  getIO().to(`user:${userId}`).emit('notification:count', { unread: count });
};

module.exports = {
  initSocket,
  getIO,
  emitQueueUpdate,
  emitTicketUpdate,
  emitBusinessEvent,
  emitUserNotification,
  emitNotificationCount,
};
