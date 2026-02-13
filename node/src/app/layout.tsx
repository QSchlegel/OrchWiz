import type { Metadata } from "next";
import { Suspense } from "react";
import "./globals.css";
import { ThemeProvider } from "@/components/theme/ThemeProvider";
import { ThemeFooter } from "@/components/theme/ThemeFooter";
import { NotificationProvider } from "@/components/notifications";

const siteUrl = process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000";

export const metadata: Metadata = {
  metadataBase: new URL(siteUrl),
  title: "OrchWiz | Agent VPC for AI Systems",
  description:
    "OrchWiz is the Agent VPC for AI infra engineers: run agents across local and cloud nodes with policy controls and full decision traceability.",
  icons: {
    icon: [
      { url: "/favicon.ico" },
      { url: "/favicon-32x32.png", sizes: "32x32", type: "image/png" },
      { url: "/favicon-16x16.png", sizes: "16x16", type: "image/png" },
    ],
    apple: [{ url: "/apple-touch-icon.png", sizes: "180x180", type: "image/png" }],
  },
  manifest: "/site.webmanifest",
  openGraph: {
    title: "OrchWiz | Agent VPC for AI Systems",
    description:
      "Private-by-default runtime boundaries, policy controls, and auditable agent operations across local and cloud nodes.",
    url: siteUrl,
    siteName: "OrchWiz",
    type: "website",
    images: [{ url: "/opengraph-image", width: 1200, height: 630, alt: "OrchWiz" }],
  },
  twitter: {
    card: "summary_large_image",
    title: "OrchWiz | Agent VPC for AI Systems",
    description:
      "Run agents across local and cloud nodes with policy controls and full decision traceability.",
    images: ["/opengraph-image"],
  },
};

const themeInitScript = `
(() => {
  try {
    const key = "orchwiz:theme-mode";
    const stored = localStorage.getItem(key);
    const mode = stored === "light" || stored === "dark" || stored === "system" ? stored : "system";
    const dark = mode === "dark" || (mode === "system" && window.matchMedia("(prefers-color-scheme: dark)").matches);
    const theme = dark ? "dark" : "light";
    const root = document.documentElement;
    root.classList.toggle("dark", dark);
    root.dataset.theme = theme;
    root.style.colorScheme = theme;
  } catch (_) {}
})();
`;

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeInitScript }} />
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <link
          href="https://fonts.googleapis.com/css2?family=JetBrains+Mono:wght@400;500;600;700&family=Outfit:wght@300;400;500;600;700;800&display=swap"
          rel="stylesheet"
        />
      </head>
      <body className="owz-launch">
        <ThemeProvider>
          <NotificationProvider>
            {children}
            <Suspense fallback={null}>
              <ThemeFooter />
            </Suspense>
          </NotificationProvider>
        </ThemeProvider>
      </body>
    </html>
  );
}
