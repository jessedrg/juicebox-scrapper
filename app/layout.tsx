import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Juicebox LinkedIn Resolver",
  description: "Resolve Juicebox search results to real LinkedIn profile URLs",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="es">
      <body className="bg-slate-950 text-slate-200 min-h-screen antialiased">
        {children}
      </body>
    </html>
  );
}
