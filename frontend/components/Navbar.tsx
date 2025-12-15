"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useMetaMask } from "../wallet/MetaMaskProvider";

export function Navbar() {
  const pathname = usePathname();
  const { isConnected, account, connect } = useMetaMask();

  const navItems = [
    { href: "/", label: "🏠 Home", exact: true },
    { href: "/submit", label: "🌡️ Submit" },
    { href: "/history", label: "📊 History" },
    { href: "/statistics", label: "📈 Statistics" },
    { href: "/global", label: "🌍 Global Trend" },
  ];

  const isActive = (href: string, exact?: boolean) => {
    if (exact) return pathname === href;
    return pathname?.startsWith(href);
  };

  return (
    <nav className="bg-white/90 backdrop-blur-lg border-b-2 border-gray-200 shadow-lg sticky top-0 z-50">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex items-center justify-between h-16">
          {/* Logo */}
          <Link href="/" className="flex items-center space-x-3">
            <span className="text-2xl font-black bg-gradient-to-r from-orange-600 to-red-600 bg-clip-text text-transparent">
              ChainHeatWatch
            </span>
          </Link>

          {/* Navigation Links */}
          <div className="hidden md:flex items-center space-x-1">
            {navItems.map((item) => (
              <Link
                key={item.href}
                href={item.href}
                className={`px-4 py-2 rounded-xl font-semibold transition-all ${
                  isActive(item.href, item.exact)
                    ? "bg-gradient-to-r from-orange-500 to-red-600 text-white shadow-lg"
                    : "text-gray-700 hover:bg-gray-100"
                }`}
              >
                {item.label}
              </Link>
            ))}
          </div>

          {/* Wallet Connection */}
          <div className="flex items-center space-x-4">
            {isConnected ? (
              <div className="px-4 py-2 rounded-xl bg-gradient-to-r from-green-500 to-emerald-600 text-white font-bold shadow-lg text-sm">
                ✓ {account?.slice(0, 6)}...{account?.slice(-4)}
              </div>
            ) : (
              <button
                onClick={connect}
                className="px-4 py-2 rounded-xl bg-gradient-to-r from-orange-500 to-red-600 text-white font-bold shadow-lg hover:scale-105 transition-all"
              >
                Connect Wallet
              </button>
            )}
          </div>
        </div>

        {/* Mobile Navigation */}
        <div className="md:hidden pb-4">
          <div className="flex flex-wrap gap-2">
            {navItems.map((item) => (
              <Link
                key={item.href}
                href={item.href}
                className={`px-3 py-2 rounded-lg text-sm font-semibold transition-all ${
                  isActive(item.href, item.exact)
                    ? "bg-gradient-to-r from-orange-500 to-red-600 text-white"
                    : "bg-gray-100 text-gray-700"
                }`}
              >
                {item.label}
              </Link>
            ))}
          </div>
        </div>
      </div>
    </nav>
  );
}





