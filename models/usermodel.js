const mongoose = require("mongoose");

const userSchema = new mongoose.Schema({
    username: { type: String, required: true, unique: true },
    password: { type: String, required: true } // For simplicity; ideally hash this
});

module.exports = mongoose.model("User", userSchema);
