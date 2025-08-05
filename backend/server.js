require('dotenv').config();

const express = require('express');
const connectDB = require('./config/db');
const path = require('path');
const userRoutes = require('./routes/userRoutes');
const chatRoutes = require('./routes/chatRoutes');
const messageRoutes = require('./routes/messageRoutes');
const { notFound, errorHandler } = require('./middleware/errorMiddleware');

// Load environment variables with fallbacks
const PORT = process.env.PORT || 5000;
const NODE_ENV = process.env.NODE_ENV || 'development';
const MONGO_URI = process.env.MONGO_URI;

if (!MONGO_URI) {
  console.error('Error: MONGO_URI is not defined in environment variables.');
  process.exit(1);
}

// Connect to MongoDB
connectDB(MONGO_URI);

const app = express();
app.use(express.json()); // parse JSON bodies

// API routes
app.use('/api/user', userRoutes);
app.use('/api/chat', chatRoutes);
app.use('/api/message', messageRoutes);

// Serve frontend in production
const rootDir = path.resolve();
if (NODE_ENV === 'production') {
  app.use(express.static(path.join(rootDir, 'frontend', 'build')));
  app.get('*', (req, res) =>
    res.sendFile(path.join(rootDir, 'frontend', 'build', 'index.html'))
  );
} else {
  app.get('/', (req, res) => res.send('API is running..'));
}

// Error handling middleware
app.use(notFound);
app.use(errorHandler);

// Start server
const server = app.listen(PORT, () => {
  console.log(`Server running in ${NODE_ENV} mode on port ${PORT}`);
});

// Socket.IO setup
const io = require('socket.io')(server, {
  pingTimeout: 60000,
  cors: { origin: 'http://localhost:3000' },
});

io.on('connection', (socket) => {
  console.log('Connected to socket.io');

  socket.on('setup', (userData) => {
    socket.join(userData._id);
    socket.emit('connected');
  });

  socket.on('join chat', (room) => {
    socket.join(room);
    console.log('User Joined Room:', room);
  });

  socket.on('typing', (room) => socket.in(room).emit('typing'));
  socket.on('stop typing', (room) => socket.in(room).emit('stop typing'));

  socket.on('new message', (newMessageReceived) => {
    const chat = newMessageReceived.chat;
    if (!chat.users) return console.log('chat.users not defined');

    chat.users.forEach((user) => {
      if (user._id === newMessageReceived.sender._id) return;
      socket.in(user._id).emit('message received', newMessageReceived);
    });
  });

  socket.on('disconnect', () => {
    console.log('USER DISCONNECTED');
  });
});
