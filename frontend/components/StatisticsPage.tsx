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

export function StatisticsPage() {
  const { provider, chainId, account, isConnected } = useMetaMask();
  const [instance, setInstance] = useState<any | undefined>(undefined);
  const [myLogs, setMyLogs] = useState<HeatLog[]>([]);
  const [message, setMessage] = useState<string>("");
  const [selectedPeriod, setSelectedPeriod] = useState<"7d" | "30d" | "365d">("30d");

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
        // 忽略正常的取消操作
        if (e.name !== "FhevmAbortError" && !controller.signal.aborted) {
          setMessage(`❌ Failed to initialize: ${e.message || String(e)}`);
        }
      });
    return () => controller.abort();
  }, [provider, chainId]);

  async function fetchMyLogs() {
    if (!provider || !account || !contract) return;
    try {
      setMessage("📥 Fetching your logs...");
      const bp = new ethers.BrowserProvider(provider);
      const ro = bp as unknown as ethers.ContractRunner;
      const c = new ethers.Contract(contract.address, contract.abi, ro);
      const logs = await c.getEncryptedLogs(account);
      setMyLogs(logs.map((l: any) => ({ ts: Number(l.timestamp), mood: l.mood, value: undefined, handle: l.temp })));
    } catch (error: any) {
      setMessage(`❌ Failed to fetch logs: ${error?.message || "Unknown error"}`);
    }
  }

  async function decryptMyLogs() {
    if (!provider || !account || !instance || !contract || myLogs.length === 0) return;
    try {
      setMessage("🔓 Decrypting...");
      const bp = new ethers.BrowserProvider(provider);
      const signer = await bp.getSigner();
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
      if (!sig) return;
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
      setMessage("✅ Statistics ready");
    } catch (error: any) {
      setMessage(`❌ Failed: ${error?.message || "Unknown error"}`);
    }
  }

  useEffect(() => {
    if (isConnected && account && contract) {
      fetchMyLogs();
    }
  }, [isConnected, account, contract]);

  useEffect(() => {
    if (isConnected && myLogs.length > 0 && myLogs.some((l) => l.value === undefined) && instance) {
      decryptMyLogs();
    }
  }, [isConnected, myLogs.length]);

  const chartData = useMemo(() => {
    const decryptedLogs = myLogs.filter((l) => l.value !== undefined).sort((a, b) => a.ts - b.ts);
    const now = Date.now();
    const periodMs = selectedPeriod === "7d" ? 7 * 24 * 60 * 60 * 1000 : selectedPeriod === "30d" ? 30 * 24 * 60 * 60 * 1000 : 365 * 24 * 60 * 60 * 1000;
    const filtered = decryptedLogs.filter((log) => log.ts * 1000 > now - periodMs);
    return filtered.map((log) => ({
      date: new Date(log.ts * 1000).toISOString(),
      value: log.value!,
      mood: log.mood,
    }));
  }, [myLogs, selectedPeriod]);

  const stats = useMemo(() => {
    if (chartData.length === 0) return null;
    const values = chartData.map((d) => d.value);
    const sum = values.reduce((a, b) => a + b, 0);
    const avg = sum / values.length;
    const min = Math.min(...values);
    const max = Math.max(...values);
    const variance = values.reduce((acc, v) => acc + Math.pow(v - avg, 2), 0) / values.length;
    const stdDev = Math.sqrt(variance);

    return { avg, min, max, count: values.length, stdDev };
  }, [chartData]);

  if (!isConnected) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-orange-400 via-red-500 via-purple-500 to-blue-500 flex items-center justify-center p-4">
        <GlassCard title="🔐 Wallet Required">
          <div className="text-center py-8">
            <p className="text-xl text-gray-700 mb-6">Please connect your wallet to view statistics.</p>
            <p className="text-gray-600">Use the Connect Wallet button in the navigation bar.</p>
          </div>
        </GlassCard>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-orange-400 via-red-500 via-purple-500 to-blue-500 p-4 md:p-8">
      <div className="max-w-7xl mx-auto space-y-6">
        <GlassCard title="📈 Temperature Statistics">
          {/* 时间段选择 */}
          <div className="mb-6 flex gap-3">
            {(["7d", "30d", "365d"] as const).map((period) => (
              <button
                key={period}
                onClick={() => setSelectedPeriod(period)}
                className={`px-6 py-3 rounded-xl font-bold transition-all ${
                  selectedPeriod === period
                    ? "bg-gradient-to-r from-orange-500 to-red-600 text-white shadow-lg scale-105"
                    : "bg-gray-200 text-gray-700 hover:bg-gray-300"
                }`}
              >
                {period === "7d" ? "Last 7 Days" : period === "30d" ? "Last 30 Days" : "Last Year"}
              </button>
            ))}
          </div>

          {/* 统计卡片 */}
          {stats && (
            <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-6">
              <div className="bg-gradient-to-br from-blue-50 to-blue-100 rounded-xl p-6 border-2 border-blue-200">
                <div className="text-sm text-blue-600 font-semibold mb-2">Average</div>
                <div className="text-3xl font-black text-blue-800">{stats.avg.toFixed(1)}°C</div>
              </div>
              <div className="bg-gradient-to-br from-red-50 to-red-100 rounded-xl p-6 border-2 border-red-200">
                <div className="text-sm text-red-600 font-semibold mb-2">Highest</div>
                <div className="text-3xl font-black text-red-800">{stats.max}°C</div>
              </div>
              <div className="bg-gradient-to-br from-blue-50 to-blue-100 rounded-xl p-6 border-2 border-blue-200">
                <div className="text-sm text-blue-600 font-semibold mb-2">Lowest</div>
                <div className="text-3xl font-black text-blue-800">{stats.min}°C</div>
              </div>
              <div className="bg-gradient-to-br from-purple-50 to-purple-100 rounded-xl p-6 border-2 border-purple-200">
                <div className="text-sm text-purple-600 font-semibold mb-2">Records</div>
                <div className="text-3xl font-black text-purple-800">{stats.count}</div>
              </div>
            </div>
          )}

          {/* 趋势图 */}
          <TemperatureChart data={chartData} period={selectedPeriod} />

          {/* 波动程度 */}
          {stats && (
            <div className="mt-6 p-6 bg-gray-50 rounded-xl">
              <h3 className="text-lg font-bold text-gray-700 mb-3">Temperature Variability</h3>
              <div className="space-y-2">
                <div className="flex justify-between text-sm text-gray-600">
                  <span>Standard Deviation</span>
                  <span className="font-bold">{stats.stdDev.toFixed(2)}°C</span>
                </div>
                <div className="w-full bg-gray-200 rounded-full h-4 overflow-hidden">
                  <div
                    className="bg-gradient-to-r from-orange-400 to-red-500 h-full transition-all duration-500"
                    style={{ width: `${Math.min((stats.stdDev / 10) * 100, 100)}%` }}
                  ></div>
                </div>
                <div className="text-xs text-gray-500">
                  {stats.stdDev < 3 ? "Low variability" : stats.stdDev < 6 ? "Moderate variability" : "High variability"}
                </div>
              </div>
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

