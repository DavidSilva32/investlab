import { scrypt as scryptCallback, timingSafeEqual } from "node:crypto";
import { promisify } from "node:util";

const scrypt = promisify(scryptCallback);

export class CredentialsService {
  async verify(email: string, password: string) {
    const expectedEmail = process.env.AUTH_EMAIL;
    const storedHash = process.env.AUTH_PASSWORD_HASH;

    if (!expectedEmail || !storedHash || email !== expectedEmail) return false;

    const [salt, expected] = storedHash.split(":");

    if (!salt || !expected) return false;
    const derived = (await scrypt(password, salt, 64)) as Buffer;
    const expectedBuffer = Buffer.from(expected, "hex");

    return (
      expectedBuffer.length === derived.length &&
      timingSafeEqual(expectedBuffer, derived)
    );
  }
}
export const credentialsService = new CredentialsService();
