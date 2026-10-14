import React, { useState, useEffect, useRef } from 'react';
import { Volume2, VolumeX } from 'lucide-react';

interface AudioPlayerProps {
  className?: string;
}

// Authentic Persian traditional acoustic Santur & orchestra recording (Public Domain / CC-BY-SA, Wikimedia Commons)
const PRIMARY_AUDIO_URL = 'https://upload.wikimedia.org/wikipedia/commons/d/df/Sadeghi-Dehlavi-Concertino_for_Santur_Full.ogg';

export const AudioPlayer: React.FC<AudioPlayerProps> = ({ className = '' }) => {
  // Autoplay by default: plays automatically unless the user explicitly stops it
  const [isPlaying, setIsPlaying] = useState(true);
  const [useSynthFallback, setUseSynthFallback] = useState(false);

  const audioRef = useRef<HTMLAudioElement | null>(null);
  const audioCtxRef = useRef<AudioContext | null>(null);
  const synthIntervalRef = useRef<number | null>(null);
  const synthGainRef = useRef<GainNode | null>(null);
  const userHasMutedRef = useRef<boolean>(false);

  // Persian traditional musical scale frequencies (Dastgah Mahur & Homayoun soothing acoustic frequencies)
  const NOTES = [392.00, 440.00, 493.88, 523.25, 587.33, 659.25, 739.99, 783.99, 880.00, 293.66, 196.00];

  // Robust acoustic synthesized Santur note fallback
  const playSynthNote = (freq: number, duration: number = 2.5, velocity: number = 0.55) => {
    try {
      if (!audioCtxRef.current || !synthGainRef.current) return;
      const ctx = audioCtxRef.current;
      if (ctx.state === 'suspended') {
        ctx.resume().catch(() => {});
      }
      const now = ctx.currentTime;

      const osc1 = ctx.createOscillator();
      const osc2 = ctx.createOscillator();
      const oscHarmonic = ctx.createOscillator();

      osc1.type = 'sine';
      osc1.frequency.setValueAtTime(freq, now);

      osc2.type = 'triangle';
      osc2.frequency.setValueAtTime(freq * 1.004, now); // slight chorus

      oscHarmonic.type = 'sine';
      oscHarmonic.frequency.setValueAtTime(freq * 2, now);

      const noteGain = ctx.createGain();
      const harmonicGain = ctx.createGain();

      const filter = ctx.createBiquadFilter();
      filter.type = 'lowpass';
      filter.frequency.setValueAtTime(2600, now);

      osc1.connect(noteGain);
      osc2.connect(noteGain);
      noteGain.connect(filter);

      oscHarmonic.connect(harmonicGain);
      harmonicGain.connect(filter);

      filter.connect(synthGainRef.current);

      noteGain.gain.setValueAtTime(0.001, now);
      noteGain.gain.linearRampToValueAtTime(velocity, now + 0.02);
      noteGain.gain.exponentialRampToValueAtTime(0.0001, now + duration);

      harmonicGain.gain.setValueAtTime(0.001, now);
      harmonicGain.gain.linearRampToValueAtTime(velocity * 0.4, now + 0.015);
      harmonicGain.gain.exponentialRampToValueAtTime(0.0001, now + duration * 0.7);

      osc1.start(now);
      osc2.start(now);
      oscHarmonic.start(now);

      const stopTime = now + duration + 0.1;
      osc1.stop(stopTime);
      osc2.stop(stopTime);
      oscHarmonic.stop(stopTime);
    } catch (e) {
      console.warn('Synth error:', e);
    }
  };

  const startSynthLoop = () => {
    let step = 0;
    const melody = [
      NOTES[0], NOTES[2], NOTES[4], NOTES[7], // G4, B4, D5, G5
      NOTES[5], NOTES[4], NOTES[2], NOTES[0], // E5, D5, B4, G4
      NOTES[3], NOTES[4], NOTES[5], NOTES[7], // C5, D5, E5, G5
      NOTES[8], NOTES[7], NOTES[5], NOTES[4], // A5, G5, E5, D5
      NOTES[2], NOTES[3], NOTES[1], NOTES[0], // B4, C5, A4, G4
      NOTES[9], NOTES[0], NOTES[2], NOTES[0]  // D4, G4, B4, G4
    ];

    playSynthNote(melody[0], 3.0, 0.6);
    playSynthNote(NOTES[10], 4.0, 0.4);

    synthIntervalRef.current = window.setInterval(() => {
      step = (step + 1) % melody.length;
      playSynthNote(melody[step], 2.8, 0.55);

      if (step % 4 === 0) {
        playSynthNote(NOTES[10], 3.8, 0.35);
      }
      if (step % 8 === 4) {
        playSynthNote(NOTES[7], 2.0, 0.3);
      }
    }, 1200);
  };

  const stopSynthLoop = () => {
    if (synthIntervalRef.current !== null) {
      clearInterval(synthIntervalRef.current);
      synthIntervalRef.current = null;
    }
  };

  const initSynth = () => {
    if (!audioCtxRef.current) {
      const AudioCtx = window.AudioContext || (window as any).webkitAudioContext;
      if (AudioCtx) {
        const ctx = new AudioCtx();
        const master = ctx.createGain();
        master.gain.setValueAtTime(0.85, ctx.currentTime);
        master.connect(ctx.destination);
        audioCtxRef.current = ctx;
        synthGainRef.current = master;
      }
    }
  };

  const startAudioPlayback = async () => {
    if (userHasMutedRef.current) return;
    setIsPlaying(true);

    let playedSuccessfully = false;
    if (audioRef.current) {
      try {
        audioRef.current.volume = 0.85;
        await audioRef.current.play();
        playedSuccessfully = true;
        setUseSynthFallback(false);
      } catch (err) {
        console.warn('Audio tag autoplay restricted by browser policy, ready for gesture:', err);
      }
    }

    if (!playedSuccessfully) {
      setUseSynthFallback(true);
      initSynth();
      if (audioCtxRef.current && audioCtxRef.current.state === 'suspended') {
        try {
          await audioCtxRef.current.resume();
        } catch {
          // Wait for user gesture
        }
      }
      if (audioCtxRef.current && audioCtxRef.current.state === 'running') {
        startSynthLoop();
      }
    }
  };

  const stopAudioPlayback = () => {
    if (audioRef.current) {
      audioRef.current.pause();
    }
    stopSynthLoop();
    if (audioCtxRef.current && audioCtxRef.current.state === 'running') {
      audioCtxRef.current.suspend().catch(() => {});
    }
    setIsPlaying(false);
  };

  // Toggle Play / Pause on user button click
  const togglePlay = async () => {
    if (isPlaying) {
      // User explicitly stopped the music
      userHasMutedRef.current = true;
      stopAudioPlayback();
    } else {
      // User explicitly re-enabled music
      userHasMutedRef.current = false;
      await startAudioPlayback();
    }
  };

  // Autoplay by default on mount + fallback on first user gesture
  useEffect(() => {
    // Attempt direct autoplay
    startAudioPlayback();

    // Browser policy fallback: If unmuted autoplay is blocked by Chrome/Safari/Firefox,
    // trigger playback automatically on the user's very first touch or interaction on page
    const handleFirstInteraction = () => {
      if (!userHasMutedRef.current) {
        startAudioPlayback();
      }
    };

    const events = ['click', 'touchstart', 'keydown', 'scroll'];
    events.forEach(evt => window.addEventListener(evt, handleFirstInteraction, { once: true, passive: true }));

    return () => {
      events.forEach(evt => window.removeEventListener(evt, handleFirstInteraction));
      stopSynthLoop();
      if (audioCtxRef.current) {
        audioCtxRef.current.close().catch(() => {});
      }
    };
  }, []);

  return (
    <div className={`shrink-0 inline-flex items-center ${className}`}>
      {/* Hidden HTML5 Audio Element */}
      <audio
        ref={audioRef}
        src={PRIMARY_AUDIO_URL}
        loop
        preload="auto"
        onEnded={() => {
          if (audioRef.current && !userHasMutedRef.current) {
            audioRef.current.currentTime = 0;
            audioRef.current.play().catch(() => {});
          }
        }}
        onError={() => {
          console.warn('Audio tag error, switching to synth');
          if (isPlaying && !userHasMutedRef.current) {
            setUseSynthFallback(true);
            initSynth();
            startSynthLoop();
          }
        }}
      />

      {/* Main Music Toggle Button */}
      <button
        type="button"
        onClick={togglePlay}
        className={`shrink-0 inline-flex items-center justify-center gap-1.5 h-9 sm:h-10 px-2.5 sm:px-3.5 rounded-full text-xs font-bold transition-all border shadow-xs cursor-pointer select-none active:scale-95 ${
          isPlaying
            ? 'bg-[#231709] text-[#E8C574] border-[#D4A340] ring-2 ring-[#D4A340]/40 shadow-md shadow-[#231709]/20'
            : 'bg-[#EDE4D4]/90 hover:bg-[#E2D6C0] text-[#4B3B2B] border-[#D8CBB2]'
        }`}
        title={isPlaying ? 'توقف پخش موسیقی' : 'پخش موسیقی سنتی اصیل'}
        aria-label="پخش یا توقف موسیقی"
      >
        {isPlaying ? (
          <Volume2 className="w-4 h-4 text-[#D4A340] animate-pulse shrink-0" />
        ) : (
          <VolumeX className="w-4 h-4 text-[#7A6A5A] shrink-0" />
        )}

        {/* Label */}
        <span className="hidden md:inline text-xs font-bold whitespace-nowrap">
          {isPlaying ? 'موسیقی' : 'قطع صدا'}
        </span>

        {/* Subtle animated sound wave bars when playing */}
        {isPlaying && (
          <div className="flex items-end gap-0.5 h-3 px-0.5 shrink-0">
            <span className="w-0.5 h-2.5 bg-[#D4A340] rounded-full animate-pulse" style={{ animationDuration: '0.6s' }} />
            <span className="w-0.5 h-3.5 bg-[#E8C574] rounded-full animate-pulse" style={{ animationDuration: '0.4s' }} />
            <span className="w-0.5 h-2 bg-[#D4A340] rounded-full animate-pulse" style={{ animationDuration: '0.8s' }} />
          </div>
        )}
      </button>
    </div>
  );
};
