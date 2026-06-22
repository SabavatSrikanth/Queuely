const mongoose = require('mongoose');

const connectDB = async () => {
  let retries = 5;
  while (retries) {
    try {
      const conn = await mongoose.connect(process.env.MONGODB_URI, {
        serverSelectionTimeoutMS: 5000,
        socketTimeoutMS: 45000,
      });
      console.log(`[MongoDB] Connected: ${conn.connection.host}`);

      mongoose.connection.on('error', (err) => {
        console.error('[MongoDB] Connection error:', err);
      });

      mongoose.connection.on('disconnected', () => {
        console.warn('[MongoDB] Disconnected. Attempting reconnect...');
      });

      return;
    } catch (error) {
      retries -= 1;
      console.error(`[MongoDB] Connection failed. Retries left: ${retries}`, error.message);
      if (retries === 0) throw error;
      await new Promise((res) => setTimeout(res, 5000));
    }
  }
};

module.exports = connectDB;
