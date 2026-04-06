import type { Metadata, Viewport } from "next";
import "./globals.css";
import { BottomNav } from "@/components/bottom-nav";
import { AuthSessionBootstrap } from "@/components/auth/auth-session-bootstrap";

const SITE_NAME = "ASOPRS Study Portal";
const SITE_DESCRIPTION =
  "Read the ASOPRS library, generate flashcards and quizzes, build study packs, and track your board-review progress in one place.";

const rawSiteUrl =
  process.env.NEXT_PUBLIC_SITE_URL ??
  process.env.VERCEL_PROJECT_PRODUCTION_URL ??
  process.env.VERCEL_URL ??
  `http://localhost:${process.env.PORT ?? 3000}`;

const metadataBase = new URL(
  rawSiteUrl.startsWith("http") ? rawSiteUrl : `https://${rawSiteUrl}`,
);

export const metadata: Metadata = {
  metadataBase,
  title: {
    default: SITE_NAME,
    template: `%s | ${SITE_NAME}`,
  },
  applicationName: SITE_NAME,
  description: SITE_DESCRIPTION,
  alternates: {
    canonical: "/",
  },
  openGraph: {
    type: "website",
    url: "/",
    siteName: SITE_NAME,
    title: SITE_NAME,
    description: SITE_DESCRIPTION,
    locale: "en_US",
  },
  twitter: {
    card: "summary_large_image",
    title: SITE_NAME,
    description: SITE_DESCRIPTION,
  },
  icons: {
    icon: [
      { url: "/favicon.ico", sizes: "any" },
      { url: "/icon.png", type: "image/png", sizes: "512x512" },
    ],
    apple: [{ url: "/apple-icon.png", sizes: "180x180", type: "image/png" }],
    shortcut: ["/favicon.ico"],
  },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
  themeColor: "#0B1426",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link
          rel="preconnect"
          href="https://fonts.gstatic.com"
          crossOrigin="anonymous"
        />
        <link
          href="https://fonts.googleapis.com/css2?family=DM+Serif+Display&family=Instrument+Sans:wght@400;500;600;700&display=swap"
          rel="stylesheet"
        />
      </head>
      <body className="font-[Instrument_Sans] antialiased paper-grain">
        <AuthSessionBootstrap />
        <div className="min-h-dvh pb-20 md:pb-0 md:pl-(--sidebar-width,256px)">
          {children}
        </div>
        <BottomNav />
      </body>
    </html>
  );
}
