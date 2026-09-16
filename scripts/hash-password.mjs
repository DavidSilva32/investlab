import { randomBytes, scryptSync } from "node:crypto";

const password = process.argv[2];

if (!password) {
  throw new Error("Use: node scripts/hash-password.mjs <senha>");
}

const salt = randomBytes(16).toString("hex");
const hash = scryptSync(password, salt, 64).toString("hex");

console.log(`${salt}:${hash}`);
