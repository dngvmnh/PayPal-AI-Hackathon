import type { Metadata } from "next";
import { Space_Grotesk } from "next/font/google";
import Link from "next/link";
import "./globals.css";

const sans = Space_Grotesk({ subsets: ["latin"], variable: "--font-sans", display: "swap" });

export const metadata: Metadata = {
  title: "ProofPay",
  description: "Catch mistakes in custom t-shirt orders before the customer pays.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={sans.variable}>
      <body>
        <header className="topbar">
          <Link href="/" className="brand">
            Proof<span>Pay</span>
          </Link>
          <span className="tagline">Custom t-shirt orders, checked before payment</span>
          <nav className="topnav">
            <span className="pill warning">PayPal sandbox</span>
            <Link href="/orders/new" className="button small">
              New order
            </Link>
          </nav>
        </header>
        <main>{children}</main>
        <footer className="footer">
          AI-assisted verification backed by merchant and customer confirmation. PayPal sandbox only; no real money moves.
        </footer>
      </body>
    </html>
  );
}
