import express from "express";
import http from "http";
import { Server } from "socket.io";
import cors from "cors";
import dotenv from "dotenv";
import helmet from "helmet";
import morgan from "morgan";
import { connectDB } from "./db";
import { handleRoomEvents, rooms } from "./socket/handlers/roomHandler";
import { handleDrawEvents } from "./socket/handlers/drawHandler";
import { handleGameEvents } from "./socket/handlers/gameHandler";

dotenv.config();
connectDB();

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
  cors: {
    origin: "*", 
    methods: ["GET", "POST"],
  },
});

const PORT = process.env.PORT || 5000;

// Middleware
app.use(cors());
app.use(helmet());
app.use(morgan("dev"));
app.use(express.json());

// Basic Route
app.get("/", (req, res) => {
  res.send("DrawCharades API is running...");
});

// Socket.IO Connection
io.on("connection", (socket) => {
  console.log(`User connected: ${socket.id}`);

  // Register Handlers
  handleRoomEvents(io, socket);
  handleDrawEvents(io, socket);
  handleGameEvents(io, socket, rooms);

  socket.on("disconnect", () => {
    console.log(`User disconnected: ${socket.id}`);
  });
});

server.listen(PORT, () => {
  console.log(`Server is running on port ${PORT}`);
});
