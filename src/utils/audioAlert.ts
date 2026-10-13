// Gentle, clear audio chime for new order alerts and notifications
export function playNewOrderChime(): void {
  try {
    const AudioContextClass = window.AudioContext || (window as any).webkitAudioContext;
    if (!AudioContextClass) return;
    const ctx = new AudioContextClass();
    if (ctx.state === 'suspended') {
      ctx.resume().catch(() => {});
    }

    const now = ctx.currentTime;
    const masterGain = ctx.createGain();
    masterGain.gain.setValueAtTime(0.3, now);
    masterGain.connect(ctx.destination);

    // Two pleasant ascending bells (E5 -> B5)
    const tones = [
      { freq: 659.25, time: 0, dur: 0.8 },
      { freq: 987.77, time: 0.15, dur: 1.2 },
      { freq: 1318.51, time: 0.32, dur: 1.5 }
    ];

    tones.forEach(t => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(t.freq, now + t.time);

      gain.gain.setValueAtTime(0.001, now + t.time);
      gain.gain.linearRampToValueAtTime(0.28, now + t.time + 0.02);
      gain.gain.setTargetAtTime(0.0001, now + t.time + 0.04, t.dur * 0.3);

      osc.connect(gain);
      gain.connect(masterGain);

      osc.start(now + t.time);
      osc.stop(now + t.time + t.dur + 0.1);
    });
  } catch (e) {
    console.warn('Audio chime notice:', e);
  }
}
