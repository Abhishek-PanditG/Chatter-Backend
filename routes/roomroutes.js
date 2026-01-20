const roomController = require("../controllers/roomcontrollers");

module.exports = (io, socket) => {
    socket.on("create_room", () => roomController.createRoom(io, socket));
    socket.on("join_room", (data) => roomController.joinRoom(io, socket, data));
    socket.on("send_message", (data) => roomController.sendMessage(io, socket, data));
};
