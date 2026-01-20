const jwt = require("jsonwebtoken");
const dotenv = require("dotenv");
const UserModel = require("../models/usermodel");
dotenv.config();

exports.registerUser = async (req, res) => {
    try {
        const { username, password } = req.body;
        if (!username || !password) return res.status(400).json({ error: "Username and password required" });

        const existing = await UserModel.findOne({ username });
        if (existing) return res.status(400).json({ error: "Username already exists" });

        const newUser = await UserModel.create({ username, password });

        const token = jwt.sign({ username: newUser.username, id: newUser._id }, process.env.ACCESS_SECRET_KEY, { expiresIn: "1h" });

        return res.status(201).json({ message: "Registration successful", token, username: newUser.username });
    } catch (err) {
        console.log(err);
        res.status(500).json({ error: "Registration failed" });
    }
};

exports.loginUser = async (req, res) => {
    try {
        const { username, password } = req.body;
        if (!username || !password) return res.status(400).json({ error: "Username and password required" });

        const user = await UserModel.findOne({ username });
        if (!user) return res.status(404).json({ error: "User not found" });

        if (user.password !== password) return res.status(401).json({ error: "Invalid password" });

        const token = jwt.sign({ username: user.username, id: user._id }, process.env.ACCESS_SECRET_KEY, { expiresIn: "1h" });

        res.status(200).json({ message: "Login successful", token, username: user.username });
    } catch (err) {
        console.log(err);
        res.status(500).json({ error: "Login failed" });
    }
};
