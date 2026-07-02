import { createCipheriv, randomBytes } from 'crypto';

/**
 * Generates a ZEGOCLOUD Token04 for client SDK authentication.
 * 
 * @param appId Unique identifier for your ZEGOCLOUD project (number)
 * @param userId Unique identifier for the user (string)
 * @param serverSecret The 32-byte Server Secret from ZEGOCLOUD Console (string)
 * @param effectiveTimeInSeconds Duration of token validity in seconds (number)
 * @param payload Optional JSON string containing privileges or constraints (string)
 */
export function generateZegoToken(
  appId: number,
  userId: string,
  serverSecret: string,
  effectiveTimeInSeconds: number,
  payload: string = ''
): string {
  if (!serverSecret || serverSecret.length !== 32) {
    throw new Error('Invalid serverSecret length. It must be exactly 32 bytes.');
  }

  const createTime = Math.floor(Date.now() / 1000);
  const expire = createTime + effectiveTimeInSeconds;

  const tokenInfo = {
    app_id: appId,
    user_id: userId,
    nonce: Math.floor(Math.random() * 2147483647),
    ctime: createTime,
    expire: expire,
    payload: payload
  };

  const nonce = randomBytes(12); // 12-byte initialization vector for AES-GCM
  const cipher = createCipheriv('aes-256-gcm', Buffer.from(serverSecret), nonce);

  const encrypted = Buffer.concat([
    cipher.update(JSON.stringify(tokenInfo), 'utf8'),
    cipher.final()
  ]);

  const authTag = cipher.getAuthTag();

  // Pack the data:
  // - 12 bytes nonce (IV)
  // - 2 bytes length of encrypted data (big-endian UInt16)
  // - Encrypted ciphertext bytes
  // - 16 bytes auth tag (AES-GCM tag)
  const lenBuf = Buffer.alloc(2);
  lenBuf.writeUInt16BE(encrypted.length, 0);

  const packed = Buffer.concat([
    nonce,
    lenBuf,
    encrypted,
    authTag
  ]);

  return '04' + packed.toString('base64');
}
