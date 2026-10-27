import type { Metadata } from "next";
import Link from "next/link";
import "./globals.css";

export const metadata: Metadata = {
  title: "ProofPay",
  description: "Catch print-order mistakes before you take the money.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>
        <header className="topbar">
          <Link href="/" className="brand">
            Proof<span>Pay</span>
          </Link>
          <span className="muted">AI pre-press check · PayPal checkout</span>
        </header>
        <main>{children}</main>
      </body>
    </html>
  );
}
