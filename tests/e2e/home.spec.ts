import { expect, test } from "@playwright/test";
import { createHmac } from "node:crypto";

const e2eSecret = "investlab-e2e-auth-secret-2026!!";

function sessionToken(expiresAt: number) {
  const payload = `user@example.com.${expiresAt}`;
  const encodedPayload = Buffer.from(payload).toString("base64url");
  const signature = createHmac("sha256", e2eSecret)
    .update(payload)
    .digest("base64url");
  return `${encodedPayload}.${signature}`;
}

test("redirects anonymous visitors to login before rendering the home page", async ({
  page,
}) => {
  await page.goto("/");

  await expect(page).toHaveURL(/\/login$/);
  await expect(
    page.getByText("Acesse sua conta", { exact: true }),
  ).toBeVisible();
});

test("rejects anonymous requests to read and mutation APIs", async ({
  request,
}) => {
  for (const [url, method] of [
    ["/api/portfolio", "GET"],
    ["/api/positions/manual", "POST"],
  ] as const) {
    const response = await request.fetch(url, { method });
    expect(response.status(), `${method} ${url}`).toBe(401);
    await expect(response.json()).resolves.toEqual({
      message: "Não autenticado.",
    });
  }
});

test("allows a request with a valid server-signed session", async ({
  page,
}) => {
  await page.context().addCookies([
    {
      name: "investlab_session",
      value: sessionToken(Date.now() + 60_000),
      domain: "127.0.0.1",
      path: "/",
    },
  ]);

  await page.goto("/");

  await expect(page).toHaveURL(/\/$/);
  await expect(page.getByRole("heading", { name: "Dashboard" })).toBeVisible();
});

test("rejects an expired or tampered session", async ({ page, request }) => {
  await page.context().addCookies([
    {
      name: "investlab_session",
      value: `${sessionToken(Date.now() - 60_000)}x`,
      domain: "127.0.0.1",
      path: "/",
    },
  ]);

  await page.goto("/portfolio");
  await expect(page).toHaveURL(/\/login$/);

  const response = await request.get("/api/portfolio", {
    headers: {
      cookie: `investlab_session=${sessionToken(Date.now() - 60_000)}x`,
    },
  });
  expect(response.status()).toBe(401);
});
