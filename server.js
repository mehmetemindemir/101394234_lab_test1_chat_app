require("dotenv").config();
const express = require("express");
const http = require("http");
const cors = require("cors");
const { Server } = require("socket.io");
const path = require("path");

const connectDB = require("./config/db");
const authRoutes = require("./routes/auth");
const chatSocket = require("./routes/chatSocket");

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
  cors: {
    origin: "*",
  },
});

connectDB();

app.use(cors());
app.use(express.json());
app.use("/view", express.static(path.join(__dirname, "view")));

app.get("/view", (req, res) => {
  res.redirect("/view/login.html");
});
app.get("/view/", (req, res) => {
  res.redirect("/view/login.html");
});

app.use("/api/auth", authRoutes);

chatSocket(io);

const PORT = process.env.PORT || 3000;

server.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
