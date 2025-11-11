"use client";

import { ThemeProvider as NextThemesProvider } from "next-themes";
import { ReactNode } from "react";

/**
 * Wraps the app with a theme provider so `useTheme` works everywhere.
 */
type Props = {
  children: ReactNode;
  attribute?: "class" | "data-theme";
  defaultTheme?: string;
};

export function ThemeProvider({
  children,
  attribute = "class",
  defaultTheme = "light",
}: Props) {
  return (
    <NextThemesProvider attribute={attribute} defaultTheme={defaultTheme}>
      {children}
    </NextThemesProvider>
  );
}
