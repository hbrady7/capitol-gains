import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import Link from "next/link";
import "./globals.css";
import { SummaryBar } from "@/components/SummaryBar";
import { Toaster } from "@/components/Toaster";

const geistSans = Geist({ variable: "--font-geist-sans", subsets: ["latin"] });
const geistMono = Geist_Mono({ variable: "--font-geist-mono", subsets: ["latin"] });

export const metadata: Metadata = {
  title: "capitol-gains",
  description: "Review surface for congressional-trade mirroring. The app never trades — Claude Code does, human-gated.",
};

const NAV = [
  { href: "/", label: "Review" },
  { href: "/scoreboard", label: "Scoreboard" },
  { href: "/journal", label: "Journal" },
  { href: "/settings", label: "Settings" },
];

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body className={`${geistSans.variable} ${geistMono.variable} antialiased min-h-screen`}>
        <header className="sticky top-0 z-20 border-b border-zinc-800/80 bg-zinc-950/80 backdrop-blur">
          <div className="mx-auto max-w-7xl px-5">
            <div className="flex h-14 items-center gap-6">
              <Link href="/" className="flex items-center gap-2 font-semibold tracking-tight">
                <span className="inline-block h-2.5 w-2.5 rounded-full bg-emerald-400" />
                capitol-gains
              </Link>
              <nav className="flex gap-1 text-sm">
                {NAV.map((n) => (
                  <Link
                    key={n.href}
                    href={n.href}
                    className="rounded-md px-3 py-1.5 text-zinc-400 transition-colors hover:bg-zinc-800/60 hover:text-zinc-100"
                  >
                    {n.label}
                  </Link>
                ))}
              </nav>
            </div>
            <SummaryBar />
          </div>
        </header>
        <main className="mx-auto max-w-7xl px-5 py-6">{children}</main>
        <Toaster />
        <footer className="mx-auto max-w-7xl px-5 py-6 text-xs leading-relaxed text-zinc-600">
          Review &amp; monitoring surface only — <strong className="text-zinc-500">this app never places trades.</strong>{" "}
          Claude Code, via the Robinhood Trading MCP, is the only executor, and only after you type a confirmation. The
          congressional signal is weeks-stale and the edge is thin. Not investment advice.
        </footer>
      </body>
    </html>
  );
}
