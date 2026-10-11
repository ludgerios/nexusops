import { randomBytes, scrypt as nodeScrypt, timingSafeEqual, createHash } from 'node:crypto';
function scrypt(
  password: string,
  salt: string,
  keyLength: number,
  options: { N: number; r: number; p: number; maxmem: number },
): Promise<Buffer> {
  return new Promise((resolve, reject) =>
    nodeScrypt(password, salt, keyLength, options, (error, key) =>
      error ? reject(error) : resolve(key),
    ),
  );
}
export const randomToken = () => randomBytes(32).toString('base64url');
export const tokenHash = (token: string) => createHash('sha256').update(token).digest('hex');
export async function hashPassword(password: string) {
  const salt = randomBytes(16).toString('hex');
  const key = (await scrypt(password, salt, 64, {
    N: 131072,
    r: 8,
    p: 1,
    maxmem: 256 * 1024 * 1024,
  })) as Buffer;
  return `scrypt:131072:${salt}:${key.toString('hex')}`;
}
export async function verifyPassword(password: string, stored: string) {
  const [algorithm, cost, salt, key] = stored.split(':');
  if (algorithm !== 'scrypt' || cost !== '131072' || !salt || !key) return false;
  const derived = (await scrypt(password, salt, 64, {
    N: 131072,
    r: 8,
    p: 1,
    maxmem: 256 * 1024 * 1024,
  })) as Buffer;
  const actual = Buffer.from(key, 'hex');
  return actual.length === derived.length && timingSafeEqual(actual, derived);
}
export function safeEqual(a: string, b: string) {
  const av = Buffer.from(a);
  const bv = Buffer.from(b);
  return av.length === bv.length && timingSafeEqual(av, bv);
}
