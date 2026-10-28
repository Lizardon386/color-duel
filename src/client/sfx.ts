let context: AudioContext | null = null;
let enabled = true;

function audio(): AudioContext | null {
  if (!context) {
    try {
      context = new AudioContext();
    } catch {
      return null;
    }
  }
  if (context.state === 'suspended') void context.resume();
  return context;
}

function tone(freq: number, duration = 0.12, type: OscillatorType = 'triangle', delay = 0, gain = 0.06): void {
  if (!enabled) return;
  const ctx = audio();
  if (!ctx) return;
  const start = ctx.currentTime + delay;
  const oscillator = ctx.createOscillator();
  const volume = ctx.createGain();
  oscillator.type = type;
  oscillator.frequency.value = freq;
  oscillator.connect(volume);
  volume.connect(ctx.destination);
  volume.gain.setValueAtTime(0, start);
  volume.gain.linearRampToValueAtTime(gain, start + 0.01);
  volume.gain.exponentialRampToValueAtTime(0.0001, start + duration);
  oscillator.start(start);
  oscillator.stop(start + duration + 0.02);
}

export const sfx = {
  play(): void {
    tone(520, 0.09, 'square');
    tone(720, 0.08, 'square', 0.03);
  },
  draw(): void {
    tone(300, 0.12, 'sine');
    tone(220, 0.14, 'sine', 0.06);
  },
  turn(): void {
    tone(680, 0.06, 'sine', 0, 0.045);
  },
  peng(): void {
    tone(880, 0.07, 'square');
    tone(1180, 0.09, 'square', 0.05);
  },
  chain(): void {
    tone(240, 0.1, 'sawtooth');
    tone(360, 0.12, 'sawtooth', 0.06);
  },
  call(): void {
    tone(740, 0.1, 'triangle');
    tone(930, 0.12, 'triangle', 0.08);
  },
  bad(): void {
    tone(180, 0.16, 'sawtooth', 0, 0.08);
  },
  win(): void {
    [523, 659, 784, 1047].forEach((freq, index) => tone(freq, 0.16, 'triangle', index * 0.12, 0.08));
  },
  lose(): void {
    [440, 349, 262].forEach((freq, index) => tone(freq, 0.18, 'sawtooth', index * 0.12, 0.06));
  },
};

export function soundEnabled(): boolean {
  return enabled;
}

export function toggleSound(): boolean {
  enabled = !enabled;
  if (enabled) tone(660, 0.08);
  return enabled;
}
