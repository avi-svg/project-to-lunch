import type { Metadata } from "next";
import type { ReactNode } from "react";
import { AppSessionProvider } from "@/components/session-provider";
import "./globals.css";

export const metadata: Metadata = {
  title: "מערכת ניהול תורנויות",
  description: "דשבורד שבועי לתורנויות עם הרשמה עצמית ואישורי אנשי צוות",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: ReactNode;
}>) {
  return (
    <html lang="he" dir="rtl" className="h-full antialiased">
      <body className="min-h-full flex flex-col">
        <AppSessionProvider>{children}</AppSessionProvider>
      </body>
    </html>
  );
}
