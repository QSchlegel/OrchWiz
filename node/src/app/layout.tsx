import type { Metadata } from "next";
import "./globals.css";
import { ThemeProvider } from "@/components/theme/ThemeProvider";
import { ThemeFooter } from "@/components/theme/ThemeFooter";

export const metadata: Metadata = {
  title: "OrchWiz - Orchestration Wizard",
  description: "Agent Ops command deck: orchestration sessions with passkeys, deploy agents across distributed nodes, every decision traceable.",
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
      <body>
        <ThemeProvider>
          {children}
          <ThemeFooter />
        </ThemeProvider>
      </body>
    </html>
  );
}
