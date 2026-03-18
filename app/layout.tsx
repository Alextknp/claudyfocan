import type { Metadata } from "next";
import "./globals.css";
import Footer from "@/app/components/footer";

export const metadata: Metadata = {
  title: "Mr. Claudy Focan — Veille AO Bâtiment",
  description: "Outil de veille et d'analyse d'appels d'offres publics bâtiment — Hérault (34)",
  icons: {
    icon: "/favicon.png",
    apple: "/apple-touch-icon.png",
  },
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="fr">
      <body>
        {children}
        <Footer />
      </body>
    </html>
  );
}
