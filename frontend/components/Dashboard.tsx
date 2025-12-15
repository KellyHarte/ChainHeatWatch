"use client";

import { useMetaMask } from "../wallet/MetaMaskProvider";
import { useEffect, useMemo, useState } from "react";
import { ethers } from "ethers";
import { createFhevmInstance } from "../fhevm/internal/fhevm";
import { FhevmDecryptionSignature } from "../fhevm/FhevmDecryptionSignature";
import { HeatLogManagerABI } from "../abi/HeatLogManagerABI";
import { HeatLogManagerAddresses } from "../abi/HeatLogManagerAddresses";
import { Thermometer } from "./Thermometer";
import { TemperatureChart } from "./TemperatureChart";

interface HeatLog {
  ts: number;
  mood: string;
  value?: number;
  handle?: string;
}

function GlassCard({ title, children, className = "" }: { title: string; children: React.ReactNode; className?: string }) {
  return (
    <div className={`bg-white/80 backdrop-blur-lg rounded-3xl border border-white/20 shadow-2xl p-6 ${className}`}>
      <h2 className="text-2xl font-black mb-4 bg-gradient-to-r from-orange-600 to-red-600 bg-clip-text text-transparent">
        {title}
      </h2>
      {children}
    </div>
  );
}

export function Dashboard() {
  const { provider, chainId, account, isConnected, connect } = useMetaMask();
  const [status, setStatus] = useState<string>("idle");
  const [message, setMessage] = useState<string>("");
  const [instance, setInstance] = useState<any | undefined>(undefined);

  const [temp, setTemp] = useState<number>(25);
  const [mood, setMood] = useState<string>("😊");
  const [showSuccessAnimation, setShowSuccessAnimation] = useState(false);

  const [myLogs, setMyLogs] = useState<HeatLog[]>([]);
  const [globalAvg, setGlobalAvg] = useState<string>("n/a");
  const [globalCount, setGlobalCount] = useState<number>(0);
  const [lastSubmitTime, setLastSubmitTime] = useState<number | null>(null);
  const [isSubmitting, setIsSubmitting] = useState<boolean>(false);
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
      .catch((e) => {
        setMessage(String(e));
        setStatus("error");
      });
    return () => controller.abort();
  }, [provider, chainId]);

  const canSubmit = isConnected && instance && contract && !isSubmitting;
  const canDecrypt = isConnected && instance && contract && myLogs.length > 0;

  // 计算冷却期
  const cooldownInfo = useMemo(() => {
    if (!lastSubmitTime || lastSubmitTime === 0) return { remaining: 0, canSubmit: true };
    const now = Math.floor(Date.now() / 1000);
    const elapsed = now - lastSubmitTime;
    const remaining = Math.max(0, 86400 - elapsed);
    return { remaining, canSubmit: remaining === 0 };
  }, [lastSubmitTime]);

  const formatCooldown = (seconds: number) => {
    const hours = Math.floor(seconds / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);
    const secs = seconds % 60;
    return `${hours}h ${minutes}m ${secs}s`;
  };

  async function checkLastSubmitTime() {
    if (!provider || !account || !contract) return;
    try {
      const bp = new ethers.BrowserProvider(provider);
      const ro = bp as unknown as ethers.ContractRunner;
      const c = new ethers.Contract(contract.address, contract.abi, ro);
      const lastTime = await c.lastSubmitTime(account);
      const ts = Number(lastTime);
      setLastSubmitTime(ts);
    } catch (e) {
      console.error("Failed to check last submit time:", e);
    }
  }

  useEffect(() => {
    if (isConnected && account && contract) {
      checkLastSubmitTime();
      const interval = setInterval(() => {
        checkLastSubmitTime();
      }, 1000);
      return () => clearInterval(interval);
    }
  }, [isConnected, account, contract]);

  async function submit() {
    if (!provider || !account || !instance || !contract || isSubmitting || !cooldownInfo.canSubmit) return;

    try {
      setIsSubmitting(true);
      setMessage("🔐 Encrypting your temperature...");
      const bp = new ethers.BrowserProvider(provider);
      const signer = await bp.getSigner();
      const input = instance.createEncryptedInput(contract.address, account);
      input.add16(temp);
      const enc = await input.encrypt();
      setMessage("📤 Submitting to blockchain...");
      const c = new ethers.Contract(contract.address, contract.abi, signer);
      const tx = await c.submitLog(enc.handles[0], enc.inputProof, mood);
      setMessage("⏳ Waiting for confirmation...");
      await tx.wait();
      setMessage("✅ Recorded successfully!");
      setShowSuccessAnimation(true);
      setTimeout(() => setShowSuccessAnimation(false), 3000);
      setLastSubmitTime(Math.floor(Date.now() / 1000));
      await fetchMyLogs();
    } catch (error: any) {
      console.error("Submit error:", error);
      if (error?.reason?.includes("Already submitted within 24h") || error?.message?.includes("Already submitted")) {
        setMessage(`⏰ You've already submitted today! Please wait ${formatCooldown(cooldownInfo.remaining)}.`);
      } else if (error?.reason) {
        setMessage(`❌ Error: ${error.reason}`);
      } else if (error?.message) {
        setMessage(`❌ Error: ${error.message}`);
      } else {
        setMessage("❌ Failed to submit. Please try again.");
      }
    } finally {
      setIsSubmitting(false);
    }
  }

  async function fetchMyLogs() {
    if (!provider || !account || !contract) return;
    try {
      setMessage("📥 Fetching your logs...");
      const bp = new ethers.BrowserProvider(provider);
      const ro = bp as unknown as ethers.ContractRunner;
      const c = new ethers.Contract(contract.address, contract.abi, ro);
      const logs = await c.getEncryptedLogs(account);
      setMyLogs(logs.map((l: any) => ({ ts: Number(l.timestamp), mood: l.mood, value: undefined, handle: l.temp })));
      await checkLastSubmitTime();
      setMessage("✅ Logs refreshed");
    } catch (error: any) {
      setMessage(`❌ Failed to fetch logs: ${error?.message || "Unknown error"}`);
    }
  }

  async function decryptMyLogs() {
    if (!provider || !account || !instance || !contract || myLogs.length === 0) return;
    try {
      setMessage("✍️ Signing decryption request...");
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
      if (!sig) {
        setMessage("❌ Signature failed");
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
      setMessage(`❌ Decryption failed: ${error?.message || "Unknown error"}`);
    }
  }

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
      
      // 热浪警报
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

  // 准备图表数据
  const chartData = useMemo(() => {
    const decryptedLogs = myLogs.filter((l) => l.value !== undefined).sort((a, b) => a.ts - b.ts);
    return decryptedLogs.map((log) => ({
      date: new Date(log.ts * 1000).toISOString(),
      value: log.value!,
      mood: log.mood,
    }));
  }, [myLogs]);

  // 计算相对于全球平均的比较
  const comparisonText = useMemo(() => {
    if (globalAvg === "n/a" || chartData.length === 0) return null;
    const myAvg = chartData.reduce((sum, d) => sum + d.value, 0) / chartData.length;
    const diff = myAvg - parseFloat(globalAvg);
    if (Math.abs(diff) < 1) return "You're right at the average!";
    if (diff > 0) return `You're ${diff.toFixed(1)}°C warmer than average!`;
    return `You're ${Math.abs(diff).toFixed(1)}°C cooler than average!`;
  }, [globalAvg, chartData]);

  return (
    <div className="min-h-screen bg-gradient-to-br from-orange-400 via-red-500 via-purple-500 to-blue-500 p-4 md:p-8">
      {/* 成功动画覆盖层 */}
      {showSuccessAnimation && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm">
          <div className="animate-bounce text-center">
            <div className="text-8xl mb-4">🔥</div>
            <div className="text-4xl font-black text-white drop-shadow-lg">Recorded Successfully!</div>
          </div>
        </div>
      )}

      <div className="max-w-7xl mx-auto space-y-6">
        {/* Header */}
        <div className="text-center mb-8">
          <h1 className="text-6xl md:text-7xl font-black text-white drop-shadow-2xl mb-3 tracking-tight">
            ChainHeatWatch
          </h1>
          <p className="text-xl text-white/90 font-semibold drop-shadow-lg">
            🔐 FHEVM encrypted daily perceived temperature · No backend
          </p>
        </div>

        {/* Status Bar */}
        <div className="flex flex-wrap items-center justify-center gap-3">
          <div className={`px-6 py-3 rounded-full font-bold text-white shadow-xl ${
            status === "ready" ? "bg-green-500" : status === "error" ? "bg-red-500" : "bg-gray-500"
          }`}>
            Status: {status}
          </div>
          {isConnected ? (
            <div className="px-6 py-3 rounded-full bg-gradient-to-r from-green-500 to-emerald-600 text-white font-bold shadow-xl">
              ✓ Connected {account?.slice(0, 6)}...{account?.slice(-4)}
            </div>
          ) : (
            <button
              onClick={connect}
              className="px-6 py-3 rounded-full bg-white/90 text-gray-900 font-bold shadow-xl hover:bg-white transition-all hover:scale-105"
            >
              Connect Wallet
            </button>
          )}
        </div>

        {/* 提交温度卡片 */}
        <GlassCard title="🌡️ Submit Today's Perceived Temperature">
          <div className="grid md:grid-cols-2 gap-6 items-center">
            {/* 左侧：温度计 */}
            <div className="flex justify-center">
              <Thermometer value={temp} />
            </div>

            {/* 右侧：输入控制 */}
            <div className="space-y-6">
              {/* 温度滑块 */}
              <div>
                <label className="block text-sm font-bold text-gray-700 mb-3">
                  Temperature: <span className="text-3xl text-orange-600">{temp}°C</span>
                </label>
                <input
                  type="range"
                  min={0}
                  max={50}
                  value={temp}
                  onChange={(e) => setTemp(parseInt(e.target.value))}
                  className="w-full h-3 bg-gradient-to-r from-blue-400 via-green-400 via-orange-400 to-red-600 rounded-lg appearance-none cursor-pointer slider"
                  style={{
                    background: `linear-gradient(to right, #60a5fa 0%, #34d399 25%, #fb923c 50%, #dc2626 100%)`,
                  }}
                />
                <div className="flex justify-between text-xs text-gray-600 mt-1">
                  <span>0°C</span>
                  <span>25°C</span>
                  <span>50°C</span>
                </div>
              </div>

              {/* Mood 选择 */}
              <div>
                <label className="block text-sm font-bold text-gray-700 mb-3">Mood:</label>
                <div className="grid grid-cols-4 gap-2">
                  {[
                    { emoji: "😊", label: "Good" },
                    { emoji: "😰", label: "Hot" },
                    { emoji: "🥶", label: "Cold" },
                    { emoji: "🤒", label: "Unwell" },
                  ].map((m) => (
                    <button
                      key={m.emoji}
                      onClick={() => setMood(m.emoji)}
                      className={`p-4 rounded-xl text-3xl transition-all ${
                        mood === m.emoji
                          ? "bg-gradient-to-br from-orange-400 to-red-500 scale-110 shadow-lg ring-4 ring-white"
                          : "bg-gray-100 hover:bg-gray-200"
                      }`}
                    >
                      {m.emoji}
                    </button>
                  ))}
                </div>
              </div>

              {/* 冷却期提示 */}
              {!cooldownInfo.canSubmit && (
                <div className="bg-orange-100 border-2 border-orange-400 rounded-xl p-4">
                  <div className="flex items-center gap-2 text-orange-800 font-bold">
                    <span className="text-2xl">⏰</span>
                    <div>
                      <div>Cooldown Active</div>
                      <div className="text-lg">{formatCooldown(cooldownInfo.remaining)} remaining</div>
                    </div>
                  </div>
                </div>
              )}

              {/* 提交按钮 */}
              <button
                disabled={!canSubmit || !cooldownInfo.canSubmit || isSubmitting}
                onClick={submit}
                className={`w-full py-4 rounded-xl font-black text-lg text-white shadow-xl transition-all ${
                  canSubmit && cooldownInfo.canSubmit && !isSubmitting
                    ? "bg-gradient-to-r from-orange-500 to-red-600 hover:from-orange-600 hover:to-red-700 hover:scale-105 active:scale-95"
                    : "bg-gray-400 cursor-not-allowed"
                }`}
              >
                {isSubmitting ? "⏳ Processing..." : "🔥 Submit Log"}
              </button>
            </div>
          </div>
        </GlassCard>

        {/* 历史趋势图 */}
        <GlassCard title="📊 Your Temperature History">
          <div className="mb-4">
            <div className="flex gap-3 mb-4">
              <button
                onClick={fetchMyLogs}
                className="px-5 py-2 rounded-xl bg-gradient-to-r from-blue-500 to-blue-600 text-white font-bold shadow-lg hover:scale-105 transition-all"
              >
                🔄 Refresh
              </button>
              <button
                disabled={!canDecrypt}
                onClick={decryptMyLogs}
                className="px-5 py-2 rounded-xl bg-gradient-to-r from-purple-500 to-purple-600 text-white font-bold shadow-lg hover:scale-105 transition-all disabled:opacity-50 disabled:cursor-not-allowed"
              >
                🔓 Decrypt Locally
              </button>
            </div>
          </div>
          <TemperatureChart data={chartData} period={chartPeriod} onPeriodChange={setChartPeriod} />

          {/* 日志列表 */}
          {myLogs.length > 0 && (
            <div className="mt-6 max-h-64 overflow-y-auto space-y-2">
              {myLogs.map((log, i) => (
                <div
                  key={i}
                  className="flex items-center justify-between p-3 bg-gray-50 rounded-xl border border-gray-200"
                >
                  <span className="text-gray-700">
                    {new Date(log.ts * 1000).toLocaleString()}
                  </span>
                  <span className="text-2xl">{log.mood}</span>
                  <span className="font-mono font-bold text-lg text-orange-600">
                    {log.value !== undefined ? `${log.value}°C` : "🔒 Encrypted"}
                  </span>
                </div>
              ))}
            </div>
          )}
        </GlassCard>

        {/* 全球匿名趋势 */}
        <GlassCard title="🌍 Anonymous Global Trend">
          <div className="flex flex-col md:flex-row items-center justify-between gap-6">
            <button
              onClick={fetchGlobal}
              className="px-8 py-4 rounded-xl bg-gradient-to-r from-indigo-500 to-purple-600 text-white font-black text-lg shadow-xl hover:scale-105 transition-all"
            >
              📈 Get Global Average
            </button>
            <div className="text-center">
              {globalAvg !== "n/a" ? (
                <div>
                  <div className="text-5xl font-black bg-gradient-to-r from-orange-600 to-red-600 bg-clip-text text-transparent mb-2">
                    {globalAvg}°C
                  </div>
                  <div className="text-gray-600 font-semibold">
                    Based on {globalCount} anonymous submissions
                  </div>
                  {globalAvg !== "n/a" && parseFloat(globalAvg) >= 32 && (
                    <div className="mt-2 px-4 py-2 bg-red-100 border-2 border-red-400 rounded-lg text-red-800 font-bold">
                      🔥 Heatwave Alert!
                    </div>
                  )}
                  {comparisonText && (
                    <div className="mt-3 px-4 py-2 bg-blue-100 border-2 border-blue-400 rounded-lg text-blue-800 font-semibold">
                      {comparisonText}
                    </div>
                  )}
                </div>
              ) : (
                <div className="text-3xl text-gray-400 font-bold">n/a</div>
              )}
            </div>
          </div>
        </GlassCard>

        {/* 消息提示 */}
        {message && (
          <div className="bg-white/90 backdrop-blur-lg rounded-2xl p-4 shadow-xl border-2 border-gray-200">
            <div className="font-semibold text-gray-800">{message}</div>
          </div>
        )}
      </div>

      <style jsx>{`
        input[type="range"]::-webkit-slider-thumb {
          appearance: none;
          width: 24px;
          height: 24px;
          border-radius: 50%;
          background: linear-gradient(135deg, #ff6b35, #ff2e63);
          cursor: pointer;
          box-shadow: 0 2px 8px rgba(0, 0, 0, 0.3);
        }
        input[type="range"]::-moz-range-thumb {
          width: 24px;
          height: 24px;
          border-radius: 50%;
          background: linear-gradient(135deg, #ff6b35, #ff2e63);
          cursor: pointer;
          border: none;
          box-shadow: 0 2px 8px rgba(0, 0, 0, 0.3);
        }
      `}</style>
    </div>
  );
}
