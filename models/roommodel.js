const mongoose = require("mongoose");

const roomSchema = new mongoose.Schema({
    roomId: { type: String, required: true, unique: true },
    admin: { type: String, required: true },
    participants: { type: [String], default: [] },
    pending: { type: [{ username: String, socketId: String }], default: [] },
    messages: { type: [{ sender: String, text: String, timestamp: Number }], default: [] }
});

module.exports = mongoose.model("Room", roomSchema);
