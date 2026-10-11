import { expect, test } from "@playwright/test";
import { addSignedInSession } from "./helpers/session";

const candidate = {
  manualAssetKey: "manual:00000000-0000-0000-0000-000000000001",
  importedAssetKey: "v1:" + "a".repeat(64),
  status: "probable",
  manualUpdatedAt: "2026-10-01T12:00:00Z",
  manualProduct: "ETF informado",
  importedProduct: "ETF importado",
  manualValue: "1000.00",
  importedValue: "1100.00",
  institution: "Instituição de teste",
};

// Every API request is intercepted. These tests never modify the shared database.
test("import requires an explicit duplicate decision and submits its exact identity", async ({
  page,
}) => {
  let confirmedDecisions: unknown;
  await page.route("**/api/**", (route) => {
    const request = route.request();
    const path = new URL(request.url()).pathname;
    if (path === "/api/imports/preview" && request.method() === "POST") {
      return route.fulfill({
        json: {
          documentType: "B3_POSITION_XLSX",
          count: 1,
          positions: [
            {
              product: "ETF importado",
              quantity: "1",
              totalValue: "1100",
              institution: "Instituição de teste",
              assetCode: "ETF1",
              indexer: null,
              unitPrice: "1100",
              valuationSource: "FECHAMENTO",
            },
          ],
          reconciliationCandidates: [candidate],
        },
      });
    }
    if (path === "/api/imports/confirm" && request.method() === "POST") {
      const body = request.postData() ?? "";
      const field = body.match(
        /name="reconciliationDecisions"\r\n\r\n([^\r]+)/,
      );
      confirmedDecisions = field ? JSON.parse(field[1]) : null;
      return route.fulfill({
        json: { message: "Importação de teste concluída" },
      });
    }
    return route.abort("blockedbyclient");
  });
  await addSignedInSession(page);
  await page.goto("/imports");
  await page.locator('input[type="file"]').setInputFiles({
    name: "posicoes.xlsx",
    mimeType:
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    buffer: Buffer.from("mocked spreadsheet"),
  });
  await page
    .getByRole("textbox", { name: /^Data exibida na B3/ })
    .fill("18/09/2026");
  const confirm = page.getByRole("button", { name: "Confirmar 1 arquivo(s)" });
  await expect(confirm).toBeDisabled();
  await expect(page.getByText("Revisar possível duplicidade")).toBeVisible();
  const same = page.getByRole("button", { name: "Mesma posição", exact: true });
  await same.focus();
  await page.keyboard.press("Enter");
  await expect(same).toHaveAttribute("aria-pressed", "true");
  await expect(confirm).toBeEnabled();
  await page
    .getByRole("button", { name: "Posições distintas", exact: true })
    .click();
  await expect(same).toHaveAttribute("aria-pressed", "false");
  await same.click();
  await confirm.click();
  await expect
    .poll(() => confirmedDecisions)
    .toEqual([
      {
        manualAssetKey: candidate.manualAssetKey,
        importedAssetKey: candidate.importedAssetKey,
        manualUpdatedAt: candidate.manualUpdatedAt,
        action: "link",
      },
    ]);
  await expect(confirm).toBeHidden();
});

test("reversing a link requires a keyboard accessible confirmation and preserves history warning", async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.emulateMedia({ reducedMotion: "reduce" });
  const reversed: unknown[] = [];
  await page.route("**/api/**", (route) => {
    const request = route.request();
    const path = new URL(request.url()).pathname;
    if (
      path === "/api/positions/reconciliation" &&
      request.method() === "GET"
    ) {
      return route.fulfill({
        json: {
          links: [
            {
              manualAssetKey: candidate.manualAssetKey,
              importedAssetKey: candidate.importedAssetKey,
              manualProduct: candidate.manualProduct,
              effectiveFrom: "2026-10-01",
              recordedAt: "2026-10-02",
            },
          ],
        },
      });
    }
    if (
      path === "/api/positions/reconciliation" &&
      request.method() === "PATCH"
    ) {
      reversed.push(request.postDataJSON());
      return route.fulfill({ json: { message: "Vínculo desfeito" } });
    }
    return route.abort("blockedbyclient");
  });
  await addSignedInSession(page);
  await page.goto("/imports");
  await page.getByRole("button", { name: /Revisar vínculos/ }).click();
  const reverse = page.getByRole("button", { name: "Desfazer vínculo" });
  await reverse.click();
  const dialog = page.getByRole("alertdialog", {
    name: "Separar estas posições?",
  });
  await expect(dialog).toBeVisible();
  await expect(dialog).toContainText("pode estar desatualizado");
  await expect(dialog).toContainText("histórico anterior será preservado");
  await expect(
    page.getByRole("button", { name: "Cancelar", exact: true }),
  ).toBeFocused();
  await page.keyboard.press("Enter");
  await expect(dialog).toBeHidden();
  expect(reversed).toEqual([]);
  await reverse.click();
  await page
    .getByRole("button", { name: "Confirmar posições distintas" })
    .focus();
  await page.keyboard.press("Enter");
  await expect
    .poll(() => reversed)
    .toEqual([{ manualAssetKey: candidate.manualAssetKey }]);
  await expect(
    page.getByText("Nenhuma posição manual vinculada à B3."),
  ).toBeVisible();
  await expect
    .poll(() =>
      page.evaluate(
        () => document.documentElement.scrollWidth <= window.innerWidth,
      ),
    )
    .toBe(true);
});
