import type { Metadata } from "next";
import { Space_Mono } from "next/font/google";
import "./globals.css";

const spaceMono = Space_Mono({
  variable: "--font-mono",
  subsets: ["latin"],
  weight: ["400", "700"],
});

export const metadata: Metadata = {
  title: "DataQuest — Gaming & Mental Health Analysis",
  description: "Discover your gamer archetype and mental health insights powered by machine learning.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className={`${spaceMono.variable} h-full`}>
      <body className="min-h-full bg-black text-white">{children}</body>
    </html>
  );
}
