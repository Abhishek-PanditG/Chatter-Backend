const RoomModel = require("../models/roommodel");

module.exports = (io, socket) => {
    // Create a new room
    socket.on("create_room", async () => {
        try {
            const roomId = Math.random().toString(36).substring(2, 10).toUpperCase().replace(/[^A-Z0-9]/g, '');
            const newRoom = await RoomModel.create({
                roomId,
                admin: socket.username,
                participants: [socket.username],
                messages: [{
                    sender: "System",
                    text: `${socket.username} (Admin) created the room`,
                    timestamp: Date.now(),
                    isSystemMessage: true
                }]
            });

            socket.join(roomId);
            // Send room_created with initial data so the creator immediately sees participants
            socket.emit("room_created", { 
                roomId,
                users: newRoom.participants,
                admin: socket.username,
                messages: newRoom.messages
            });
            // Also broadcast to ensure socket listeners are set up
            io.to(roomId).emit("participants_update", { users: newRoom.participants, admin: socket.username });
            io.to(roomId).emit("load_messages", { messages: newRoom.messages });
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
                
                // Send message history and participants to the joining user immediately
                socket.emit("load_messages", { messages: room.messages });
                socket.emit("participants_update", { users: room.participants, admin: room.admin });
                
                // Broadcast updated participants to all in room
                io.to(roomId).emit("participants_update", { users: room.participants, admin: room.admin });
                
                // Send system message about the join (except for creator on initial creation)
                if (room.participants.length > 1 || room.admin !== socket.username) {
                    const joinMessage = {
                        sender: "System",
                        text: `${socket.username} joined the room`,
                        timestamp: Date.now(),
                        isSystemMessage: true
                    };
                    room.messages.push(joinMessage);
                    await room.save();
                    // Only broadcast to others, not to the user who just joined (they already have it in load_messages)
                    socket.to(roomId).emit("new_message", joinMessage);
                }
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
                
                // Add system message for user joining (save to DB only, don't broadcast separately)
                const joinMessage = {
                    sender: "System",
                    text: `${targetUsername} joined the room`,
                    timestamp: Date.now(),
                    isSystemMessage: true
                };
                room.messages.push(joinMessage);
                await room.save();
                
                // Find target socket from all connected sockets (not just in room)
                const allSockets = await io.fetchSockets();
                const targetSocket = allSockets.find(s => s.username === targetUsername);
                
                console.log(`Admin ${socket.username} accepted ${targetUsername} to room ${roomId}`);
                
                if (targetSocket) {
                    console.log(`Found target socket, joining them to room`);
                    targetSocket.join(roomId);
                    // Send message history (which includes the join message they just added)
                    targetSocket.emit("load_messages", { messages: room.messages });
                    // Send specific approval message to the waiting user
                    targetSocket.emit("join_approved", { roomId, users: room.participants, admin: room.admin });
                    // Broadcast updated participants to all in room
                    io.to(roomId).emit("participants_update", { users: room.participants, admin: room.admin });
                    // Broadcast join message to all OTHER users (excluding the newly joined user)
                    socket.to(roomId).emit("new_message", joinMessage);
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
        try {
            const room = await RoomModel.findOne({ roomId });
            if (!room) return;
            
            const message = {
                sender: socket.username,
                text: text,
                timestamp: Date.now()
            };
            
            room.messages.push(message);
            await room.save();
            
            io.to(roomId).emit("new_message", message);
        } catch (err) {
            console.log("Send message error:", err);
        }
    });

    // Leave room
    socket.on("leave_room", async ({ roomId }) => {
        try {
            const room = await RoomModel.findOne({ roomId });
            if (!room) return;
            
            // If admin is leaving, remove everyone from room and delete it
            if (room.admin === socket.username) {
                console.log(`Admin ${socket.username} left room ${roomId}, disposing room`);
                // Notify all users that admin left and room is being closed
                io.to(roomId).emit("room_disposed", { message: "Admin left the room. Room is being closed." });
                // Delete the room from database
                await RoomModel.deleteOne({ roomId });
                // Remove all sockets from the room
                const sockets = await io.in(roomId).fetchSockets();
                sockets.forEach(s => s.leave(roomId));
            } else {
                // Regular participant leaving - add system message
                room.participants = room.participants.filter(p => p !== socket.username);
                
                const leaveMessage = {
                    sender: "System",
                    text: `${socket.username} left the room`,
                    timestamp: Date.now(),
                    isSystemMessage: true
                };
                room.messages.push(leaveMessage);
                await room.save();
                
                socket.leave(roomId);
                io.to(roomId).emit("participants_update", { users: room.participants, admin: room.admin });
                io.to(roomId).emit("new_message", leaveMessage);
            }
        } catch (err) {
            console.log("Leave room error:", err);
        }
    });

    socket.on("disconnect", () => {
        console.log("User disconnected:", socket.username);
    });
};
