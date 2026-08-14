import mongoose from 'mongoose';
import Block from '../models/Block';

export interface BlockRelation {
  isBlocked: boolean;
  blockedByMe: boolean;
  blockedByOther: boolean;
  message?: string;
}

export async function getBlockRelation(userA: string, userB: string): Promise<BlockRelation> {
  if (!userA || !userB || userA === userB) {
    return { isBlocked: false, blockedByMe: false, blockedByOther: false };
  }

  const relation = await Block.findOne({
    $or: [
      { blockerId: userA, blockedId: userB },
      { blockerId: userB, blockedId: userA },
    ],
  }).select('blockerId blockedId');

  if (!relation) {
    return { isBlocked: false, blockedByMe: false, blockedByOther: false };
  }

  const blockedByMe = relation.blockerId.toString() === userA.toString();
  return {
    isBlocked: true,
    blockedByMe,
    blockedByOther: !blockedByMe,
    message: blockedByMe
      ? 'You have blocked this user'
      : 'You are blocked by this user',
  };
}

export async function assertUsersNotBlocked(userA: string, userB: string): Promise<void> {
  const relation = await getBlockRelation(userA, userB);
  if (relation.isBlocked) {
    throw new Error(relation.message || 'Messaging is not allowed with this user');
  }
}

export async function areUsersBlocked(userA: string, userB: string): Promise<boolean> {
  const relation = await getBlockRelation(userA, userB);
  return relation.isBlocked;
}

export function toObjectId(id: string) {
  return new mongoose.Types.ObjectId(id);
}
