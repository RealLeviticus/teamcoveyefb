import "./globals.css";
import type { Metadata } from "next";
import { Inter } from "next/font/google";
import { ThemeProvider } from "@/components/theme-provider";
import { Header } from "@/components/header";

const inter = Inter({ subsets: ["latin"] });

export const metadata: Metadata = {
  title: "Team Covey EFB",
  description: "Electronic Flight Bag interface for Team Covey.",
};

export const viewport = {
  width: 'device-width',
  initialScale: 1,
  viewportFit: 'cover',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className="scroll-smooth dark" suppressHydrationWarning>
      <body className={`${inter.className} antialiased bg-[var(--app-bg)] text-[var(--app-fg)] transition-colors`}>
        <ThemeProvider>
          {/* Fixed header with optional notice; leave generous top padding below it */}
          <Header />
          {/* Main leaves space for header + notice (~5rem) */}
          <main className="pt-20 h-[calc(100vh-5rem)] overflow-hidden">
            {children}
          </main>
        </ThemeProvider>
      </body>
    </html>
  );
}
