import React from 'react';

interface LogoProps {
  size?: number;
  className?: string;
  showText?: boolean;
}

export const Logo: React.FC<LogoProps> = ({ size = 48, className = '', showText = true }) => {
  return (
    <div className={`flex items-center gap-3 select-none ${className}`}>
      {/* Authentic circular seal matching uploaded branding */}
      <div 
        style={{ width: size, height: size }} 
        className="relative flex-shrink-0 rounded-full border-2 border-[#163826] bg-[#FAF8F3] p-1.5 shadow-sm flex items-center justify-center overflow-hidden transition-transform duration-300 hover:scale-105"
      >
        <svg 
          viewBox="0 0 200 200" 
          className="w-full h-full"
          fill="none" 
          xmlns="http://www.w3.org/2000/svg"
        >
          {/* Inner decorative subtle rim */}
          <circle cx="100" cy="100" r="94" stroke="#163826" strokeWidth="2.5" strokeOpacity="0.85" />
          <circle cx="100" cy="100" r="90" stroke="#8C9A7D" strokeWidth="0.75" strokeDasharray="3 3" />

          {/* Olive Leaf Motif at top-right of calligraphy */}
          <path 
            d="M 142 66 C 146 54, 164 48, 168 56 C 160 68, 150 78, 142 66 Z" 
            fill="#5E784D" 
          />
          <path 
            d="M 143 66 C 152 61, 160 56, 168 56" 
            stroke="#4A613C" 
            strokeWidth="1.2" 
          />

          {/* Persian Calligraphy "ناما" (NAMA) stylized vector */}
          <g fill="#163826">
            {/* Letter 1 (Right stem - N / Alef) */}
            <path d="M 42 70 C 42 64, 50 64, 50 70 L 50 108 C 50 122, 60 130, 74 130 C 86 130, 96 122, 102 110 C 108 98, 114 94, 122 108 C 126 116, 134 126, 148 126 C 158 126, 166 118, 166 106 C 166 98, 160 96, 156 100 C 152 104, 146 112, 138 112 C 130 112, 126 102, 122 92 C 114 74, 98 76, 90 92 C 84 104, 76 114, 66 114 C 58 114, 58 106, 58 98 L 58 70 C 58 64, 42 64, 42 70 Z" />
            {/* Left Alef Stem */}
            <path d="M 115 70 C 115 64, 124 64, 124 70 L 124 102 C 124 114, 132 122, 142 122 C 152 122, 158 114, 160 100 L 160 70 C 160 64, 148 64, 148 70 L 148 98 C 146 106, 140 110, 134 110 C 128 110, 124 104, 124 96 L 124 70 Z" />
          </g>

          {/* N A M A in elegant serif English */}
          <text 
            x="100" 
            y="152" 
            textAnchor="middle" 
            fontFamily="'Playfair Display', Georgia, serif" 
            fontSize="18" 
            fontWeight="700" 
            letterSpacing="7" 
            fill="#163826"
          >
            NAMA
          </text>

          {/* Divider line left */}
          <line x1="38" y1="164" x2="68" y2="164" stroke="#7A8B74" strokeWidth="1" />
          
          {/* FOOD PRODUCTS subtitle */}
          <text 
            x="100" 
            y="167" 
            textAnchor="middle" 
            fontFamily="'Vazirmatn', sans-serif" 
            fontSize="8.5" 
            fontWeight="600" 
            letterSpacing="2.5" 
            fill="#405537"
          >
            FOOD PRODUCTS
          </text>
          
          {/* Divider line right */}
          <line x1="132" y1="164" x2="162" y2="164" stroke="#7A8B74" strokeWidth="1" />
        </svg>
      </div>

      {showText && (
        <div className="flex flex-col text-right">
          <div className="flex items-center gap-2">
            <span className="text-xl sm:text-2xl font-black text-[#163826] tracking-tight font-['Vazirmatn']">
              فروشگاه ناما
            </span>
            <span className="px-2 py-0.5 text-[10px] font-bold tracking-wider rounded-md bg-[#E8EFE6] text-[#255238] border border-[#C5D8C1]">
              ۱۰۰٪ ارگانیک
            </span>
          </div>
          <span className="text-[11px] sm:text-xs text-[#5E6D62] font-medium tracking-wide">
            از نام و جان برای طعمی ماندگار
          </span>
        </div>
      )}
    </div>
  );
};
