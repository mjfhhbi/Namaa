import React from 'react';
import { MessageCircle } from 'lucide-react';

interface WhatsAppButtonProps {
  phone?: string;
}

export const WhatsAppButton: React.FC<WhatsAppButtonProps> = ({ 
  phone = '+98 916 644 9409' 
}) => {
  const cleanNumber = phone.replace(/[\s+-]/g, '');

  return (
    <aside 
      aria-label="پشتیبانی واتساپ"
      className="fixed bottom-6 left-6 z-40 flex items-center group"
    >
      <a
        href={`https://wa.me/${cleanNumber}`}
        target="_blank"
        rel="noopener noreferrer"
        aria-label="ارتباط در واتساپ: 09166449409"
        className="flex items-center gap-2.5 bg-[#25D366] hover:bg-[#20BD5A] text-white px-4 py-3 rounded-full shadow-2xl hover:shadow-emerald-500/30 active:scale-95 transition-all duration-300 font-bold text-xs sm:text-sm"
      >
        <div className="relative">
          <MessageCircle className="w-5 h-5 fill-current" />
          <span className="absolute -top-1 -right-1 w-2.5 h-2.5 bg-white rounded-full animate-ping" />
          <span className="absolute -top-1 -right-1 w-2.5 h-2.5 bg-white rounded-full" />
        </div>
        <span className="hidden sm:inline font-bold">پشتیبانی واتساپ</span>
        <span className="text-[11px] font-mono hidden md:inline text-white/90" dir="ltr">
          {phone}
        </span>
      </a>
    </aside>
  );
};
