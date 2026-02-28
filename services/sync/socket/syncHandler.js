const jwt = require('jsonwebtoken');

const userSockets = new Map();

const setupSocket = (io) => {

  
  io.use((socket, next) => {
    try {
      const token = socket.handshake.auth?.token
        || socket.handshake.headers?.authorization?.replace('Bearer ', '');

      if (!token)
        return next(new Error('Authentication token required'));

      const decoded = jwt.verify(token, process.env.JWT_SECRET);
      socket.userId  = decoded.userId;
      socket.email   = decoded.email;
      next();
    } catch (err) {
      next(new Error('Invalid or expired token'));
    }
  });

 
  io.on('connection', (socket) => {
    const { userId } = socket;
    console.log(`[sync] User ${userId} connected — socket ${socket.id}`);

    
    if (!userSockets.has(userId)) {
      userSockets.set(userId, new Set());
    }
    userSockets.get(userId).add(socket.id);

    // Join a room named after the userId makes broadcasting easy
    socket.join(`user:${userId}`);

    // Tell the client they're connected
    socket.emit('connected', {
      message:  'Sync service connected',
      socketId: socket.id,
      userId,
    });

    
    socket.on('sync:request', (data) => {
      console.log(`[sync] Sync request from ${userId}:`, data);
      socket.emit('sync:ack', { received: true, timestamp: Date.now() });
    });

   
    socket.on('disconnect', (reason) => {
      console.log(`[sync] User ${userId} disconnected (${reason})`);
      const sockets = userSockets.get(userId);
      if (sockets) {
        sockets.delete(socket.id);
        if (sockets.size === 0) userSockets.delete(userId);
      }
    });
  });
};


const notifyUser = (io, userId, event, payload) => {
  const room = `user:${userId}`;
  io.to(room).emit(event, payload);
  const count = userSockets.get(userId)?.size || 0;
  console.log(`[sync] Notified ${count} device(s) for user ${userId} — event: ${event}`);
};


const getConnectedDevices = (userId) =>
  userSockets.get(userId)?.size || 0;


const getTotalConnections = () => {
  let total = 0;
  userSockets.forEach(sockets => { total += sockets.size; });
  return total;
};

module.exports = { setupSocket, notifyUser, getConnectedDevices, getTotalConnections };