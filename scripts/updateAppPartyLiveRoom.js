const fs = require('fs');

// 1. Update profile_detail_screen.dart
const profileDetailPath = 'C:/Users/ADMIN/Desktop/projects/xamp/filive-app/lib/UserProfileDetailHome/View/profile_detail_screen.dart';
let profileContent = fs.readFileSync(profileDetailPath, 'utf8');

const targetProfileStats = 'const SizedBox(height: 25),\r\n                              Row(\r\n                                children: [\r\n                                  buildStatBox(';
const targetProfileStatsLF = 'const SizedBox(height: 25),\n                              Row(\n                                children: [\n                                  buildStatBox(';

const partyBannerCode = `// 🔴 LIVE IN PARTY ROOM BANNER
                              Obx(() {
                                final user = controller.userDetails.value;
                                final partyRoom = user.partyRoom;
                                final bool isPartyLive = partyRoom != null &&
                                    (partyRoom.status?.toLowerCase() == 'live' || partyRoom.isLive == true) &&
                                    ((partyRoom.roomId ?? 0) > 0 ||
                                     (partyRoom.channelName ?? '').isNotEmpty ||
                                     (partyRoom.id ?? '').isNotEmpty);
                                if (!isPartyLive) return const SizedBox.shrink();

                                return Container(
                                  margin: const EdgeInsets.only(top: 14, bottom: 6),
                                  decoration: BoxDecoration(
                                    gradient: const LinearGradient(
                                      begin: Alignment.topLeft,
                                      end: Alignment.bottomRight,
                                      colors: [Color(0xFFFF0055), Color(0xFFFF5E36)],
                                    ),
                                    borderRadius: BorderRadius.circular(18),
                                    boxShadow: [
                                      BoxShadow(
                                        color: const Color(0xFFFF0055).withOpacity(0.35),
                                        blurRadius: 14,
                                        spreadRadius: 1,
                                        offset: const Offset(0, 4),
                                      ),
                                    ],
                                  ),
                                  padding: const EdgeInsets.all(1.5),
                                  child: Container(
                                    padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 12),
                                    decoration: BoxDecoration(
                                      gradient: const LinearGradient(
                                        begin: Alignment.topLeft,
                                        end: Alignment.bottomRight,
                                        colors: [Color(0xFF1E0A24), Color(0xFF320839)],
                                      ),
                                      borderRadius: BorderRadius.circular(16.5),
                                    ),
                                    child: Row(
                                      children: [
                                        // Glowing icon badge
                                        Container(
                                          width: 44,
                                          height: 44,
                                          decoration: BoxDecoration(
                                            shape: BoxShape.circle,
                                            gradient: const LinearGradient(
                                              colors: [Color(0xFFFF0066), Color(0xFFFF5E36)],
                                            ),
                                            boxShadow: [
                                              BoxShadow(
                                                color: const Color(0xFFFF0066).withOpacity(0.5),
                                                blurRadius: 8,
                                                offset: const Offset(0, 2),
                                              ),
                                            ],
                                          ),
                                          child: const Center(
                                            child: Icon(
                                              Icons.celebration_rounded,
                                              color: Colors.white,
                                              size: 24,
                                            ),
                                          ),
                                        ),
                                        const SizedBox(width: 12),
                                        Expanded(
                                          child: Column(
                                            crossAxisAlignment: CrossAxisAlignment.start,
                                            mainAxisSize: MainAxisSize.min,
                                            children: [
                                              Row(
                                                children: [
                                                  Container(
                                                    padding: const EdgeInsets.symmetric(horizontal: 7, vertical: 2),
                                                    decoration: BoxDecoration(
                                                      color: const Color(0xFFFF0055),
                                                      borderRadius: BorderRadius.circular(8),
                                                    ),
                                                    child: Row(
                                                      mainAxisSize: MainAxisSize.min,
                                                      children: const [
                                                        Icon(Icons.fiber_manual_record, color: Colors.white, size: 8),
                                                        SizedBox(width: 3),
                                                        Text(
                                                          'LIVE NOW',
                                                          style: TextStyle(
                                                            color: Colors.white,
                                                            fontSize: 9,
                                                            fontFamily: 'Gilroy',
                                                            fontWeight: FontWeight.w900,
                                                            letterSpacing: 0.5,
                                                          ),
                                                        ),
                                                      ],
                                                    ),
                                                  ),
                                                  const SizedBox(width: 6),
                                                  Text(
                                                    'Room #\${partyRoom.roomId ?? ""}',
                                                    style: TextStyle(
                                                      color: Colors.white.withOpacity(0.85),
                                                      fontSize: 11,
                                                      fontFamily: 'Gilroy',
                                                      fontWeight: FontWeight.w600,
                                                    ),
                                                  ),
                                                ],
                                              ),
                                              const SizedBox(height: 3),
                                              Text(
                                                (partyRoom.title != null && partyRoom.title!.isNotEmpty)
                                                    ? partyRoom.title!
                                                    : '\${user.user.name}\\'s Party Room',
                                                maxLines: 1,
                                                overflow: TextOverflow.ellipsis,
                                                style: const TextStyle(
                                                  color: Colors.white,
                                                  fontSize: 13,
                                                  fontFamily: 'Gilroy',
                                                  fontWeight: FontWeight.w700,
                                                ),
                                              ),
                                            ],
                                          ),
                                        ),
                                        const SizedBox(width: 8),
                                        GestureDetector(
                                          onTap: () => _joinUserPartyRoom(partyRoom),
                                          child: Container(
                                            padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 9),
                                            decoration: BoxDecoration(
                                              gradient: const LinearGradient(
                                                colors: [Color(0xFFFF0066), Color(0xFFFF5E36)],
                                              ),
                                              borderRadius: BorderRadius.circular(12),
                                              boxShadow: [
                                                BoxShadow(
                                                  color: const Color(0xFFFF0066).withOpacity(0.4),
                                                  blurRadius: 8,
                                                  offset: const Offset(0, 2),
                                                ),
                                              ],
                                            ),
                                            child: Row(
                                              mainAxisSize: MainAxisSize.min,
                                              children: const [
                                                Text(
                                                  'Join Now',
                                                  style: TextStyle(
                                                    color: Colors.white,
                                                    fontSize: 12,
                                                    fontFamily: 'Gilroy',
                                                    fontWeight: FontWeight.w800,
                                                  ),
                                                ),
                                                SizedBox(width: 3),
                                                Icon(Icons.arrow_forward_ios_rounded, color: Colors.white, size: 11),
                                              ],
                                            ),
                                          ),
                                        ),
                                      ],
                                    ),
                                  ),
                                );
                              }),
                              `;

if (!profileContent.includes('// 🔴 LIVE IN PARTY ROOM BANNER')) {
  if (profileContent.includes(targetProfileStats)) {
    profileContent = profileContent.replace(targetProfileStats, partyBannerCode + '\r\n                              ' + targetProfileStats);
  } else if (profileContent.includes(targetProfileStatsLF)) {
    profileContent = profileContent.replace(targetProfileStatsLF, partyBannerCode + '\n                              ' + targetProfileStatsLF);
  }
}

// Ensure the floating party button check also strictly checks status == 'live'
profileContent = profileContent.replace(
  `final bool hasParty = partyRoom != null &&\r\n                        ((partyRoom.roomId ?? 0) > 0 ||\r\n                         (partyRoom.channelName ?? '').isNotEmpty ||\r\n                         (partyRoom.id ?? '').isNotEmpty);`,
  `final bool hasParty = partyRoom != null &&\r\n                        (partyRoom.status?.toLowerCase() == 'live' || partyRoom.isLive == true) &&\r\n                        ((partyRoom.roomId ?? 0) > 0 ||\r\n                         (partyRoom.channelName ?? '').isNotEmpty ||\r\n                         (partyRoom.id ?? '').isNotEmpty);`
);
profileContent = profileContent.replace(
  `final bool hasParty = partyRoom != null &&\n                        ((partyRoom.roomId ?? 0) > 0 ||\n                         (partyRoom.channelName ?? '').isNotEmpty ||\n                         (partyRoom.id ?? '').isNotEmpty);`,
  `final bool hasParty = partyRoom != null &&\n                        (partyRoom.status?.toLowerCase() == 'live' || partyRoom.isLive == true) &&\n                        ((partyRoom.roomId ?? 0) > 0 ||\n                         (partyRoom.channelName ?? '').isNotEmpty ||\n                         (partyRoom.id ?? '').isNotEmpty);`
);

fs.writeFileSync(profileDetailPath, profileContent, 'utf8');
console.log('Updated profile_detail_screen.dart');

// 2. Update ChatProfileScreen.dart
const chatPath = 'C:/Users/ADMIN/Desktop/projects/xamp/filive-app/lib/screens/home/View/Message/View/ChatProfileScreen.dart';
let chatContent = fs.readFileSync(chatPath, 'utf8');

const oldChatBanner = `final bool hasParty = partyRoom != null &&
                            ((partyRoom.roomId ?? 0) > 0 ||
                             (partyRoom.channelName ?? '').isNotEmpty ||
                             (partyRoom.id ?? '').isNotEmpty);`;

const oldChatBannerCRLF = `final bool hasParty = partyRoom != null &&\r\n                            ((partyRoom.roomId ?? 0) > 0 ||\r\n                             (partyRoom.channelName ?? '').isNotEmpty ||\r\n                             (partyRoom.id ?? '').isNotEmpty);`;

const newChatBanner = `final bool hasParty = partyRoom != null &&
                            (partyRoom.status?.toLowerCase() == 'live' || partyRoom.isLive == true) &&
                            ((partyRoom.roomId ?? 0) > 0 ||
                             (partyRoom.channelName ?? '').isNotEmpty ||
                             (partyRoom.id ?? '').isNotEmpty);`;

const newChatBannerCRLF = `final bool hasParty = partyRoom != null &&\r\n                            (partyRoom.status?.toLowerCase() == 'live' || partyRoom.isLive == true) &&\r\n                            ((partyRoom.roomId ?? 0) > 0 ||\r\n                             (partyRoom.channelName ?? '').isNotEmpty ||\r\n                             (partyRoom.id ?? '').isNotEmpty);`;

if (chatContent.includes(oldChatBannerCRLF)) {
  chatContent = chatContent.replace(oldChatBannerCRLF, newChatBannerCRLF);
} else if (chatContent.includes(oldChatBanner)) {
  chatContent = chatContent.replace(oldChatBanner, newChatBanner);
}

fs.writeFileSync(chatPath, chatContent, 'utf8');
console.log('Updated ChatProfileScreen.dart');
