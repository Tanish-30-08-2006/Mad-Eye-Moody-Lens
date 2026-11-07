import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Deepfake Detection Studio",
  description: "A modular workspace for research-backed image detection models.",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="en"><body>{children}</body></html>;
}
