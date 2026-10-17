import { expect, test } from "@playwright/test";

test("public login and legal pages remain reachable without a session", async ({
  page,
}) => {
  await page.goto("/login");
  await expect(page).toHaveURL(/\/entrar$/);
  await expect(
    page.getByText("Acesse sua conta", { exact: true }),
  ).toBeVisible();

  await page.goto("/cookies");
  await expect(page).toHaveURL(/\/cookies$/);
  await expect(page.getByRole("heading", { level: 1 })).toBeVisible();

  for (const route of ["/privacidade", "/termos-de-uso"]) {
    const response = await page.goto(route);
    expect(response?.status()).toBe(200);
    await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
  }
});
