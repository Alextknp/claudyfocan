import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Claudy Focan — Veille AO Bâtiment",
  description: "Outil de veille et d'analyse d'appels d'offres publics bâtiment",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="fr">
      <body>{children}</body>
    </html>
  );
}
