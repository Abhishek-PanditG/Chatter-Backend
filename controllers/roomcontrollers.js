const RoomModel = require("../models/roommodel");

module.exports = (io, socket) => {
    // Create a new room
    socket.on("create_room", async () => {
        try {
            const roomId = Math.random().toString(36).substring(2, 10);
            const newRoom = await RoomModel.create({
                roomId,
                admin: socket.username,
                participants: [socket.username]
            });

            socket.join(roomId);
            socket.emit("room_created", { roomId });
        } catch (err) {
            console.log(err);
            socket.emit("error_message", "Failed to create room");
        }
    });

    // Join a room
    socket.on("join_room", async ({ roomId }) => {
        try {
            console.log(`User ${socket.username} attempting to join room ${roomId}`);
            
            const room = await RoomModel.findOne({ roomId });
            if (!room) {
                console.log(`Room ${roomId} not found`);
                return socket.emit("error_message", "Room does not exist");
            }

            console.log(`Room found:`, room);

            // Admin or approved participant
            if (room.admin === socket.username || room.participants.includes(socket.username)) {
                socket.join(roomId);
                console.log(`${socket.username} joined room ${roomId} as participant`);
                io.to(roomId).emit("participants_update", { users: room.participants, admin: room.admin });
                return;
            }

            // Otherwise → send join request to admin
            const sockets = await io.in(roomId).fetchSockets();
            const adminSocket = sockets.find(s => s.username === room.admin);
            console.log(`Sending join request from ${socket.username} to admin ${room.admin}`);
            
            if (adminSocket) {
                adminSocket.emit("join_request", { username: socket.username, socketId: socket.id });
            } else {
                console.log(`Admin ${room.admin} not connected`);
                socket.emit("error_message", "Admin is not available");
            }
        } catch (err) {
            console.log("Join room error:", err);
            socket.emit("error_message", "Failed to join room");
        }
    });

    // Admin approves/denies
    socket.on("admin_decision", async ({ roomId, targetUsername, action }) => {
        try {
            const room = await RoomModel.findOne({ roomId });
            if (!room) return;

            if (action === "accept") {
                if (!room.participants.includes(targetUsername)) room.participants.push(targetUsername);
                await room.save();
                
                // Find target socket from all connected sockets (not just in room)
                const allSockets = await io.fetchSockets();
                const targetSocket = allSockets.find(s => s.username === targetUsername);
                
                console.log(`Admin ${socket.username} accepted ${targetUsername} to room ${roomId}`);
                
                if (targetSocket) {
                    console.log(`Found target socket, joining them to room`);
                    targetSocket.join(roomId);
                    // Send specific approval message to the waiting user
                    targetSocket.emit("join_approved", { roomId, users: room.participants, admin: room.admin });
                    // Broadcast updated participants to all in room
                    io.to(roomId).emit("participants_update", { users: room.participants, admin: room.admin });
                } else {
                    console.log(`Target socket for ${targetUsername} not found`);
                }
            } else if (action === "deny") {
                // Find target socket from all connected sockets
                const allSockets = await io.fetchSockets();
                const targetSocket = allSockets.find(s => s.username === targetUsername);
                
                console.log(`Admin ${socket.username} denied ${targetUsername} from room ${roomId}`);
                
                if (targetSocket) {
                    targetSocket.emit("join_denied", "Your join request was denied");
                } else {
                    console.log(`Target socket for ${targetUsername} not found`);
                }
            }
        } catch (err) {
            console.log(err);
        }
    });

    // Send messages
    socket.on("send_message", async ({ roomId, text }) => {
        if (!text || !roomId) return;
        io.to(roomId).emit("new_message", { sender: socket.username, text });
    });

    // Leave room
    socket.on("leave_room", async ({ roomId }) => {
        try {
            socket.leave(roomId);
            io.to(roomId).emit("participants_update", { users: [], admin: null });
        } catch (err) {
            console.log(err);
        }
    });

    socket.on("disconnect", () => {
        console.log("User disconnected:", socket.username);
    });
};
