import "./globals.css";
import type { Metadata } from "next";
import { JetBrains_Mono, Manrope } from "next/font/google";
import { ReactNode } from "react";

const manrope = Manrope({
  subsets: ["latin"],
  variable: "--font-body",
  weight: ["400", "500", "600", "700", "800"]
});

const jetbrainsMono = JetBrains_Mono({
  subsets: ["latin"],
  variable: "--font-mono",
  weight: ["500", "600"]
});

export const metadata: Metadata = {
  title: "CASE | ArgoCD Read-Only Portal",
  description: "Modern ArgoCD-style read-only portal for ENDR"
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <body className={`${manrope.variable} ${jetbrainsMono.variable}`}>{children}</body>
    </html>
  );
}
