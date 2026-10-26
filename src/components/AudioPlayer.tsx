import React, { useState, useEffect, useRef } from 'react';
import { Volume2, VolumeX } from 'lucide-react';

interface AudioPlayerProps {
  className?: string;
}

// Authentic Persian traditional acoustic Santur & Orchestra masterpiece
// Hossein Dehlavi & Manouchehr Sadeghi - Concertino for Santur (Public Domain / CC-BY-SA, Wikimedia Commons)
const AUDIO_MP3_URL = 'https://upload.wikimedia.org/wikipedia/commons/transcoded/d/df/Sadeghi-Dehlavi-Concertino_for_Santur_Full.ogg/Sadeghi-Dehlavi-Concertino_for_Santur_Full.ogg.mp3';
const AUDIO_OGG_URL = 'https://upload.wikimedia.org/wikipedia/commons/d/df/Sadeghi-Dehlavi-Concertino_for_Santur_Full.ogg';

export const AudioPlayer: React.FC<AudioPlayerProps> = ({ className = '' }) => {
  // Autoplay by default: plays automatically unless the user explicitly stops it
  const [isPlaying, setIsPlaying] = useState(true);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const userHasMutedRef = useRef<boolean>(false);

  // Play audio safely
  const playTraditionalAudio = async () => {
    if (userHasMutedRef.current || !audioRef.current) return;
    try {
      audioRef.current.volume = 0.4;
      await audioRef.current.play();
      setIsPlaying(true);
    } catch {
      // Autoplay blocked by browser policy until first gesture
      setIsPlaying(false);
    }
  };

  // Toggle Play / Pause on user button click
  const togglePlay = async () => {
    if (!audioRef.current) return;

    if (isPlaying) {
      // User explicitly stopped the music
      userHasMutedRef.current = true;
      audioRef.current.pause();
      setIsPlaying(false);
    } else {
      // User explicitly re-enabled music
      userHasMutedRef.current = false;
      try {
        audioRef.current.volume = 0.4;
        await audioRef.current.play();
        setIsPlaying(true);
      } catch (err) {
        console.warn('Playback error:', err);
      }
    }
  };

  // Autoplay on mount + one-time user interaction fallback
  useEffect(() => {
    // Attempt direct autoplay
    playTraditionalAudio();

    // Browser policy: if browser blocks initial autoplay, start on first user gesture
    const handleFirstGesture = () => {
      if (!userHasMutedRef.current && audioRef.current && audioRef.current.paused) {
        playTraditionalAudio();
      }
    };

    const events = ['click', 'touchstart', 'keydown', 'scroll'];
    events.forEach(evt => window.addEventListener(evt, handleFirstGesture, { once: true, passive: true }));

    return () => {
      events.forEach(evt => window.removeEventListener(evt, handleFirstGesture));
      if (audioRef.current) {
        audioRef.current.pause();
      }
    };
  }, []);

  return (
    <div className={`shrink-0 inline-flex items-center ${className}`}>
      {/* Authentic Persian Traditional Santur Audio (MP3 & OGG fallback) */}
      <audio
        ref={audioRef}
        loop
        preload="auto"
        onPlay={() => setIsPlaying(true)}
        onPause={() => {
          if (userHasMutedRef.current) {
            setIsPlaying(false);
          }
        }}
        onEnded={() => {
          if (audioRef.current && !userHasMutedRef.current) {
            audioRef.current.currentTime = 0;
            audioRef.current.play().catch(() => {});
          }
        }}
      >
        <source src={AUDIO_MP3_URL} type="audio/mpeg" />
        <source src={AUDIO_OGG_URL} type="audio/ogg" />
      </audio>

      {/* Music Toggle Button */}
      <button
        type="button"
        onClick={togglePlay}
        className={`shrink-0 inline-flex items-center justify-center gap-1.5 h-9 sm:h-10 px-2.5 sm:px-3.5 rounded-full text-xs font-bold transition-all border shadow-xs cursor-pointer select-none active:scale-95 ${
          isPlaying
            ? 'bg-[#231709] text-[#E8C574] border-[#D4A340] ring-2 ring-[#D4A340]/40 shadow-md shadow-[#231709]/20'
            : 'bg-[#EDE4D4]/90 hover:bg-[#E2D6C0] text-[#4B3B2B] border-[#D8CBB2]'
        }`}
        title={isPlaying ? 'توقف پخش موسیقی سنتی سنتور' : 'پخش موسیقی اصیل سنتی سنتور'}
        aria-label="پخش یا توقف موسیقی سنتی"
      >
        {isPlaying ? (
          <Volume2 className="w-4 h-4 text-[#D4A340] animate-pulse shrink-0" />
        ) : (
          <VolumeX className="w-4 h-4 text-[#7A6A5A] shrink-0" />
        )}

        {/* Label */}
        <span className="hidden md:inline text-xs font-bold whitespace-nowrap">
          {isPlaying ? 'موسیقی سنتی' : 'موسیقی (خاموش)'}
        </span>

        {/* Subtle animated sound wave bars when playing */}
        {isPlaying && (
          <div className="flex items-end gap-0.5 h-3 px-0.5 shrink-0" aria-hidden="true">
            <span className="w-0.5 h-2.5 bg-[#D4A340] rounded-full animate-pulse" style={{ animationDuration: '0.6s' }} />
            <span className="w-0.5 h-3.5 bg-[#E8C574] rounded-full animate-pulse" style={{ animationDuration: '0.4s' }} />
            <span className="w-0.5 h-2 bg-[#D4A340] rounded-full animate-pulse" style={{ animationDuration: '0.8s' }} />
          </div>
        )}
      </button>
    </div>
  );
};
