"use client";

import { useMetaMask } from "../wallet/MetaMaskProvider";
import { useEffect, useMemo, useState } from "react";
import { ethers } from "ethers";
import { createFhevmInstance } from "../fhevm/internal/fhevm";
import { FhevmDecryptionSignature } from "../fhevm/FhevmDecryptionSignature";
import { HeatLogManagerABI } from "../abi/HeatLogManagerABI";
import { HeatLogManagerAddresses } from "../abi/HeatLogManagerAddresses";
import { TemperatureChart } from "./TemperatureChart";

interface HeatLog {
  ts: number;
  mood: string;
  value?: number;
  handle?: string;
}

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

export function HistoryPage() {
  const { provider, chainId, account, isConnected } = useMetaMask();
  const [instance, setInstance] = useState<any | undefined>(undefined);
  const [myLogs, setMyLogs] = useState<HeatLog[]>([]);
  const [message, setMessage] = useState<string>("");
  const [chartPeriod, setChartPeriod] = useState<"7d" | "30d" | "365d">("7d");

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

  const canDecrypt = isConnected && instance && contract && myLogs.length > 0;

  async function fetchMyLogs() {
    if (!provider || !account || !contract) return;
    try {
      setMessage("📥 Fetching your logs...");
      const bp = new ethers.BrowserProvider(provider);
      const ro = bp as unknown as ethers.ContractRunner;
      const c = new ethers.Contract(contract.address, contract.abi, ro);
      const logs = await c.getEncryptedLogs(account);
      setMyLogs(logs.map((l: any) => ({ ts: Number(l.timestamp), mood: l.mood, value: undefined, handle: l.temp })));
      setMessage("✅ Logs refreshed");
    } catch (error: any) {
      setMessage(`❌ Failed to fetch logs: ${error?.message || "Unknown error"}`);
    }
  }

  async function decryptMyLogs(forceResign: boolean = false) {
    if (!provider || !account || !instance || !contract || myLogs.length === 0) return;
    try {
      const bp = new ethers.BrowserProvider(provider);
      const signer = await bp.getSigner();
      const storage = {
        getItem: (k: string) => localStorage.getItem(k),
        setItem: (k: string, v: string) => localStorage.setItem(k, v),
        removeItem: (k: string) => localStorage.removeItem(k),
      };

      // 如果强制重新签名，先清除缓存
      if (forceResign) {
        try {
          const user = (await signer.getAddress()) as `0x${string}`;
          const sorted = [contract.address].sort();
          const emptyEip712 = instance.createEIP712(ethers.ZeroAddress, sorted as `0x${string}`[], 0, 0);
          const hash = ethers.TypedDataEncoder.hash(
            emptyEip712.domain,
            { UserDecryptRequestVerification: emptyEip712.types.UserDecryptRequestVerification },
            emptyEip712.message
          );
          const cacheKey = `${user}:${hash}`;
          await storage.removeItem(cacheKey);
          setMessage("🗑️ Cache cleared, requesting new signature...");
        } catch (e) {
          console.error("Failed to clear cache:", e);
        }
      }

      // 检查是否有缓存的签名（仅在非强制重新签名时）
      if (!forceResign) {
        try {
          const user = (await signer.getAddress()) as `0x${string}`;
          const sorted = [contract.address].sort();
          const emptyEip712 = instance.createEIP712(ethers.ZeroAddress, sorted as `0x${string}`[], 0, 0);
          const hash = ethers.TypedDataEncoder.hash(
            emptyEip712.domain,
            { UserDecryptRequestVerification: emptyEip712.types.UserDecryptRequestVerification },
            emptyEip712.message
          );
          const cacheKey = `${user}:${hash}`;
          const cached = await storage.getItem(cacheKey);
          if (cached) {
            try {
              const obj = JSON.parse(cached);
              const now = Math.floor(Date.now() / 1000);
              if (now < obj.startTimestamp + obj.durationDays * 24 * 60 * 60) {
                // 有有效的缓存签名，直接使用
                setMessage("🔓 Using cached signature, decrypting your data locally...");
                // 直接使用缓存的签名进行解密
                const pairs = myLogs.map((l) => ({ handle: l.handle as `0x${string}`, contractAddress: contract.address }));
                const res = await instance.userDecrypt(
                  pairs,
                  obj.privateKey,
                  obj.publicKey,
                  obj.signature,
                  obj.contractAddresses,
                  obj.userAddress,
                  obj.startTimestamp,
                  obj.durationDays
                );
                const next = myLogs.map((l) => ({ ...l, value: Number(res[l.handle as string]) }));
                setMyLogs(next);
                setMessage("✅ Decrypted successfully! (using cached signature)");
                return;
              }
            } catch (e) {
              // 缓存无效，继续签名流程
              console.error("Invalid cache:", e);
            }
          }
        } catch (e) {
          // 检查失败，继续签名流程
          console.error("Cache check failed:", e);
        }
      }

      // 需要签名（首次或强制重新签名）
      setMessage("✍️ Please sign the decryption request in MetaMask...");
      const sig = await FhevmDecryptionSignature.loadOrSign(
        instance,
        [contract.address],
        signer,
        storage
      );
      if (!sig) {
        setMessage("❌ Signature failed or was cancelled");
        return;
      }
      setMessage("🔓 Decrypting your data locally...");
      const pairs = myLogs.map((l) => ({ handle: l.handle as `0x${string}`, contractAddress: contract.address }));
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
      const next = myLogs.map((l) => ({ ...l, value: Number(res[l.handle as string]) }));
      setMyLogs(next);
      setMessage("✅ Decrypted successfully!");
    } catch (error: any) {
      console.error("Decrypt error:", error);
      if (error?.message?.includes("User rejected") || error?.message?.includes("cancelled") || error?.code === 4001) {
        setMessage("❌ Signature cancelled by user");
      } else {
        setMessage(`❌ Decryption failed: ${error?.message || "Unknown error"}`);
      }
    }
  }

  useEffect(() => {
    if (isConnected && account && contract) {
      fetchMyLogs();
    }
  }, [isConnected, account, contract]);

  const chartData = useMemo(() => {
    const decryptedLogs = myLogs.filter((l) => l.value !== undefined).sort((a, b) => a.ts - b.ts);
    return decryptedLogs.map((log) => ({
      date: new Date(log.ts * 1000).toISOString(),
      value: log.value!,
      mood: log.mood,
    }));
  }, [myLogs]);

  if (!isConnected) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-orange-400 via-red-500 via-purple-500 to-blue-500 flex items-center justify-center p-4">
        <GlassCard title="🔐 Wallet Required">
          <div className="text-center py-8">
            <p className="text-xl text-gray-700 mb-6">Please connect your wallet to view your history.</p>
            <p className="text-gray-600">Use the Connect Wallet button in the navigation bar.</p>
          </div>
        </GlassCard>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-orange-400 via-red-500 via-purple-500 to-blue-500 p-4 md:p-8">
      <div className="max-w-7xl mx-auto space-y-6">
        <GlassCard title="📊 Your Temperature History">
          <div className="mb-6">
            <div className="flex gap-3 flex-wrap">
              <button
                onClick={fetchMyLogs}
                className="px-5 py-2 rounded-xl bg-gradient-to-r from-blue-500 to-blue-600 text-white font-bold shadow-lg hover:scale-105 transition-all"
              >
                🔄 Refresh
              </button>
              <button
                disabled={!canDecrypt}
                onClick={() => decryptMyLogs(false)}
                className="px-5 py-2 rounded-xl bg-gradient-to-r from-purple-500 to-purple-600 text-white font-bold shadow-lg hover:scale-105 transition-all disabled:opacity-50 disabled:cursor-not-allowed"
              >
                🔓 Decrypt Locally
              </button>
              <button
                disabled={!canDecrypt}
                onClick={() => decryptMyLogs(true)}
                className="px-5 py-2 rounded-xl bg-gradient-to-r from-orange-500 to-red-600 text-white font-bold shadow-lg hover:scale-105 transition-all disabled:opacity-50 disabled:cursor-not-allowed"
                title="Clear cached signature and sign again"
              >
                ✍️ Re-sign & Decrypt
              </button>
            </div>
            <div className="mt-2 text-sm text-gray-600">
              <span>💡 Tip: </span>
              <span>"Decrypt Locally" uses cached signature if available. Use "Re-sign & Decrypt" to sign again in MetaMask.</span>
            </div>
          </div>

          <TemperatureChart data={chartData} period={chartPeriod} onPeriodChange={setChartPeriod} />

          {/* 日志列表 */}
          {myLogs.length > 0 ? (
            <div className="mt-8">
              <h3 className="text-xl font-bold text-gray-700 mb-4">All Logs</h3>
              <div className="space-y-3 max-h-96 overflow-y-auto">
                {myLogs
                  .sort((a, b) => b.ts - a.ts)
                  .map((log, i) => (
                    <div
                      key={i}
                      className="flex items-center justify-between p-4 bg-gray-50 rounded-xl border border-gray-200 hover:shadow-md transition-shadow"
                    >
                      <div className="flex items-center gap-4">
                        <span className="text-3xl">{log.mood}</span>
                        <div>
                          <div className="text-gray-700 font-semibold">
                            {new Date(log.ts * 1000).toLocaleString()}
                          </div>
                          {log.value !== undefined && (
                            <div className="text-sm text-gray-500">
                              {log.ts > 0 ? new Date(log.ts * 1000).toLocaleDateString() : "N/A"}
                            </div>
                          )}
                        </div>
                      </div>
                      <span className="font-mono font-bold text-2xl text-orange-600">
                        {log.value !== undefined ? `${log.value}°C` : "🔒 Encrypted"}
                      </span>
                    </div>
                  ))}
              </div>
            </div>
          ) : (
            <div className="text-center py-12 text-gray-500">
              <div className="text-6xl mb-4">📜</div>
              <p className="text-xl">No logs yet. Submit your first temperature log to get started!</p>
            </div>
          )}
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

