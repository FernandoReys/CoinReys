import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "CoinReys | Sua vida financeira no controle",
  description: "Ganhos, contas, metas e decisões financeiras em um só lugar.",
  icons: { icon: "/favicon.svg", shortcut: "/favicon.svg" },
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="pt-BR"><body>{children}</body></html>;
}
