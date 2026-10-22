import type { Metadata, Viewport } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import { brand } from "@/lib/config/brand";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: { default: brand.name, template: `%s · ${brand.name}` },
  description: brand.description,
};

// viewportFit "cover" lets the bottom tab bar pad for the iPhone home indicator.
export const viewport: Viewport = { viewportFit: "cover" };

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang="en-IN"
      className={`${geistSans.variable} ${geistMono.variable} h-full scroll-pt-16 scroll-pb-28 antialiased md:scroll-pb-0`}
    >
      <body className="flex min-h-full flex-col">{children}</body>
    </html>
  );
}
