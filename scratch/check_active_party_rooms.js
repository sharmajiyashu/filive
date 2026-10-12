const mongoose = require('mongoose');

const MONGODB_URI = "mongodb+srv://jangidkapilyashu_db_user:nxvoAAKtIAtmEjki@cluster0.sykfk1a.mongodb.net/fb?retryWrites=true&w=majority&appName=Cluster0";

async function run() {
  try {
    await mongoose.connect(MONGODB_URI);
    const db = mongoose.connection.db;
    const usersCol = db.collection('users');
    const roomsCol = db.collection('rooms');

    const user = await usersCol.findOne({
      $or: [
        { mobile: { $regex: '9079758684' } },
        { phone: { $regex: '9079758684' } }
      ]
    });

    console.log("User:", user ? { _id: user._id, name: user.name, mobile: user.mobile } : "Not found");

    if (user) {
      const userRooms = await roomsCol.find({ hostId: user._id }).sort({ createdAt: -1 }).toArray();
      console.log(`\nFound ${userRooms.length} rooms for this user:`);
      userRooms.forEach(r => {
        console.log(`- RoomID: ${r.roomId}, Status: ${r.status}, Type: ${r.roomType}, Channel: ${r.channelName}`);
        console.log(`  Seats count: ${(r.seats || []).length}`);
        const occupied = (r.seats || []).filter(s => s && s.user && s.user.user);
        console.log(`  Occupied seats count: ${occupied.length}`);
        occupied.forEach(s => {
          console.log(`    Seat ${s.seatIndex}: ${s.user.user.name} (${s.user.user.id})`);
        });
      });
    }

    console.log("\nALL Active Live Rooms in DB:");
    const allLive = await roomsCol.find({ status: 'live' }).toArray();
    allLive.forEach(r => {
      console.log(`- RoomID: ${r.roomId}, Host: ${r.hostId}, Status: ${r.status}, Type: ${r.roomType}, Channel: ${r.channelName}`);
      const occupied = (r.seats || []).filter(s => s && s.user && s.user.user);
      console.log(`  Occupied seats count: ${occupied.length}`);
    });

  } catch (err) {
    console.error(err);
  } finally {
    process.exit(0);
  }
}

run();
