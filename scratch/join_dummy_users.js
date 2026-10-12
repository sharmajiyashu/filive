const mongoose = require('mongoose');

const MONGODB_URI = "mongodb+srv://jangidkapilyashu_db_user:nxvoAAKtIAtmEjki@cluster0.sykfk1a.mongodb.net/fb?retryWrites=true&w=majority&appName=Cluster0";

async function run() {
  try {
    await mongoose.connect(MONGODB_URI);
    console.log("Connected to MongoDB");

    const db = mongoose.connection.db;
    const usersCol = db.collection('users');
    const roomsCol = db.collection('rooms');

    // 1. Find user with phone 9079758684 or similar
    const hostUser = await usersCol.findOne({
      $or: [
        { phone: '9079758684' },
        { phone: '+919079758684' },
        { phone: '919079758684' },
        { mobile: '9079758684' }
      ]
    });

    console.log("Host user found:", hostUser ? hostUser.name || hostUser._id : "None found by exact phone string");

    let hostId = hostUser ? hostUser._id : null;
    let targetRoom = null;

    if (hostId) {
      targetRoom = await roomsCol.findOne({ hostId: hostId, status: 'live' });
      if (!targetRoom) {
        targetRoom = await roomsCol.findOne({ hostId: hostId });
      }
    }

    if (!targetRoom) {
      console.log("Searching for latest live party room...");
      targetRoom = await roomsCol.findOne({ roomType: 'party_room', status: 'live' });
    }

    if (!targetRoom) {
      console.log("Searching for any latest party room...");
      targetRoom = await roomsCol.findOne({ roomType: 'party_room' }, { sort: { createdAt: -1 } });
    }

    if (!targetRoom) {
      console.log("Searching for any live room...");
      targetRoom = await roomsCol.findOne({ status: 'live' }, { sort: { createdAt: -1 } });
    }

    if (!targetRoom) {
      console.log("No party room found in database.");
      process.exit(1);
    }

    console.log("Target Room:", {
      id: targetRoom._id,
      channelName: targetRoom.channelName,
      roomId: targetRoom.roomId,
      roomType: targetRoom.roomType,
      status: targetRoom.status,
      hostId: targetRoom.hostId
    });

    // 2. Create or find dummy users
    const dummyUsersData = [
      { name: "Anya (Dummy 1)", avatar: "https://randomuser.me/api/portraits/women/44.jpg" },
      { name: "Rahul (Dummy 2)", avatar: "https://randomuser.me/api/portraits/men/32.jpg" },
      { name: "Priya (Dummy 3)", avatar: "https://randomuser.me/api/portraits/women/68.jpg" },
      { name: "Aarav (Dummy 4)", avatar: "https://randomuser.me/api/portraits/men/46.jpg" },
    ];

    const dummyUserObjs = [];

    for (let i = 0; i < dummyUsersData.length; i++) {
      const d = dummyUsersData[i];
      let dUser = await usersCol.findOne({ name: d.name });
      if (!dUser) {
        const dummyNum = 9900000000 + i + Math.floor(Math.random() * 1000);
        const insertRes = await usersCol.insertOne({
          name: d.name,
          userId: dummyNum,
          phone: `${dummyNum}`,
          profileImageUrl: { url: d.avatar },
          coins: 100000,
          createdAt: new Date(),
          updatedAt: new Date()
        });
        dUser = await usersCol.findOne({ _id: insertRes.insertedId });
      }
      dummyUserObjs.push(dUser);
    }

    console.log("Dummy Users Ready:", dummyUserObjs.map(u => ({ id: u._id, name: u.name })));

    // 3. Update room seats and joinedUsers
    const currentSeats = targetRoom.seats || [];
    const maxSeats = Math.max(targetRoom.maxSeats || 8, 8);
    const updatedSeats = [];

    for (let i = 0; i < maxSeats; i++) {
      let seatObj = currentSeats[i] || { seatIndex: i, status: 'available' };
      if (i < dummyUserObjs.length) {
        const dUser = dummyUserObjs[i];
        seatObj = {
          seatIndex: i,
          status: 'occupied',
          user: {
            user: {
              id: dUser._id.toString(),
              name: dUser.name,
              userId: dUser.userId || 1000 + i,
              profileImageUrl: dUser.profileImageUrl || { url: dummyUsersData[i].avatar }
            }
          },
          isMuted: false,
          muted: false,
          occupiedAt: new Date()
        };
      }
      updatedSeats.push(seatObj);
    }

    const dummyJoinedUsers = dummyUserObjs.map(dUser => ({
      user: {
        user: {
          id: dUser._id.toString(),
          name: dUser.name,
          profileImageUrl: dUser.profileImageUrl
        }
      },
      createdAt: new Date()
    }));

    await roomsCol.updateOne(
      { _id: targetRoom._id },
      {
        $set: {
          seats: updatedSeats,
          maxSeats: maxSeats,
          status: 'live',
          updatedAt: new Date()
        },
        $addToSet: {
          joinedUsers: { $each: dummyJoinedUsers }
        }
      }
    );

    console.log(`SUCCESS! Assigned ${dummyUserObjs.length} dummy users to room ${targetRoom.channelName} (${targetRoom.roomId}).`);
    process.exit(0);

  } catch (err) {
    console.error("Error in script:", err);
    process.exit(1);
  }
}

run();
