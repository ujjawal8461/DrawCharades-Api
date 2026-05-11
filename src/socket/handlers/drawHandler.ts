import { Server, Socket } from "socket.io";

export const handleDrawEvents = (io: Server, socket: Socket) => {
  // Listen for drawing strokes
  socket.on("draw", ({ roomCode, stroke }) => {
    // Broadcast to everyone else in the room
    socket.to(roomCode).emit("draw", stroke);
  });

  // Listen for canvas clearing
  socket.on("clear_canvas", (roomCode) => {
    io.to(roomCode).emit("clear_canvas");
  });
};
