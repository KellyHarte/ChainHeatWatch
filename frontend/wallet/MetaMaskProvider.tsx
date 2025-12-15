"use client";

import { createContext, useCallback, useContext, useEffect, useRef, useState } from "react";
import type { ReactNode } from "react";
import { ethers } from "ethers";

export type MetaMaskContextState = {
  provider: ethers.Eip1193Provider | undefined;
  chainId: number | undefined;
  account: `0x${string}` | undefined;
  isConnected: boolean;
  connect: () => void;
};

const MetaMaskContext = createContext<MetaMaskContextState | undefined>(undefined);

export function MetaMaskProvider({ children }: { children: ReactNode }) {
  const [provider, setProvider] = useState<ethers.Eip1193Provider | undefined>(undefined);
  const [chainId, setChainId] = useState<number | undefined>(undefined);
  const [account, setAccount] = useState<`0x${string}` | undefined>(undefined);

  const connect = useCallback(() => {
    if (!provider) return;
    provider.request({ method: "eth_requestAccounts" });
  }, [provider]);

  useEffect(() => {
    const anyWin = window as any;
    const eth = anyWin?.ethereum as ethers.Eip1193Provider | undefined;
    if (!eth) return;
    setProvider(eth);
  }, []);

  useEffect(() => {
    if (!provider) return;
    let active = true;
    const sync = async () => {
      try {
        const [cidHex, accounts] = await Promise.all([
          provider.request({ method: "eth_chainId" }),
          provider.request({ method: "eth_accounts" }),
        ]);
        if (!active) return;
        setChainId(parseInt(cidHex as string, 16));
        setAccount((accounts as string[])[0] as `0x${string}` | undefined);
      } catch {
        //
      }
    };
    sync();

    const onChainChanged = (cid: string) => setChainId(parseInt(cid, 16));
    const onAccountsChanged = (accs: string[]) => setAccount((accs[0] ?? undefined) as `0x${string}` | undefined);

    (provider as any).on?.("chainChanged", onChainChanged);
    (provider as any).on?.("accountsChanged", onAccountsChanged);
    return () => {
      active = false;
      (provider as any).removeListener?.("chainChanged", onChainChanged);
      (provider as any).removeListener?.("accountsChanged", onAccountsChanged);
    };
  }, [provider]);

  return (
    <MetaMaskContext.Provider
      value={{
        provider,
        chainId,
        account,
        isConnected: Boolean(provider && chainId && account),
        connect,
      }}
    >
      {children}
    </MetaMaskContext.Provider>
  );
}

export function useMetaMask() {
  const ctx = useContext(MetaMaskContext);
  if (!ctx) throw new Error("useMetaMask must be used within MetaMaskProvider");
  return ctx;
}






