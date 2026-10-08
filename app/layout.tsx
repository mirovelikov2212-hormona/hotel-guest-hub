import type { Metadata, Viewport } from "next";
import "./globals.css";
import "./internal-tools-brand.css";
import "./demo-refinements.css";
import "./demo-session-layout.css";
import "./gostaya-visual-refinements.css";
import PWARegister from "@/components/PWARegister";

export const metadata: Metadata = {
  title: "StayHub",
  description: "Digital guest hub for hotels.",
  applicationName: "StayHub",
  manifest: "/manifest.webmanifest",
  appleWebApp: {
    capable: true,
    statusBarStyle: "default",
    title: "StayHub",
  },
  icons: {
    icon: [{ url: "/favicon.ico", sizes: "any", type: "image/x-icon" }],
    apple: [
      { url: "/apple-touch-icon.png?v=3", sizes: "180x180", type: "image/png" },
    ],
    shortcut: [{ url: "/favicon.ico" }],
  },
};

export const viewport: Viewport = {
  themeColor: "#F5F5F5",
  colorScheme: "light",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body className="antialiased">
        <PWARegister />
        {children}
      </body>
    </html>
  );
}
