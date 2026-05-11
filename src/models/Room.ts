import mongoose from "mongoose";

const roomSchema = new mongoose.Schema({
  roomCode: { type: String, required: true, unique: true },
  scores: {
    teamA: { type: Number, default: 0 },
    teamB: { type: Number, default: 0 },
  },
  history: [
    {
      movie: String,
      winner: String,
      points: Number,
      timestamp: { type: Date, default: Date.now }
    }
  ],
  createdAt: { type: Date, default: Date.now, expires: 86400 } // Auto-delete after 24h
});

export const RoomModel = mongoose.model("Room", roomSchema);
