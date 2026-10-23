import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import SubscriptionPage from "@/app/(private)/subscription/page";

vi.mock("@/components/app-shell", () => ({
  AppShell: ({
    title,
    children,
  }: React.PropsWithChildren<{ title: string }>) => (
    <main data-title={title}>{children}</main>
  ),
}));
vi.mock("@/app/(private)/subscription/_components/billing-management", () => ({
  BillingManagement: () => <section>Gerenciar assinatura</section>,
}));

describe("SubscriptionPage", () => {
  it("renders subscription management inside the application shell", () => {
    const html = renderToStaticMarkup(<SubscriptionPage />);
    expect(html).toContain('data-title="Assinatura"');
    expect(html).toContain("Gerenciar assinatura");
  });
});
