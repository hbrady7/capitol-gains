import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import Link from "next/link";
import "./globals.css";
import { ThemeToggle } from "@/components/ThemeToggle";
import { Toaster } from "@/components/Toaster";

const geistSans = Geist({ variable: "--font-geist-sans", subsets: ["latin"] });
const geistMono = Geist_Mono({ variable: "--font-geist-mono", subsets: ["latin"] });

export const metadata: Metadata = {
  title: "capitol-gains",
  description:
    "An honest little experiment: does an LLM trading on convergence between Congress and corporate insiders beat the market?",
};

const NAV = [
  { href: "/", label: "Today" },
  { href: "/scoreboard", label: "Scoreboard" },
  { href: "/journal", label: "Journal" },
  { href: "/settings", label: "Controls" },
];

// Set the theme class before paint to avoid a flash (warm-dark default).
const themeScript = `(function(){try{var t=localStorage.getItem('cg-theme')||'dark';document.documentElement.classList.add(t);}catch(e){document.documentElement.classList.add('dark');}})();`;

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeScript }} />
      </head>
      <body className={`${geistSans.variable} ${geistMono.variable} min-h-screen`}>
        <header className="sticky top-0 z-20 border-b border-[var(--border)] bg-[var(--bg)]/85 backdrop-blur">
          <div className="mx-auto flex h-16 max-w-6xl items-center gap-6 px-5">
            <Link href="/" className="flex items-center gap-2.5 font-semibold tracking-tight">
              <span className="inline-block h-2.5 w-2.5 rounded-full bg-[var(--accent)]" />
              capitol-gains
            </Link>
            <nav className="flex gap-1 text-sm">
              {NAV.map((n) => (
                <Link
                  key={n.href}
                  href={n.href}
                  className="rounded-lg px-3 py-1.5 muted transition-colors hover:bg-[var(--card-hover)] hover:text-[var(--text)]"
                >
                  {n.label}
                </Link>
              ))}
            </nav>
            <div className="ml-auto">
              <ThemeToggle />
            </div>
          </div>
        </header>
        <main className="mx-auto max-w-6xl px-5 py-8">{children}</main>
        <Toaster />
        <footer className="mx-auto max-w-6xl px-5 py-8 text-xs leading-relaxed faint">
          A personal experiment, not investment advice. Claude picks the trades from a blended
          Congress + corporate-insider signal; a deterministic safety layer can only shrink or stop an
          order, never start one. Paper mode is on by default.
        </footer>
      </body>
    </html>
  );
}
