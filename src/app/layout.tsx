import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Pet Retail CRM",
  description: "CRM for managing independent pet food retailers"
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
