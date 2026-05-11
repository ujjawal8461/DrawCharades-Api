import { Server, Socket } from "socket.io";

interface Player {
  id: string;
  name: string;
  team: "A" | "B" | null;
}

interface Room {
  code: string;
  players: Player[];
  hostId: string;
}

export const rooms: Record<string, any> = {};

export const handleRoomEvents = (io: Server, socket: Socket) => {
  // Create Room
  socket.on("create_room", ({ playerName, timerDuration }: { playerName: string; timerDuration: number }) => {
    const roomCode = Math.random().toString(36).substring(2, 8).toUpperCase();
    
    rooms[roomCode] = {
      code: roomCode,
      players: [{ id: socket.id, name: playerName, team: "A" }],
      hostId: socket.id,
      settings: { timerDuration: timerDuration || 60 }
    };

    socket.join(roomCode);
    socket.emit("room_created", rooms[roomCode]);
    console.log(`Room created: ${roomCode} by ${playerName}`);
  });

  // Join Room
  socket.on("join_room", ({ roomCode, playerName }: { roomCode: string; playerName: string }) => {
    const code = roomCode.toUpperCase();
    const room = rooms[code];

    if (!room) {
      socket.emit("error", "Room not found");
      return;
    }

    if (room.players.length >= 10) {
      socket.emit("error", "Room is full");
      return;
    }

    // Add player to the team with fewer players
    const teamA = room.players.filter((p: Player) => p.team === "A").length;
    const teamB = room.players.filter((p: Player) => p.team === "B").length;
    const assignedTeam: "A" | "B" = teamA <= teamB ? "A" : "B";

    const newPlayer: Player = { id: socket.id, name: playerName, team: assignedTeam };
    room.players.push(newPlayer);

    socket.join(code);
    io.to(code).emit("room_updated", room);
    console.log(`Player ${playerName} joined room ${code}`);
  });

  // Switch Team
  socket.on("switch_team", (roomCode: string) => {
    const room = rooms[roomCode.toUpperCase()];
    if (!room) return;

    const player = room.players.find((p: Player) => p.id === socket.id);
    if (player) {
      player.team = player.team === "A" ? "B" : "A";
      io.to(room.code).emit("room_updated", room);
    }
  });

  // Disconnect Handling
  socket.on("disconnecting", () => {
    for (const roomCode of socket.rooms) {
      if (rooms[roomCode]) {
        rooms[roomCode].players = rooms[roomCode].players.filter((p: Player) => p.id !== socket.id);
        if (rooms[roomCode].players.length === 0) {
          delete rooms[roomCode];
        } else {
          io.to(roomCode).emit("room_updated", rooms[roomCode]);
        }
      }
    }
  });
};
