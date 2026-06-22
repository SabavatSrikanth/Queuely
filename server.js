require('dotenv').config();
const http = require('http');
const app = require('./app');
const connectDB = require('./config/db');
const { initSocket } = require('./config/socket');

const PORT = process.env.PORT || 3000;

// ─── Start Server ─────────────────────────────────────────────────────────────
const startServer = async () => {
  try {
    // Connect to MongoDB
    await connectDB();

    // Create HTTP server
    const server = http.createServer(app);

    // Initialize Socket.io
    initSocket(server);

    // Listen
    server.listen(PORT, () => {
      console.log(`\n╔══════════════════════════════════════════╗`);
      console.log(`║         QUEUELY v2.0 IS RUNNING          ║`);
      console.log(`╠══════════════════════════════════════════╣`);
      console.log(`║  Server  : http://localhost:${PORT}           ║`);
      console.log(`║  ENV     : ${(process.env.NODE_ENV || 'development').padEnd(30)} ║`);
      console.log(`╚══════════════════════════════════════════╝\n`);
    });

    // ─── Graceful Shutdown ──────────────────────────────────────────────────
    const shutdown = (signal) => {
      console.log(`\n[${signal}] Graceful shutdown initiated...`);
      server.close(() => {
        console.log('[Server] HTTP server closed.');
        process.exit(0);
      });
      setTimeout(() => {
        console.error('[Server] Forced shutdown after timeout.');
        process.exit(1);
      }, 10000);
    };

    process.on('SIGTERM', () => shutdown('SIGTERM'));
    process.on('SIGINT', () => shutdown('SIGINT'));

  } catch (error) {
    console.error('[Server] Failed to start:', error.message);
    process.exit(1);
  }
};

// ─── Unhandled Rejections ─────────────────────────────────────────────────────
process.on('unhandledRejection', (reason, promise) => {
  console.error('[UnhandledRejection]', reason);
});

process.on('uncaughtException', (error) => {
  console.error('[UncaughtException]', error);
  process.exit(1);
});

startServer();
