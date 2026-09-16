import { getAuthSecret } from "@/infrastructure/auth/auth-configuration";

export const sessionCookieName = "investlab_session";

const encoder = new TextEncoder();
const decode = new TextDecoder();
const toBase64Url = (value: Uint8Array) =>
  btoa(String.fromCharCode(...value))
    .replaceAll("+", "-")
    .replaceAll("/", "_")
    .replaceAll("=", "");
const fromBase64Url = (value: string) => {
  const base64 = value
    .replaceAll("-", "+")
    .replaceAll("_", "/")
    .padEnd(Math.ceil(value.length / 4) * 4, "=");
  return Uint8Array.from(atob(base64), (character) => character.charCodeAt(0));
};

async function sign(payload: string) {
  const key = await crypto.subtle.importKey(
    "raw",
    encoder.encode(getAuthSecret()),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );

  return new Uint8Array(
    await crypto.subtle.sign("HMAC", key, encoder.encode(payload)),
  );
}

export async function createSession(email: string) {
  const payload = `${email}.${Date.now() + 1000 * 60 * 60 * 24 * 7}`;

  return `${toBase64Url(encoder.encode(payload))}.${toBase64Url(await sign(payload))}`;
}

export async function verifySession(token?: string) {
  if (!token) return false;

  const [encodedPayload, encodedSignature, extra] = token.split(".");
  if (!encodedPayload || !encodedSignature || extra) return false;

  const payload = decode.decode(fromBase64Url(encodedPayload));
  const signature = fromBase64Url(encodedSignature);
  const expected = await sign(payload);
  if (signature.length !== expected.length) return false;

  let difference = 0;
  for (let index = 0; index < signature.length; index += 1)
    difference |= signature[index] ^ expected[index];
  if (difference !== 0) return false;

  const expiresAt = Number(payload.slice(payload.lastIndexOf(".") + 1));
  return expiresAt > Date.now();
}
