import { PublicSiteLayout } from "@/app/(public)/_components/public-site-layout";

export default function PublicLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return <PublicSiteLayout>{children}</PublicSiteLayout>;
}
