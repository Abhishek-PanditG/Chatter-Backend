const http = require("http");
const express = require("express");
const mongoose = require("mongoose");
const { Server } = require("socket.io");
const jwt = require("jsonwebtoken");
const dotenv = require("dotenv");
const UserRoutes = require("./routes/userroutes");
const RoomController = require("./controllers/roomcontrollers");

dotenv.config();
const app = express();
const server = http.createServer(app);

// MongoDB connection
mongoose.connect(process.env.MONGO_URI)
    .then(() => console.log("Database connected"))
    .catch(err => console.log("Database connection failed:", err));

// Middlewares
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Routes for login/register
app.use("/api", UserRoutes);

// Route for waking up the Server
app.get("/health", (_, res) => res.send("OK"));

// Socket.IO setup
const io = new Server(server, {
    cors: {
        origin: "*",
        methods: ["GET", "POST"],
    }
});

// Socket authentication middleware
io.use((socket, next) => {
    try {
        const token = socket.handshake.auth?.token; // Flutter sends JWT here
        console.log("Socket auth attempt - Token present:", !!token);
        
        if (!token) {
            console.log("Socket auth failed: No token provided");
            return next(new Error("Unauthorized"));
        }

        const decoded = jwt.verify(token, process.env.ACCESS_SECRET_KEY);
        socket.username = decoded.username;
        console.log("Socket authenticated for user:", socket.username);
        next();
    } catch (err) {
        console.log("Socket auth error:", err.message);
        next(new Error("Unauthorized"));
    }
});

// Handle Socket.IO events
io.on("connection", (socket) => {
    console.log("User connected:", socket.username);
    RoomController(io, socket);
});

// Server listener
const PORT = process.env.PORT || 5000;
server.listen(PORT, () => console.log(`Flutter backend running on port ${PORT}`));

// Handle server errors
server.on('error', (err) => {
    console.error("Server error:", err);
});

// Handle uncaught exceptions
process.on('uncaughtException', (err) => {
    console.error("Uncaught exception:", err);
});
