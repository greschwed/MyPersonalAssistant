import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Personal OS",
  description: "AI-native personal dashboard",
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="pt-BR" className="h-full antialiased dark">
      <body className="min-h-full">{children}</body>
    </html>
  );
}
