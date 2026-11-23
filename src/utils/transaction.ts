import mongoose, { ClientSession } from 'mongoose';
import AppLogger from '../api/loaders/logger';

let isReplicaSetSupported: boolean | null = null;

export async function isReplicaSet(): Promise<boolean> {
  if (isReplicaSetSupported !== null) return isReplicaSetSupported;
  try {
    const admin = mongoose.connection.db?.admin();
    if (!admin) {
      isReplicaSetSupported = false;
      return false;
    }
    const serverStatus = await admin.serverStatus();
    if (serverStatus?.repl && (serverStatus.repl.setName || serverStatus.repl.hosts)) {
      isReplicaSetSupported = true;
    } else {
      isReplicaSetSupported = false;
    }
  } catch (err: any) {
    AppLogger.warn(`Replica set check failed: ${err.message}. Assuming standalone MongoDB.`);
    isReplicaSetSupported = false;
  }
  return isReplicaSetSupported;
}

export async function runInTransaction<T>(
  fn: (session: ClientSession | null) => Promise<T>
): Promise<T> {
  const supportsTx = await isReplicaSet();

  if (!supportsTx) {
    return await fn(null);
  }

  let session: ClientSession | null = null;
  try {
    session = await mongoose.startSession();
    session.startTransaction();
    const result = await fn(session);
    await session.commitTransaction();
    return result;
  } catch (error: any) {
    if (session && session.inTransaction()) {
      try {
        await session.abortTransaction();
      } catch (_) { }
    }
    const msg = error?.message || '';
    if (
      msg.includes('replica set member or mongos') ||
      msg.includes('Transaction numbers are only allowed') ||
      error?.code === 20 ||
      error?.codeName === 'IllegalOperation'
    ) {
      isReplicaSetSupported = false;
      AppLogger.warn('MongoDB transactions not supported on this instance. Falling back to non-transactional mode.');
      return await fn(null);
    }
    throw error;
  } finally {
    if (session) {
      session.endSession();
    }
  }
}
