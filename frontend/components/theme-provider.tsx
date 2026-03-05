"use client";

import { ThemeProvider as NextThemesProvider } from "next-themes";
import { ReactNode } from "react";

/**
 * Wraps the app with a theme provider so `useTheme` works everywhere.
 * Light mode has been removed; the app always runs in dark mode.
 */
type Props = { children: ReactNode };

export function ThemeProvider({ children }: Props) {
  return (
    <NextThemesProvider
      attribute="class"
      defaultTheme="dark"
      forcedTheme="dark"
      enableSystem={false}
    >
      {children}
    </NextThemesProvider>
  );
}
