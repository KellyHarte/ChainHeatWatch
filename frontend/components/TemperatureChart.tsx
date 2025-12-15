"use client";

import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Area, AreaChart } from "recharts";

interface TemperatureChartProps {
  data: { date: string; value: number; mood: string }[];
  period?: "7d" | "30d" | "365d";
  onPeriodChange?: (period: "7d" | "30d" | "365d") => void;
}

export function TemperatureChart({ data, period = "7d", onPeriodChange }: TemperatureChartProps) {
  // 格式化数据用于图表
  const chartData = data.map((item) => ({
    date: new Date(item.date).toLocaleDateString("en-US", { month: "short", day: "numeric" }),
    temperature: item.value,
    fullDate: item.date,
    mood: item.mood,
  }));

  // 如果没有数据，显示空状态
  if (chartData.length === 0) {
    return (
      <div className="h-64 flex items-center justify-center text-gray-400 bg-gray-50 rounded-xl">
        <div className="text-center">
          <div className="text-4xl mb-2">📊</div>
          <div>No data available. Submit your first log to see trends!</div>
        </div>
      </div>
    );
  }

  return (
    <div className="w-full">
      {/* 时间段选择器 */}
      {onPeriodChange && (
        <div className="flex gap-2 mb-4">
          {(["7d", "30d", "365d"] as const).map((p) => (
            <button
              key={p}
              onClick={() => onPeriodChange(p)}
              className={`px-4 py-2 rounded-lg font-semibold transition-all ${
                period === p
                  ? "bg-gradient-to-r from-orange-500 to-red-600 text-white shadow-lg"
                  : "bg-gray-200 text-gray-700 hover:bg-gray-300"
              }`}
            >
              {p === "7d" ? "7 Days" : p === "30d" ? "30 Days" : "1 Year"}
            </button>
          ))}
        </div>
      )}

      {/* 图表 */}
      <div className="bg-white/95 rounded-xl p-4 shadow-xl border-2 border-gray-200">
        <ResponsiveContainer width="100%" height={300}>
          <AreaChart data={chartData} margin={{ top: 10, right: 30, left: 0, bottom: 0 }}>
            <defs>
              <linearGradient id="colorTemperature" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor="#FF6B35" stopOpacity={0.8} />
                <stop offset="95%" stopColor="#FF6B35" stopOpacity={0.1} />
              </linearGradient>
            </defs>
            <CartesianGrid strokeDasharray="3 3" stroke="#e0e0e0" />
            <XAxis
              dataKey="date"
              stroke="#666"
              fontSize={12}
              tickLine={{ stroke: "#666" }}
            />
            <YAxis
              label={{ value: "°C", angle: -90, position: "insideLeft", fill: "#666" }}
              stroke="#666"
              fontSize={12}
              domain={["dataMin - 2", "dataMax + 2"]}
            />
            <Tooltip
              contentStyle={{
                backgroundColor: "rgba(255, 255, 255, 0.95)",
                border: "2px solid #FF6B35",
                borderRadius: "8px",
                padding: "8px 12px",
              }}
              labelFormatter={(label) => `Date: ${label}`}
              formatter={(value: number, name: string, props: any) => [
                `${value}°C ${props.payload.mood || ""}`,
                "Temperature",
              ]}
            />
            <Area
              type="monotone"
              dataKey="temperature"
              stroke="#FF6B35"
              strokeWidth={3}
              fill="url(#colorTemperature)"
              dot={{ fill: "#FF6B35", r: 4 }}
              activeDot={{ r: 6, fill: "#FF2E63" }}
            />
          </AreaChart>
        </ResponsiveContainer>
      </div>

      {/* 统计信息 */}
      {chartData.length > 0 && (
        <div className="grid grid-cols-3 gap-4 mt-4">
          <div className="bg-gradient-to-br from-blue-50 to-blue-100 rounded-xl p-4 border-2 border-blue-200">
            <div className="text-sm text-blue-600 font-semibold">Average</div>
            <div className="text-2xl font-bold text-blue-800">
              {(chartData.reduce((sum, d) => sum + d.temperature, 0) / chartData.length).toFixed(1)}°C
            </div>
          </div>
          <div className="bg-gradient-to-br from-red-50 to-red-100 rounded-xl p-4 border-2 border-red-200">
            <div className="text-sm text-red-600 font-semibold">Highest</div>
            <div className="text-2xl font-bold text-red-800">
              {Math.max(...chartData.map((d) => d.temperature))}°C
            </div>
          </div>
          <div className="bg-gradient-to-br from-blue-50 to-blue-100 rounded-xl p-4 border-2 border-blue-200">
            <div className="text-sm text-blue-600 font-semibold">Lowest</div>
            <div className="text-2xl font-bold text-blue-800">
              {Math.min(...chartData.map((d) => d.temperature))}°C
            </div>
          </div>
        </div>
      )}
    </div>
  );
}





