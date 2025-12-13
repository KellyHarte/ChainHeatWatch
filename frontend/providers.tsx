"use client";

import type { ReactNode } from "react";
import { MetaMaskProvider } from "./wallet/MetaMaskProvider";

export function Providers({ children }: { children: ReactNode }) {
  return (
    <MetaMaskProvider>
      {children}
    </MetaMaskProvider>
  );
}


