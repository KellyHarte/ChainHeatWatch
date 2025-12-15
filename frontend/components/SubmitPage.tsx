"use client";

import { useMetaMask } from "../wallet/MetaMaskProvider";
import { useEffect, useMemo, useState } from "react";
import { ethers } from "ethers";
import { createFhevmInstance } from "../fhevm/internal/fhevm";
import { HeatLogManagerABI } from "../abi/HeatLogManagerABI";
import { HeatLogManagerAddresses } from "../abi/HeatLogManagerAddresses";
import { Thermometer } from "./Thermometer";

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

export function SubmitPage() {
  const { provider, chainId, account, isConnected } = useMetaMask();
  const [status, setStatus] = useState<string>("idle");
  const [message, setMessage] = useState<string>("");
  const [instance, setInstance] = useState<any | undefined>(undefined);

  const [temp, setTemp] = useState<number>(25);
  const [mood, setMood] = useState<string>("😊");
  const [showSuccessAnimation, setShowSuccessAnimation] = useState(false);
  const [lastSubmitTime, setLastSubmitTime] = useState<number | null>(null);
  const [isSubmitting, setIsSubmitting] = useState<boolean>(false);

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
      onStatusChange: (s) => {
        if (!controller.signal.aborted) {
          setStatus(s);
        }
      },
    })
      .then((i) => {
        if (!controller.signal.aborted) {
          setInstance(i);
          setStatus("ready");
        }
      })
      .catch((e) => {
        if (e.name !== "FhevmAbortError" && !controller.signal.aborted) {
          setMessage(`❌ Failed to initialize: ${e.message || String(e)}`);
          setStatus("error");
        }
      });
    return () => controller.abort();
  }, [provider, chainId]);

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

  const canSubmit = isConnected && instance && contract && !isSubmitting && cooldownInfo.canSubmit;

  if (!isConnected) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-orange-400 via-red-500 via-purple-500 to-blue-500 flex items-center justify-center p-4">
        <GlassCard title="🔐 Wallet Required">
          <div className="text-center py-8">
            <p className="text-xl text-gray-700 mb-6">Please connect your wallet to submit your temperature log.</p>
            <p className="text-gray-600">Use the Connect Wallet button in the navigation bar.</p>
          </div>
        </GlassCard>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-orange-400 via-red-500 via-purple-500 to-blue-500 p-4 md:p-8">
      {showSuccessAnimation && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm">
          <div className="animate-bounce text-center">
            <div className="text-9xl mb-4">🔥</div>
            <div className="text-5xl font-black text-white drop-shadow-lg">Recorded Successfully!</div>
          </div>
        </div>
      )}

      <div className="max-w-6xl mx-auto">
        <GlassCard title="🌡️ Submit Today's Perceived Temperature">
          <div className="grid md:grid-cols-2 gap-8 items-center">
            {/* 左侧：温度计 */}
            <div className="flex justify-center">
              <Thermometer value={temp} />
            </div>

            {/* 右侧：输入控制 */}
            <div className="space-y-6">
              {/* 温度滑块 */}
              <div>
                <label className="block text-lg font-bold text-gray-700 mb-4">
                  Temperature: <span className="text-4xl text-orange-600">{temp}°C</span>
                </label>
                <input
                  type="range"
                  min={0}
                  max={50}
                  value={temp}
                  onChange={(e) => setTemp(parseInt(e.target.value))}
                  className="w-full h-4 bg-gradient-to-r from-blue-400 via-green-400 via-orange-400 to-red-600 rounded-lg appearance-none cursor-pointer"
                  style={{
                    background: `linear-gradient(to right, #60a5fa 0%, #34d399 25%, #fb923c 50%, #dc2626 100%)`,
                  }}
                />
                <div className="flex justify-between text-sm text-gray-600 mt-2">
                  <span>0°C</span>
                  <span>25°C</span>
                  <span>50°C</span>
                </div>
              </div>

              {/* Mood 选择 */}
              <div>
                <label className="block text-lg font-bold text-gray-700 mb-4">How are you feeling?</label>
                <div className="grid grid-cols-4 gap-3">
                  {[
                    { emoji: "😊", label: "Good" },
                    { emoji: "😰", label: "Hot" },
                    { emoji: "🥶", label: "Cold" },
                    { emoji: "🤒", label: "Unwell" },
                  ].map((m) => (
                    <button
                      key={m.emoji}
                      onClick={() => setMood(m.emoji)}
                      className={`p-6 rounded-2xl text-4xl transition-all ${
                        mood === m.emoji
                          ? "bg-gradient-to-br from-orange-400 to-red-500 scale-110 shadow-xl ring-4 ring-white"
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
                  <div className="flex items-center gap-3 text-orange-800 font-bold">
                    <span className="text-3xl">⏰</span>
                    <div>
                      <div className="text-lg">Cooldown Active</div>
                      <div className="text-xl">{formatCooldown(cooldownInfo.remaining)} remaining</div>
                    </div>
                  </div>
                </div>
              )}

              {/* 提交按钮 */}
              <button
                disabled={!canSubmit}
                onClick={submit}
                className={`w-full py-5 rounded-xl font-black text-xl text-white shadow-xl transition-all ${
                  canSubmit
                    ? "bg-gradient-to-r from-orange-500 to-red-600 hover:from-orange-600 hover:to-red-700 hover:scale-105 active:scale-95"
                    : "bg-gray-400 cursor-not-allowed"
                }`}
              >
                {isSubmitting ? "⏳ Processing..." : "🔥 Submit Log"}
              </button>
            </div>
          </div>

          {message && (
            <div className="mt-6 p-4 bg-white/90 rounded-xl border-2 border-gray-200">
              <div className="font-semibold text-gray-800">{message}</div>
            </div>
          )}
        </GlassCard>
      </div>

      <style jsx>{`
        input[type="range"]::-webkit-slider-thumb {
          appearance: none;
          width: 28px;
          height: 28px;
          border-radius: 50%;
          background: linear-gradient(135deg, #ff6b35, #ff2e63);
          cursor: pointer;
          box-shadow: 0 2px 8px rgba(0, 0, 0, 0.3);
        }
        input[type="range"]::-moz-range-thumb {
          width: 28px;
          height: 28px;
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

