"use client";

interface ThermometerProps {
  value: number;
  min?: number;
  max?: number;
  className?: string;
}

export function Thermometer({ value, min = 0, max = 50, className = "" }: ThermometerProps) {
  const percentage = Math.max(0, Math.min(100, ((value - min) / (max - min)) * 100));
  
  // 根据温度值决定颜色：冷->蓝，正常->绿，热->红
  const getColor = (temp: number) => {
    if (temp < 15) return "from-blue-400 to-blue-600";
    if (temp < 25) return "from-green-400 to-green-600";
    if (temp < 35) return "from-orange-400 to-orange-600";
    return "from-red-500 to-red-700";
  };

  return (
    <div className={`flex flex-col items-center ${className}`}>
      {/* 温度计主体 */}
      <div className="relative w-24 h-80 bg-gray-200 rounded-full border-4 border-gray-300 shadow-inner overflow-hidden">
        {/* 水银柱 - 带渐变和动效 */}
        <div
          className={`absolute bottom-0 w-full bg-gradient-to-t ${getColor(value)} transition-all duration-1000 ease-out`}
          style={{ height: `${percentage}%` }}
        >
          {/* 水银反光效果 */}
          <div className="absolute top-0 left-0 right-0 h-1/3 bg-gradient-to-b from-white/30 to-transparent"></div>
        </div>
        
        {/* 刻度线 */}
        <div className="absolute inset-0 flex flex-col justify-between py-2 pointer-events-none">
          {[0, 10, 20, 30, 40, 50].map((tick) => (
            <div key={tick} className="relative">
              <div className="absolute left-0 w-3 h-0.5 bg-gray-400"></div>
              <div className="absolute left-4 text-xs font-semibold text-gray-600">{tick}°</div>
            </div>
          ))}
        </div>
      </div>
      
      {/* 温度计底部球 */}
      <div className={`w-32 h-32 -mt-4 rounded-full bg-gradient-to-br ${getColor(value)} shadow-lg border-4 border-white relative`}>
        <div className="absolute inset-0 rounded-full bg-gradient-to-tr from-white/40 to-transparent"></div>
        <div className="absolute inset-0 flex items-center justify-center text-4xl font-black text-white drop-shadow-lg">
          {Math.round(value)}
        </div>
      </div>
    </div>
  );
}





