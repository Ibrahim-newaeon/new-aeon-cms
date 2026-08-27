// /lib/auth/password.ts
import { hash, verify, argon2id } from 'argon2';

export async function hashPassword(plain: string): Promise<string> {
  return hash(plain, {
    type: argon2id,
    memoryCost: 65536,
    timeCost: 3,
    parallelism: 4,
  });
}

export async function verifyPassword(hash: string, plain: string): Promise<boolean> {
  return verify(hash, plain);
}
