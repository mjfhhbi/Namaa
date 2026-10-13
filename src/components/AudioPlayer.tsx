import React, { useState, useEffect, useRef } from 'react';
import { Volume2, VolumeX, Music, Sparkles } from 'lucide-react';

interface AudioPlayerProps {
  className?: string;
}

export const AudioPlayer: React.FC<AudioPlayerProps> = ({ className = '' }) => {
  const [isPlaying, setIsPlaying] = useState(false);
  const [volume, setVolume] = useState(0.5);
  const audioCtxRef = useRef<AudioContext | null>(null);
  const intervalRef = useRef<number | null>(null);
  const gainNodeRef = useRef<GainNode | null>(null);

  // Traditional Persian relaxing scales (Dastgah Mahur & Homayoun soothing frequencies)
  // G4, A4, B4, C5, D5, E5, F#5, G5, A5, D4, G3
  const NOTES = [392.00, 440.00, 493.88, 523.25, 587.33, 659.25, 739.99, 783.99, 880.00, 293.66, 196.00];

  // Pluck an authentic, warm acoustic Santur tone
  const playTone = (freq: number, duration: number = 2.8, velocity: number = 0.35) => {
    if (!audioCtxRef.current || !gainNodeRef.current) return;
    const ctx = audioCtxRef.current;

    try {
      if (ctx.state === 'suspended') {
        ctx.resume().catch(() => {});
      }

      const now = ctx.currentTime;

      // 1. Fundamental string oscillator
      const osc1 = ctx.createOscillator();
      osc1.type = 'sine';
      osc1.frequency.setValueAtTime(freq, now);

      // 2. Twin chorus string oscillator (slight detuning for authentic shimmering Santur resonance)
      const osc2 = ctx.createOscillator();
      osc2.type = 'triangle';
      osc2.frequency.setValueAtTime(freq * 1.003, now);

      // 3. Harmonic chime overtone (octave harmonic)
      const oscHarmonic = ctx.createOscillator();
      oscHarmonic.type = 'sine';
      oscHarmonic.frequency.setValueAtTime(freq * 2, now);

      // Gain envelopes for realistic hammered string decay
      const voiceGain = ctx.createGain();
      const harmonicGain = ctx.createGain();

      // Warm acoustic low-pass filter
      const filter = ctx.createBiquadFilter();
      filter.type = 'lowpass';
      filter.frequency.setValueAtTime(2200, now);
      filter.Q.setValueAtTime(2.5, now);

      // Connect nodes cleanly
      osc1.connect(voiceGain);
      osc2.connect(voiceGain);
      voiceGain.connect(filter);

      oscHarmonic.connect(harmonicGain);
      harmonicGain.connect(filter);

      filter.connect(gainNodeRef.current);

      // Envelopes: instantaneous strike, natural exponential acoustic decay
      voiceGain.gain.setValueAtTime(0.001, now);
      voiceGain.gain.linearRampToValueAtTime(velocity, now + 0.02);
      voiceGain.gain.setTargetAtTime(0.0001, now + 0.03, duration * 0.38);

      harmonicGain.gain.setValueAtTime(0.001, now);
      harmonicGain.gain.linearRampToValueAtTime(velocity * 0.4, now + 0.015);
      harmonicGain.gain.setTargetAtTime(0.0001, now + 0.025, duration * 0.22);

      // Start & stop oscillators
      osc1.start(now);
      osc2.start(now);
      oscHarmonic.start(now);

      const stopTime = now + duration + 0.2;
      osc1.stop(stopTime);
      osc2.stop(stopTime);
      oscHarmonic.stop(stopTime);
    } catch (e) {
      console.warn('Web Audio note notice:', e);
    }
  };

  const startMusicLoop = () => {
    let step = 0;
    // Soothing Iranian Mahur melody phrases (نغمه آرامش‌بخش ماهور)
    const melody = [
      NOTES[0], NOTES[2], NOTES[4], NOTES[7], // G4, B4, D5, G5
      NOTES[5], NOTES[4], NOTES[2], NOTES[0], // E5, D5, B4, G4
      NOTES[3], NOTES[4], NOTES[5], NOTES[7], // C5, D5, E5, G5
      NOTES[8], NOTES[7], NOTES[5], NOTES[4], // A5, G5, E5, D5
      NOTES[2], NOTES[3], NOTES[1], NOTES[0], // B4, C5, A4, G4
      NOTES[9], NOTES[0], NOTES[2], NOTES[0]  // D4, G4, B4, G4
    ];

    // Strike first warm tone immediately on click
    playTone(melody[0], 3.2, 0.45);
    // Soft deep resonant bass note (تنبور / بم سنتور)
    playTone(NOTES[10], 4.5, 0.25);

    intervalRef.current = window.setInterval(() => {
      step = (step + 1) % melody.length;
      playTone(melody[step], 3.0, 0.38);

      // Resonant bass anchor every 4 notes
      if (step % 4 === 0) {
        playTone(NOTES[10], 4.2, 0.22);
      }
      // Light high harmonic pluck on 8th beats
      if (step % 8 === 4) {
        playTone(NOTES[7], 2.2, 0.18);
      }
    }, 1150);
  };

  const stopMusicLoop = () => {
    if (intervalRef.current !== null) {
      clearInterval(intervalRef.current);
      intervalRef.current = null;
    }
  };

  const togglePlay = async () => {
    try {
      if (isPlaying) {
        stopMusicLoop();
        if (audioCtxRef.current && audioCtxRef.current.state === 'running') {
          await audioCtxRef.current.suspend();
        }
        setIsPlaying(false);
      } else {
        // Initialize or resume AudioContext directly within user tap handler
        if (!audioCtxRef.current) {
          const AudioContextClass = window.AudioContext || (window as any).webkitAudioContext;
          const ctx = new AudioContextClass();
          const masterGain = ctx.createGain();
          masterGain.gain.setValueAtTime(0.7, ctx.currentTime);
          masterGain.connect(ctx.destination);

          audioCtxRef.current = ctx;
          gainNodeRef.current = masterGain;
        }

        if (audioCtxRef.current.state === 'suspended') {
          await audioCtxRef.current.resume();
        }

        startMusicLoop();
        setIsPlaying(true);
      }
    } catch (err) {
      console.error('Audio toggle error:', err);
    }
  };

  useEffect(() => {
    if (gainNodeRef.current && audioCtxRef.current) {
      gainNodeRef.current.gain.setValueAtTime(0.7, audioCtxRef.current.currentTime);
    }
  }, []);

  useEffect(() => {
    return () => {
      stopMusicLoop();
      if (audioCtxRef.current) {
        audioCtxRef.current.close().catch(() => {});
      }
    };
  }, []);

  return (
    <div className={`inline-flex items-center gap-1.5 ${className}`}>
      <button
        type="button"
        onClick={togglePlay}
        className={`inline-flex items-center gap-1.5 px-2.5 sm:px-3 py-1.5 sm:py-2 rounded-full text-xs font-bold transition-all border cursor-pointer ${
          isPlaying 
            ? 'bg-[#231709] text-[#E8C574] border-[#D4A340] shadow-sm ring-2 ring-[#D4A340]/40 animate-pulse' 
            : 'bg-[#EDE4D4]/80 hover:bg-[#E2D6C0] text-[#5C4B3C] border-[#D8CBB2]'
        }`}
        title={isPlaying ? 'قطع موسیقی سنتی و آرامش‌بخش' : 'پخش موسیقی سنتی و آرامش‌بخش ناما (سنتور ملایم)'}
        aria-label="پخش یا قطع موسیقی آرامش‌بخش"
      >
        {isPlaying ? (
          <Volume2 className="w-3.5 h-3.5 sm:w-4 sm:h-4 text-[#D4A340]" />
        ) : (
          <VolumeX className="w-3.5 h-3.5 sm:w-4 sm:h-4 text-[#7A6A5A]" />
        )}

        <span className="hidden sm:inline text-[11px] font-bold">
          {isPlaying ? 'نغمه آرامش (سنتور)' : 'موسیقی'}
        </span>

        {isPlaying && (
          <div className="flex items-center gap-0.5 mr-0.5">
            <span className="w-1 h-2.5 bg-[#D4A340] rounded-full animate-bounce" style={{ animationDelay: '0ms' }} />
            <span className="w-1 h-3.5 bg-[#D4A340] rounded-full animate-bounce" style={{ animationDelay: '150ms' }} />
            <span className="w-1 h-2 bg-[#D4A340] rounded-full animate-bounce" style={{ animationDelay: '300ms' }} />
          </div>
        )}
      </button>
    </div>
  );
};
