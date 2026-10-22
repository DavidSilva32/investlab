import type { Metadata } from "next";
import Script from "next/script";
import { ThemeProvider } from "@/components/theme-provider";
import { CookieConsentManager } from "@/components/cookie-consent-manager";
import { Toaster } from "@/components/ui/sonner";
import { QueryProvider } from "@/components/query-provider";
import { application } from "@/lib/application";
import "./globals.css";

export const metadata: Metadata = {
  title: application.name,
  description: application.description,
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="pt-BR" suppressHydrationWarning>
      <body>
        <Script id="investlab-palette-init" strategy="beforeInteractive">
          {`try {
            const palette = localStorage.getItem("investlab-palette");
            if (["blue", "teal", "green", "violet", "orange", "rose"].includes(palette ?? "")) {
              document.documentElement.dataset.palette = palette;
            }
          } catch {}`}
        </Script>
        <ThemeProvider
          attribute="class"
          defaultTheme="system"
          enableSystem
          disableTransitionOnChange
        >
          <QueryProvider>
            {children}
            <CookieConsentManager />
            <Toaster />
          </QueryProvider>
        </ThemeProvider>
      </body>
    </html>
  );
}
