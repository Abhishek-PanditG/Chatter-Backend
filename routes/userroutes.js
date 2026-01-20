const express = require("express");
const router = express.Router();
const UserController = require("../controllers/usercontrollers");

// Register
router.post("/register", UserController.registerUser);

// Login
router.post("/login", UserController.loginUser);

module.exports = router;
