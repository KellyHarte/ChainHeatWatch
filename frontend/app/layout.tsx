import "./globals.css";
import type { ReactNode } from "react";
import { Providers } from "../providers";
import { Navbar } from "../components/Navbar";

export const metadata = {
  title: "ChainHeatWatch",
  description: "FHEVM-powered daily perceived temperature logs",
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <body>
        <Providers>
          <Navbar />
          {children}
        </Providers>
      </body>
    </html>
  );
}


