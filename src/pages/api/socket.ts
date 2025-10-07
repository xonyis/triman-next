import type { NextApiRequest } from "next";
import type { Server as HTTPServer } from "http";
import type { Socket } from "net";
import type { Server as IOServer, Socket as IOSocket } from "socket.io";

// Reuse the same Socket.IO server instance across hot reloads in dev
interface SocketServer extends HTTPServer {
  io?: IOServer;
}

type NextApiResponseWithSocket = {
  socket: Socket & { server: SocketServer };
  end: (msg?: any) => void;
};

export default function handler(_req: NextApiRequest, res: NextApiResponseWithSocket) {
  const httpServer = res.socket.server as SocketServer;
  if (!httpServer.io) {
    const { Server } = require("socket.io");
    const io: IOServer = new Server(httpServer, {
      path: "/api/socketio",
      cors: { origin: "*" },
    });

    // Room-aware broadcast impl
    io.on("connection", (socket: IOSocket) => {
      let currentRoom: string | null = null;

      socket.on("room:join", (roomId: string) => {
        if (currentRoom) socket.leave(currentRoom);
        currentRoom = roomId;
        socket.join(roomId);
        // Notify others in the room that someone joined (optional)
        socket.to(roomId).emit("room:joined", { id: socket.id });
      });

      const relayToRoom = (event: string) => {
        socket.on(event, (payload: any) => {
          if (currentRoom) {
            socket.to(currentRoom).emit(event, payload);
          } else {
            // fallback: broadcast to all except sender if not in a room
            socket.broadcast.emit(event, payload);
          }
        });
      };

      [
        "player:add",
        "player:remove",
        "player:update",
        "game:start",
        "game:reset",
        "dice:roll",
      ].forEach(relayToRoom);

      // State sync: request -> others in room; update -> target socket only
      socket.on("state:request", (payload: { requesterId: string }) => {
        if (currentRoom) {
          socket.to(currentRoom).emit("state:request", payload);
        }
      });

      socket.on(
        "state:update",
        (payload: { to: string; state: any }) => {
          const { to, state } = payload || {};
          if (to) {
            socket.to(to).emit("state:update", { state });
          }
        }
      );
    });

    httpServer.io = io;
  }
  res.end("Socket.IO server ready");
}

export const config = {
  api: {
    bodyParser: false,
  },
};

