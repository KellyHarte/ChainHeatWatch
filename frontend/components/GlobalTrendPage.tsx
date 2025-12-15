"use client";

import { useMetaMask } from "../wallet/MetaMaskProvider";
import { useEffect, useMemo, useState } from "react";
import { ethers } from "ethers";
import { createFhevmInstance } from "../fhevm/internal/fhevm";
import { FhevmDecryptionSignature } from "../fhevm/FhevmDecryptionSignature";
import { HeatLogManagerABI } from "../abi/HeatLogManagerABI";
import { HeatLogManagerAddresses } from "../abi/HeatLogManagerAddresses";

function GlassCard({ title, children, className = "" }: { title: string; children: React.ReactNode; className?: string }) {
  return (
    <div className={`bg-white/80 backdrop-blur-lg rounded-3xl border border-white/20 shadow-2xl p-8 ${className}`}>
      <h2 className="text-3xl font-black mb-6 bg-gradient-to-r from-orange-600 to-red-600 bg-clip-text text-transparent">
        {title}
      </h2>
      {children}
    </div>
  );
}

export function GlobalTrendPage() {
  const { provider, chainId, account, isConnected } = useMetaMask();
  const [instance, setInstance] = useState<any | undefined>(undefined);
  const [globalAvg, setGlobalAvg] = useState<string>("n/a");
  const [globalCount, setGlobalCount] = useState<number>(0);
  const [message, setMessage] = useState<string>("");
  const [myLogs, setMyLogs] = useState<Array<{ ts: number; value?: number }>>([]);

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
    createFhevmInstance({
      provider,
      mockChains: { 31337: "http://localhost:8545" },
      signal: controller.signal,
      onStatusChange: () => {},
    })
      .then((i) => {
        if (!controller.signal.aborted) {
          setInstance(i);
        }
      })
      .catch((e) => {
        if (e.name !== "FhevmAbortError" && !controller.signal.aborted) {
          setMessage(`❌ Failed to initialize: ${e.message || String(e)}`);
        }
      });
    return () => controller.abort();
  }, [provider, chainId]);

  async function fetchGlobal() {
    if (!provider || !account || !instance || !contract) return;
    try {
      setMessage("🔐 Authorizing global data access...");
      const bp = new ethers.BrowserProvider(provider);
      const signer = await bp.getSigner();
      const c = new ethers.Contract(contract.address, contract.abi, signer);
      const tx = await c.authorizeGlobalDecrypt();
      await tx.wait();
      const enc = await c.getEncryptedGlobalSum();
      const cnt = await c.getGlobalCount();
      setGlobalCount(Number(cnt));
      setMessage("🔓 Decrypting global average...");
      const sig = await FhevmDecryptionSignature.loadOrSign(
        instance,
        [contract.address],
        signer,
        {
          getItem: (k) => localStorage.getItem(k),
          setItem: (k, v) => localStorage.setItem(k, v),
          removeItem: (k) => localStorage.removeItem(k),
        }
      );
      if (!sig) {
        setMessage("❌ Signature failed");
        return;
      }
      const res = await instance.userDecrypt(
        [{ handle: enc as `0x${string}`, contractAddress: contract.address }],
        sig.privateKey,
        sig.publicKey,
        sig.signature,
        sig.contractAddresses,
        sig.userAddress,
        sig.startTimestamp,
        sig.durationDays
      );
      const sum = Number(res[enc as string] ?? 0);
      const avg = Number(cnt) === 0 ? 0 : sum / Number(cnt);
      setGlobalAvg(avg.toFixed(2));
      
      if (avg >= 32) {
        setMessage(`🔥 Heatwave Alert! Global average: ${avg.toFixed(2)}°C (${cnt} submissions)`);
      } else {
        setMessage(`✅ Global average: ${avg.toFixed(2)}°C (${cnt} submissions)`);
      }
    } catch (error: any) {
      console.error("Fetch global error:", error);
      setMessage(`❌ Failed to fetch global average: ${error?.message || "Unknown error"}`);
    }
  }

  async function fetchMyLogs() {
    if (!provider || !account || !contract) return;
    try {
      const bp = new ethers.BrowserProvider(provider);
      const ro = bp as unknown as ethers.ContractRunner;
      const c = new ethers.Contract(contract.address, contract.abi, ro);
      const logs = await c.getEncryptedLogs(account);
      setMyLogs(logs.map((l: any) => ({ ts: Number(l.timestamp), value: undefined })));
      
      // 解密个人日志用于对比
      if (instance) {
        const signer = await new ethers.BrowserProvider(provider).getSigner();
        const sig = await FhevmDecryptionSignature.loadOrSign(
          instance,
          [contract.address],
          signer,
          {
            getItem: (k) => localStorage.getItem(k),
            setItem: (k, v) => localStorage.setItem(k, v),
            removeItem: (k) => localStorage.removeItem(k),
          }
        );
        if (sig) {
          const pairs = logs.map((l: any) => ({ handle: l.temp as `0x${string}`, contractAddress: contract.address }));
          const res = await instance.userDecrypt(
            pairs,
            sig.privateKey,
            sig.publicKey,
            sig.signature,
            sig.contractAddresses,
            sig.userAddress,
            sig.startTimestamp,
            sig.durationDays
          );
          setMyLogs(logs.map((l: any, i: number) => ({ ts: Number(l.timestamp), value: Number(res[l.temp as string]) })));
        }
      }
    } catch (e) {
      console.error("Failed to fetch my logs:", e);
    }
  }

  useEffect(() => {
    if (isConnected && account && contract && instance) {
      fetchMyLogs();
    }
  }, [isConnected, account, contract, instance]);

  const comparisonText = useMemo(() => {
    if (globalAvg === "n/a" || myLogs.length === 0 || !myLogs.every((l) => l.value !== undefined)) return null;
    const myAvg = myLogs.reduce((sum, d) => sum + (d.value || 0), 0) / myLogs.length;
    const diff = myAvg - parseFloat(globalAvg);
    if (Math.abs(diff) < 1) return "You're right at the average!";
    if (diff > 0) return `You're ${diff.toFixed(1)}°C warmer than average!`;
    return `You're ${Math.abs(diff).toFixed(1)}°C cooler than average!`;
  }, [globalAvg, myLogs]);

  if (!isConnected) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-orange-400 via-red-500 via-purple-500 to-blue-500 flex items-center justify-center p-4">
        <GlassCard title="🔐 Wallet Required">
          <div className="text-center py-8">
            <p className="text-xl text-gray-700 mb-6">Please connect your wallet to view global trends.</p>
            <p className="text-gray-600">Use the Connect Wallet button in the navigation bar.</p>
          </div>
        </GlassCard>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-orange-400 via-red-500 via-purple-500 to-blue-500 p-4 md:p-8">
      <div className="max-w-6xl mx-auto space-y-6">
        <GlassCard title="🌍 Anonymous Global Trend">
          <div className="space-y-6">
            {/* 主要统计 */}
            <div className="text-center py-8">
              {globalAvg !== "n/a" ? (
                <div>
                  <div className="text-7xl font-black bg-gradient-to-r from-orange-600 to-red-600 bg-clip-text text-transparent mb-4">
                    {globalAvg}°C
                  </div>
                  <div className="text-xl text-gray-600 font-semibold mb-6">
                    Based on {globalCount} anonymous submissions
                  </div>
                  {globalAvg !== "n/a" && parseFloat(globalAvg) >= 32 && (
                    <div className="inline-block px-6 py-3 bg-red-100 border-3 border-red-400 rounded-xl text-red-800 font-bold text-lg mb-4">
                      🔥 Heatwave Alert!
                    </div>
                  )}
                  {comparisonText && (
                    <div className="mt-4 inline-block px-6 py-3 bg-blue-100 border-3 border-blue-400 rounded-xl text-blue-800 font-semibold">
                      {comparisonText}
                    </div>
                  )}
                </div>
              ) : (
                <div className="py-12">
                  <div className="text-6xl mb-4">🌍</div>
                  <div className="text-2xl text-gray-500 font-semibold mb-4">No global data available yet</div>
                  <p className="text-gray-600">Click the button below to fetch the anonymous global average temperature.</p>
                </div>
              )}
            </div>

            {/* 获取按钮 */}
            <div className="flex justify-center">
              <button
                onClick={fetchGlobal}
                className="px-8 py-4 rounded-xl bg-gradient-to-r from-indigo-500 to-purple-600 text-white font-black text-lg shadow-xl hover:scale-105 transition-all"
              >
                📈 Get Global Average
              </button>
            </div>

            {/* 说明 */}
            <div className="bg-blue-50 border-2 border-blue-200 rounded-xl p-6">
              <h3 className="font-bold text-blue-900 mb-2">🔒 Privacy Protection</h3>
              <p className="text-blue-800 text-sm">
                All temperature data is encrypted using FHEVM. The global average is computed on encrypted data,
                and only the final result is decrypted. Your personal data remains completely private.
              </p>
            </div>
          </div>
        </GlassCard>

        {message && (
          <div className="bg-white/90 backdrop-blur-lg rounded-2xl p-4 shadow-xl border-2 border-gray-200">
            <div className="font-semibold text-gray-800">{message}</div>
          </div>
        )}
      </div>
    </div>
  );
}

