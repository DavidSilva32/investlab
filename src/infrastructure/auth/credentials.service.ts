import { scrypt as scryptCallback, timingSafeEqual } from "node:crypto";
import { promisify } from "node:util";

import { getCredentialsConfiguration } from "@/infrastructure/auth/auth-configuration";

const scrypt = promisify(scryptCallback);

export class CredentialsService {
  async verify(email: string, password: string) {
    const configuration = getCredentialsConfiguration();

    if (email !== configuration.email) return false;

    const derived = (await scrypt(password, configuration.salt, 64)) as Buffer;
    const expected = Buffer.from(configuration.hash, "hex");

    return timingSafeEqual(expected, derived);
  }
}

export const credentialsService = new CredentialsService();
