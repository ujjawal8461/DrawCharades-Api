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
  drawerIndex: Record<"A" | "B", number>; // Keep track of whose turn it is in each team
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

  const startSelectingPhase = (roomCode: string) => {
    const room = rooms[roomCode];
    const state = gameStates[roomCode];
    if (!room || !state) return;

    // Switch guessing team
    state.guessingTeam = state.guessingTeam === "A" ? "B" : "A";
    
    // Pick next drawer from the guessing team
    const teamPlayers = room.players.filter((p: any) => p.team === state.guessingTeam);
    if (teamPlayers.length > 0) {
      state.drawerIndex[state.guessingTeam] = (state.drawerIndex[state.guessingTeam] + 1) % teamPlayers.length;
      state.currentDrawerId = teamPlayers[state.drawerIndex[state.guessingTeam]].id;
    }

    const options = getRandomMovies(4);
    state.options = options;
    state.votes = {};
    state.gamePhase = "SELECTING";
    state.timer = 10;
    state.currentMovie = null;

    io.to(roomCode).emit("game_started", {
      phase: "SELECTING",
      options,
      drawerId: state.currentDrawerId,
      guessingTeam: state.guessingTeam,
      timer: 10
    });

    startTimer(roomCode, 10, 
      (t) => io.to(roomCode).emit("timer_update", t),
      () => {
        // Voting ended - pick winner
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

        startDrawingPhase(roomCode, winner);
      }
    );
  };

  const startDrawingPhase = (roomCode: string, movie: string) => {
    const state = gameStates[roomCode];
    const room = rooms[roomCode];
    if (!state || !room) return;

    state.currentMovie = movie;
    state.gamePhase = "DRAWING";
    const drawDuration = room.settings?.timerDuration || 60;
    state.timer = drawDuration;

    io.to(roomCode).emit("round_started", {
      movie,
      timer: drawDuration
    });

    startTimer(roomCode, drawDuration,
      (t) => io.to(roomCode).emit("timer_update", t),
      () => {
        endRound(roomCode, null); // Time up
      }
    );
  };

  const endRound = (roomCode: string, winnerName: string | null) => {
    const state = gameStates[roomCode];
    const room = rooms[roomCode];
    if (!state || !room) return;

    clearInterval(timers[roomCode]);
    state.gamePhase = "ROUND_END";

    if (winnerName) {
      // Award points
      room.scores[state.guessingTeam!] += 10;
      io.to(roomCode).emit("correct_guess", { playerName: winnerName, movie: state.currentMovie });
    } else {
      io.to(roomCode).emit("round_time_up", { movie: state.currentMovie });
    }

    io.to(roomCode).emit("scores_updated", room.scores);

    // Wait 5 seconds then start next round
    setTimeout(() => {
      startSelectingPhase(roomCode);
    }, 5000);
  };

  // Start Game (Initial)
  socket.on("start_game", (roomCode: string) => {
    const room = rooms[roomCode];
    if (!room) return;

    room.scores = { A: 0, B: 0 };
    
    gameStates[roomCode] = {
      currentDrawerId: null,
      guessingTeam: "B", // Will switch to A in startSelectingPhase
      currentMovie: null,
      gamePhase: "LOBBY",
      timer: 0,
      votes: {},
      options: [],
      drawerIndex: { A: -1, B: -1 }
    };

    startSelectingPhase(roomCode);
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
    if (!player) return;
    
    // Only guessing team can chat (and not the drawer)
    if (player.team !== state.guessingTeam || player.id === state.currentDrawerId) {
       // Optional: allow team chat that isn't guesses? 
       // For now, let's just allow drawer to see but not chat.
       return; 
    }

    const isCorrect = state.currentMovie?.toLowerCase() === message.trim().toLowerCase();

    if (isCorrect) {
      endRound(roomCode, playerName);
    } else {
      io.to(roomCode).emit("new_message", { playerName, message, isSystem: false });
    }
  });
};
