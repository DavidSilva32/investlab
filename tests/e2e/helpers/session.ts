import { createHmac } from "node:crypto";
import type { Page } from "@playwright/test";

const e2eSecret = "investlab-e2e-auth-secret-2026!!";

function sessionToken(expiresAt: number) {
  const payload = `user@example.com.${expiresAt}`;
  const encodedPayload = Buffer.from(payload).toString("base64url");
  const signature = createHmac("sha256", e2eSecret)
    .update(payload)
    .digest("base64url");
  return `${encodedPayload}.${signature}`;
}

export async function addSignedInSession(page: Page) {
  await page.context().addCookies([
    {
      name: "investlab_session",
      value: sessionToken(Date.now() + 60_000),
      domain: "127.0.0.1",
      path: "/",
    },
  ]);
}
