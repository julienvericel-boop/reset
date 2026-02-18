import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Reset",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="fr">
      <body className="antialiased min-h-screen">
        {children}
      </body>
    </html>
  );
}
