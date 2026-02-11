const GroupMessage = require("../models/GroupMessage");
const PrivateMessage = require("../models/PrivateMessage");

const users = new Map();

const emitRoomUsers = async (io, room) => {
  if (!room) return;
  const sockets = await io.in(room).fetchSockets();
  const names = Array.from(
    new Set(sockets.map((s) => s.username).filter(Boolean)),
  ).sort();
  io.to(room).emit("roomUserList", names);
};

const chatSocket = (io) => {
  io.on("connection", (socket) => {
    console.log("User connected:", socket.id);

    socket.on("registerUser", async (username) => {
      if (!username) return;
      socket.username = username;
      if (!users.has(username)) users.set(username, new Set());
      users.get(username).add(socket.id);
    });

    socket.on("joinRoom", async ({ username, room }) => {
      socket.join(room);
      socket.username = username || socket.username;
      socket.room = room;

      const history = await GroupMessage.find({ room })
        .sort({ date_sent: 1 })
        .limit(50)
        .lean();
      socket.emit("messageHistory", history);

      const privateHistory = await PrivateMessage.find({
        room,
        $or: [{ from_user: socket.username }, { to_user: socket.username }],
      })
        .sort({ date_sent: 1 })
        .limit(100)
        .lean();
      socket.emit("privateHistory", privateHistory);
      emitRoomUsers(io, room);

      io.to(room).emit("message", {
        from: "System",
        text: `${username} joined ${room}`,
      });
    });

    socket.on("leaveRoom", () => {
      socket.leave(socket.room);
      io.to(socket.room).emit("message", {
        from: "System",
        text: `${socket.username} left the room`,
      });
      emitRoomUsers(io, socket.room);
      socket.room = null;
    });
    socket.on("chatMessage", async (msg) => {
      if (!socket.room || !socket.username) return;
      const message = new GroupMessage({
        from_user: socket.username,
        room: socket.room,
        message: msg,
      });

      await message.save();

      io.to(socket.room).emit("message", {
        from: socket.username,
        text: msg,
      });
    });

    socket.on("privateMessage", async ({ to, message }) => {
      if (!socket.room || !socket.username) return;
      const privateMsg = new PrivateMessage({
        from_user: socket.username,
        to_user: to,
        room: socket.room,
        message,
      });

      await privateMsg.save();

      const roomSockets = await io.in(socket.room).fetchSockets();
      roomSockets.forEach((s) => {
        if (s.username === to) {
          io.to(s.id).emit("privateMessage", {
            from: socket.username,
            to,
            room: socket.room,
            message,
          });
        }
      });
      socket.emit("privateMessage", {
        from: socket.username,
        to,
        room: socket.room,
        message,
      });
    });

    socket.on("typing", () => {
      socket.to(socket.room).emit("typing", {
        user: socket.username,
      });
    });

    socket.on("disconnect", () => {
      console.log("User disconnected");
      if (socket.room) {
        emitRoomUsers(io, socket.room);
      }
      if (socket.username && users.has(socket.username)) {
        const set = users.get(socket.username);
        set.delete(socket.id);
        if (set.size === 0) users.delete(socket.username);
      }
    });
  });
};

module.exports = chatSocket;
