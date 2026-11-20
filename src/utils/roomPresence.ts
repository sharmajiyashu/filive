import Container from 'typedi';

/**
 * Checks whether a host user is genuinely connected and active inside a specific live/party room.
 *
 * A host is ONLY considered live/existing inside the room if:
 * 1. The socket server instance is available.
 * 2. The host has an active socket connection in `user_<hostId>`.
 * 3. At least one of the host's active sockets is present in the room's socket channel:
 *    `room_<channelName>`, `live_<channelName>`, or `<channelName>`.
 */
export function isHostInRoom(
  hostId: string | undefined | null,
  channelName: string | undefined | null,
  ioInstance?: any
): boolean {
  if (!hostId || !channelName) return false;
  const hostIdStr = hostId.toString().trim();
  const chName = channelName.trim();
  if (!hostIdStr || !chName) return false;

  let io = ioInstance;
  if (!io) {
    try {
      io = Container.get('socket');
    } catch (_) {
      io = null;
    }
  }
  if (!io || !io.sockets?.adapter?.rooms) return false;

  const userRoom = io.sockets.adapter.rooms.get(`user_${hostIdStr}`);
  if (!userRoom || userRoom.size === 0) return false;

  const clean = chName.replace(/^(live_)+/, '');
  const candidateRoomNames = [
    `room_${chName}`,
    `live_${chName}`,
    chName,
    `room_${clean}`,
    `live_${clean}`,
    clean,
  ];

  for (const rName of candidateRoomNames) {
    const rSet = io.sockets.adapter.rooms.get(rName);
    if (rSet && rSet.size > 0) {
      for (const socketId of userRoom) {
        if (rSet.has(socketId)) {
          return true;
        }
      }
    }
  }

  return false;
}
