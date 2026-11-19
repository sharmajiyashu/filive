const fs = require('fs');

const profilePath = 'C:/Users/ADMIN/Desktop/projects/xamp/filive-app/lib/UserProfileDetailHome/View/profile_detail_screen.dart';
let profile = fs.readFileSync(profilePath, 'utf8');
profile = profile.replaceAll("|| partyRoom.isLive == true", "");
fs.writeFileSync(profilePath, profile, 'utf8');

const chatPath = 'C:/Users/ADMIN/Desktop/projects/xamp/filive-app/lib/screens/home/View/Message/View/ChatProfileScreen.dart';
let chat = fs.readFileSync(chatPath, 'utf8');
chat = chat.replaceAll("|| partyRoom.isLive == true", "");
fs.writeFileSync(chatPath, chat, 'utf8');

console.log('Fixed partyRoom.isLive in Dart files');
