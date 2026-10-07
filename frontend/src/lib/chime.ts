/**
 * The sound a finished timer makes. Synthesised with the Web Audio API rather
 * than played from a file: nothing to download or cache, and the tablet's own
 * volume is the only thing to configure.
 *
 * A page may only make sound once a tap has unlocked audio, so the context is
 * created on the tap that starts the timer (see TimerStore) and kept for the
 * ring minutes later. Before that, {@link playChime} is silent.
 */
let ctx: AudioContext | null = null;

/** Creates the audio context, or wakes it up. Call from a user gesture. */
export function unlockAudio(): void {
  try {
    ctx ??= new AudioContext();
    if (ctx.state === 'suspended') void ctx.resume();
  } catch {
    ctx = null;
  }
}

/** Notes of the chime (Hz): C6, E6, G6 — a major triad, rising. */
const NOTES = [1046.5, 1318.51, 1567.98];
/** Gap between note onsets (s). */
const NOTE_EVERY_S = 0.22;
/** How long a note rings out (s). */
const NOTE_LENGTH_S = 0.6;

/** Three rising notes, about a second long. */
export function playChime(): void {
  if (!ctx) unlockAudio();
  const ac = ctx;
  if (!ac) return;
  // A context that was put to sleep plays once it is awake again, rather than
  // dropping this chime and leaving the next one to be the first heard.
  if (ac.state !== 'running') {
    void ac.resume().then(
      () => schedule(ac),
      () => undefined,
    );
    return;
  }
  schedule(ac);
}

function schedule(ac: AudioContext): void {
  const t0 = ac.currentTime;
  NOTES.forEach((freq, i) => {
    const at = t0 + i * NOTE_EVERY_S;
    const osc = ac.createOscillator();
    const gain = ac.createGain();
    osc.type = 'sine';
    osc.frequency.value = freq;
    // Short attack, then a decay that fades the note out instead of clicking off.
    gain.gain.setValueAtTime(0.0001, at);
    gain.gain.exponentialRampToValueAtTime(0.35, at + 0.015);
    gain.gain.exponentialRampToValueAtTime(0.0001, at + NOTE_LENGTH_S);
    osc.connect(gain).connect(ac.destination);
    osc.start(at);
    osc.stop(at + NOTE_LENGTH_S);
  });
}

let keepAlive: OscillatorNode | null = null;

/** Far below anything the room will hear: -54 dBFS. */
const KEEP_ALIVE_GAIN = 0.002;

/**
 * Holds the audio output open with a tone too quiet to hear. The chime is
 * scheduled on time (within a few milliseconds of the end), but a tablet
 * speaker or a Bluetooth speaker drops into standby after a few seconds of
 * silence and takes a moment — on some devices several seconds — to wake,
 * swallowing the start of whatever plays next. Started a few seconds before
 * the timer ends and kept up while it rings, so the first chime is heard.
 */
export function keepOutputAwake(on: boolean): void {
  if (!on) {
    keepAlive?.stop();
    keepAlive = null;
    return;
  }
  if (keepAlive) return;
  if (!ctx) unlockAudio();
  const ac = ctx;
  if (!ac) return;
  const osc = ac.createOscillator();
  const gain = ac.createGain();
  osc.type = 'sine';
  osc.frequency.value = 220;
  gain.gain.value = KEEP_ALIVE_GAIN;
  osc.connect(gain).connect(ac.destination);
  osc.start();
  keepAlive = osc;
}
