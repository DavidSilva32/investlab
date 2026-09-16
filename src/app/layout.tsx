import type { Metadata } from "next";

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
    <html lang="pt-BR">
      <body>{children}</body>
    </html>
  );
}
