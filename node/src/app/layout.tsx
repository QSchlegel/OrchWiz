import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "OrchWiz - Orchestration Wizard",
  description: "Orchestration Wizard for visualizing and managing AI coding assistant workflows",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
