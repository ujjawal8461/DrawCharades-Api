import { Server, Socket } from "socket.io";
import { getRandomMovies } from "../../utils/movies";

interface GameState {
  currentDrawerId: string | null;
  guessingTeam: "A" | "B" | null;
  currentMovie: string | null;
  gamePhase: "LOBBY" | "SELECTING" | "DRAWING" | "ROUND_END";
  timer: number;
  votes: Record<string, string[]>; // movie -> [playerIds]
  options: string[];
}

const gameStates: Record<string, GameState> = {};
const timers: Record<string, NodeJS.Timeout> = {};

export const handleGameEvents = (io: Server, socket: Socket, rooms: any) => {
  
  const startTimer = (roomCode: string, duration: number, onTick: (t: number) => void, onEnd: () => void) => {
    if (timers[roomCode]) clearInterval(timers[roomCode]);
    let remaining = duration;
    
    timers[roomCode] = setInterval(() => {
      remaining--;
      onTick(remaining);
      if (remaining <= 0) {
        clearInterval(timers[roomCode]);
        onEnd();
      }
    }, 1000);
  };

  // Start Game
  socket.on("start_game", (roomCode: string) => {
    const room = rooms[roomCode];
    if (!room) return;

    // Pick Team A to draw first
    const guessingTeam = "A";
    const drawer = room.players.find((p: any) => p.team === guessingTeam);
    
    const options = getRandomMovies(4);
    gameStates[roomCode] = {
      currentDrawerId: drawer?.id || null,
      guessingTeam,
      currentMovie: null,
      gamePhase: "SELECTING",
      timer: 10,
      votes: {},
      options
    };

    io.to(roomCode).emit("game_started", {
      phase: "SELECTING",
      options,
      drawerId: drawer?.id,
      guessingTeam,
      timer: 10
    });

    // Start 10s voting timer
    startTimer(roomCode, 10, 
      (t) => io.to(roomCode).emit("timer_update", t),
      () => {
        // Voting ended - pick winner
        const state = gameStates[roomCode];
        if (state.gamePhase !== "SELECTING") return;

        let winner = state.options[0];
        let maxVotes = -1;
        state.options.forEach((opt: string) => {
          const vCount = (state.votes[opt] || []).length;
          if (vCount > maxVotes) {
            maxVotes = vCount;
            winner = opt;
          }
        });

        // Start Drawing Phase
        state.currentMovie = winner;
        state.gamePhase = "DRAWING";
        const drawDuration = room.settings?.timerDuration || 60;
        state.timer = drawDuration;

        io.to(roomCode).emit("round_started", {
          movie: winner,
          timer: drawDuration
        });

        startTimer(roomCode, drawDuration,
          (t) => io.to(roomCode).emit("timer_update", t),
          () => {
             io.to(roomCode).emit("timer_end");
             state.gamePhase = "ROUND_END";
          }
        );
      }
    );
  });

  // Vote for Movie
  socket.on("vote_movie", ({ roomCode, movie }: { roomCode: string; movie: string }) => {
    const state = gameStates[roomCode];
    if (!state || state.gamePhase !== "SELECTING") return;

    // Remove old vote
    Object.keys(state.votes).forEach((opt: string) => {
      state.votes[opt] = (state.votes[opt] || []).filter((id: string) => id !== socket.id);
    });

    // Add new vote
    if (!state.votes[movie]) state.votes[movie] = [];
    state.votes[movie].push(socket.id);

    io.to(roomCode).emit("votes_updated", state.votes);
  });

  // Guess Logic
  socket.on("submit_guess", ({ roomCode, playerName, message }: { roomCode: string; playerName: string; message: string }) => {
    const state = gameStates[roomCode];
    const room = rooms[roomCode];
    if (!state || state.gamePhase !== "DRAWING") return;

    const player = room.players.find((p: any) => p.id === socket.id);
    
    // Only guessing team can chat
    if (player.team !== state.guessingTeam || player.id === state.currentDrawerId) {
       return; // Block chat
    }

    const isCorrect = state.currentMovie?.toLowerCase() === message.trim().toLowerCase();

    if (isCorrect) {
      clearInterval(timers[roomCode]);
      io.to(roomCode).emit("correct_guess", { playerName, movie: state.currentMovie });
      state.gamePhase = "ROUND_END";
    } else {
      io.to(roomCode).emit("new_message", { playerName, message, isSystem: false });
    }
  });
};
