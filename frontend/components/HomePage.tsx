"use client";

import { useMetaMask } from "../wallet/MetaMaskProvider";
import { useEffect, useMemo, useState } from "react";
import { ethers } from "ethers";
import { createFhevmInstance } from "../fhevm/internal/fhevm";
import { HeatLogManagerABI } from "../abi/HeatLogManagerABI";
import { HeatLogManagerAddresses } from "../abi/HeatLogManagerAddresses";
import Link from "next/link";

function GlassCard({ title, children, className = "", href }: { title: string; children: React.ReactNode; className?: string; href?: string }) {
  const content = (
    <div className={`bg-white/80 backdrop-blur-lg rounded-3xl border border-white/20 shadow-2xl p-6 ${className}`}>
      <h2 className="text-2xl font-black mb-4 bg-gradient-to-r from-orange-600 to-red-600 bg-clip-text text-transparent">
        {title}
      </h2>
      {children}
    </div>
  );

  if (href) {
    return (
      <Link href={href} className="block hover:scale-105 transition-transform">
        {content}
      </Link>
    );
  }
  return content;
}

export function HomePage() {
  const { provider, chainId, account, isConnected } = useMetaMask();
  const [status, setStatus] = useState<string>("idle");
  const [instance, setInstance] = useState<any | undefined>(undefined);
  const [myLogs, setMyLogs] = useState<number>(0);
  const [globalAvg, setGlobalAvg] = useState<string>("n/a");
  const [points, setPoints] = useState<number>(0);

  const contract = useMemo(() => {
    if (!chainId) return undefined;
    const addrEntry = (HeatLogManagerAddresses as any)[String(chainId)];
    if (!addrEntry || !addrEntry.address || addrEntry.address === ethers.ZeroAddress) return undefined;
    return { address: addrEntry.address as `0x${string}`, abi: HeatLogManagerABI.abi };
  }, [chainId]);

  useEffect(() => {
    setInstance(undefined);
    if (!provider || !chainId) return;
    const controller = new AbortController();
    setStatus("creating");
    createFhevmInstance({
      provider,
      mockChains: { 31337: "http://localhost:8545" },
      signal: controller.signal,
      onStatusChange: (s) => setStatus(s),
    })
      .then((i) => {
        setInstance(i);
        setStatus("ready");
      })
      .catch(() => {
        setStatus("error");
      });
    return () => controller.abort();
  }, [provider, chainId]);

  useEffect(() => {
    if (isConnected && account && contract) {
      const fetchData = async () => {
        try {
          const bp = new ethers.BrowserProvider(provider!);
          const ro = bp as unknown as ethers.ContractRunner;
          const c = new ethers.Contract(contract.address, contract.abi, ro);
          const logs = await c.getEncryptedLogs(account);
          setMyLogs(logs.length);
          const pts = await c.points(account);
          setPoints(Number(pts));
          
          // Try to get global average (may fail if not authorized)
          try {
            const enc = await c.getEncryptedGlobalSum();
            const cnt = await c.getGlobalCount();
            if (Number(cnt) > 0) {
              // We can't decrypt here without signature, so just show count
              setGlobalAvg(`${Number(cnt)} submissions`);
            }
          } catch (e) {
            // Ignore
          }
        } catch (e) {
          console.error("Failed to fetch data:", e);
        }
      };
      fetchData();
    }
  }, [isConnected, account, contract, provider]);

  return (
    <div className="min-h-screen bg-gradient-to-br from-orange-400 via-red-500 via-purple-500 to-blue-500 p-4 md:p-8">
      <div className="max-w-7xl mx-auto space-y-6">
        {/* 欢迎区域 */}
        <div className="text-center mb-8">
          <h1 className="text-6xl md:text-7xl font-black text-white drop-shadow-2xl mb-4 tracking-tight">
            ChainHeatWatch
          </h1>
          <p className="text-xl text-white/90 font-semibold drop-shadow-lg mb-6">
            🔐 FHEVM encrypted daily perceived temperature · No backend
          </p>
          <div className="flex items-center justify-center gap-3 flex-wrap">
            <div className={`px-6 py-3 rounded-full font-bold text-white shadow-xl ${
              status === "ready" ? "bg-green-500" : status === "error" ? "bg-red-500" : "bg-gray-500"
            }`}>
              Status: {status}
            </div>
            {isConnected && (
              <div className="px-6 py-3 rounded-full bg-gradient-to-r from-green-500 to-emerald-600 text-white font-bold shadow-xl">
                ✓ Connected {account?.slice(0, 6)}...{account?.slice(-4)}
              </div>
            )}
          </div>
        </div>

        {/* 快速统计 */}
        {isConnected && (
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            <GlassCard title="📊 Your Records">
              <div className="text-4xl font-black text-orange-600 mb-2">{myLogs}</div>
              <div className="text-gray-600">Total submissions</div>
            </GlassCard>
            <GlassCard title="⭐ Points">
              <div className="text-4xl font-black text-purple-600 mb-2">{points}</div>
              <div className="text-gray-600">Contribution score</div>
            </GlassCard>
            <GlassCard title="🌍 Global Activity">
              <div className="text-4xl font-black text-blue-600 mb-2">{globalAvg}</div>
              <div className="text-gray-600">Community participation</div>
            </GlassCard>
          </div>
        )}

        {/* 功能卡片 */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <GlassCard title="🌡️ Submit Temperature" href="/submit">
            <p className="text-gray-700 mb-4">
              Record your daily perceived temperature. Each submission is encrypted and stored on-chain.
            </p>
            <div className="flex items-center text-orange-600 font-bold">
              Go to Submit →
            </div>
          </GlassCard>

          <GlassCard title="📊 View History" href="/history">
            <p className="text-gray-700 mb-4">
              View your temperature history with interactive charts. All decryption happens locally in your browser.
            </p>
            <div className="flex items-center text-blue-600 font-bold">
              View History →
            </div>
          </GlassCard>

          <GlassCard title="📈 Statistics" href="/statistics">
            <p className="text-gray-700 mb-4">
              Analyze your temperature patterns with detailed statistics and trend analysis.
            </p>
            <div className="flex items-center text-purple-600 font-bold">
              View Statistics →
            </div>
          </GlassCard>

          <GlassCard title="🌍 Global Trend" href="/global">
            <p className="text-gray-700 mb-4">
              Explore anonymous global temperature trends. Privacy-preserved aggregation of all users' data.
            </p>
            <div className="flex items-center text-indigo-600 font-bold">
              View Global Trend →
            </div>
          </GlassCard>
        </div>

        {/* 功能介绍 */}
        {!isConnected && (
          <GlassCard title="🚀 Get Started">
            <div className="space-y-4 text-gray-700">
              <p className="text-lg">
                ChainHeatWatch is a privacy-preserving temperature logging DApp built with FHEVM technology.
              </p>
              <div className="space-y-2">
                <div className="flex items-start gap-3">
                  <span className="text-2xl">🔐</span>
                  <div>
                    <div className="font-bold">Encrypted Storage</div>
                    <div className="text-sm text-gray-600">Your temperature data is encrypted before being stored on-chain</div>
                  </div>
                </div>
                <div className="flex items-start gap-3">
                  <span className="text-2xl">📊</span>
                  <div>
                    <div className="font-bold">Local Decryption</div>
                    <div className="text-sm text-gray-600">Only you can decrypt your personal data, and it happens locally in your browser</div>
                  </div>
                </div>
                <div className="flex items-start gap-3">
                  <span className="text-2xl">🌍</span>
                  <div>
                    <div className="font-bold">Anonymous Aggregation</div>
                    <div className="text-sm text-gray-600">Global statistics are computed on encrypted data without revealing individual values</div>
                  </div>
                </div>
              </div>
              <div className="pt-4 text-center">
                <p className="text-gray-600 mb-4">Connect your wallet to get started!</p>
              </div>
            </div>
          </GlassCard>
        )}
      </div>
    </div>
  );
}





