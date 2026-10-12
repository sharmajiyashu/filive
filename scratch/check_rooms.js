const mongoose = require('mongoose');

const MONGODB_URI = "mongodb+srv://jangidkapilyashu_db_user:nxvoAAKtIAtmEjki@cluster0.sykfk1a.mongodb.net/fb?retryWrites=true&w=majority&appName=Cluster0";

async function run() {
  try {
    await mongoose.connect(MONGODB_URI);
    const db = mongoose.connection.db;
    const usersCol = db.collection('users');
    const roomsCol = db.collection('rooms');

    const allUsers = await usersCol.find({}).limit(20).toArray();
    console.log("Registered Users count:", allUsers.length);
    console.log("Sample Users:", allUsers.map(u => ({ id: u._id, phone: u.phone, mobile: u.mobile, name: u.name, userId: u.userId })));

    const activeRooms = await roomsCol.find({ status: 'live' }).toArray();
    console.log("Active Live Rooms:", activeRooms.map(r => ({ id: r._id, channelName: r.channelName, roomId: r.roomId, roomType: r.roomType, seatsCount: (r.seats || []).length })));

  } catch (err) {
    console.error(err);
  } finally {
    process.exit(0);
  }
}

run();
