const mongoose = require('mongoose');

const MONGODB_URI = "mongodb+srv://jangidkapilyashu_db_user:nxvoAAKtIAtmEjki@cluster0.sykfk1a.mongodb.net/fb?retryWrites=true&w=majority&appName=Cluster0";

async function run() {
  try {
    await mongoose.connect(MONGODB_URI);
    const db = mongoose.connection.db;
    const usersCol = db.collection('users');
    const roomsCol = db.collection('rooms');

    const searchUser = await usersCol.findOne({
      $or: [
        { mobile: { $regex: '9079758684' } },
        { phone: { $regex: '9079758684' } }
      ]
    });

    console.log("Found user for 9079758684:", searchUser ? { id: searchUser._id, name: searchUser.name, mobile: searchUser.mobile } : "Not found");

    let roomsToUpdate = [];
    if (searchUser) {
      roomsToUpdate = await roomsCol.find({ hostId: searchUser._id }).toArray();
    } else {
      roomsToUpdate = await roomsCol.find({}).sort({ createdAt: -1 }).limit(5).toArray();
    }

    const dummyProfiles = [
      { name: "Anya", avatar: "https://images.unsplash.com/photo-1494790108377-be9c29b29330?w=150" },
      { name: "Rahul", avatar: "https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?w=150" },
      { name: "Priya", avatar: "https://images.unsplash.com/photo-1438761681033-6461ffad8d80?w=150" },
      { name: "Aarav", avatar: "https://images.unsplash.com/photo-1500648767791-00dcc994a43e?w=150" },
      { name: "Neha", avatar: "https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=150" },
      { name: "Vikram", avatar: "https://images.unsplash.com/photo-1522075469751-3a6694fb2f61?w=150" }
    ];

    const dummyUsers = [];
    for (let i = 0; i < dummyProfiles.length; i++) {
      const p = dummyProfiles[i];
      let userDoc = await usersCol.findOne({ name: p.name });
      if (!userDoc) {
        const dummyNum = 919800000000 + i;
        const ins = await usersCol.insertOne({
          name: p.name,
          mobile: `${dummyNum}`,
          profileImageUrl: { url: p.avatar },
          coins: 50000,
          createdAt: new Date(),
          updatedAt: new Date()
        });
        userDoc = await usersCol.findOne({ _id: ins.insertedId });
      }
      dummyUsers.push(userDoc);
    }

    for (const rm of roomsToUpdate) {
      const seats = [];
      for (let i = 0; i < 8; i++) {
        if (i < dummyUsers.length) {
          const dUser = dummyUsers[i];
          const userPayload = {
            user: {
              id: dUser._id.toString(),
              name: dUser.name,
              userId: dUser.userId || 10000 + i,
              profileImageUrl: dUser.profileImageUrl || { url: dummyProfiles[i].avatar }
            }
          };
          seats.push({
            seatIndex: i,
            status: 'occupied',
            userId: userPayload,
            user: userPayload,
            isMuted: false,
            muted: false
          });
        } else {
          seats.push({ seatIndex: i, status: 'available' });
        }
      }

      await roomsCol.updateOne(
        { _id: rm._id },
        {
          $set: {
            seats: seats,
            status: 'live',
            maxSeats: 8,
            updatedAt: new Date()
          }
        }
      );
      console.log(`Updated room ${rm.channelName} (${rm.roomId}) with ${dummyUsers.length} seat occupants in both userId & user properties.`);
    }

    console.log("All party rooms updated with dual-property seat occupants!");
  } catch (err) {
    console.error(err);
  } finally {
    process.exit(0);
  }
}

run();
