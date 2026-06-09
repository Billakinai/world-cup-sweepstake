/* Tiny dependency-free sound engine (Web Audio, no files needed).
 * Wheel ticks while spinning, crowd claps + ta-da on reveals.
 * All sounds start from a button press, so browser autoplay rules are happy. */

let ctx = null;
let muted = false;

function ac() {
  if (!ctx) {
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return null;
    ctx = new AC();
  }
  if (ctx.state === "suspended") ctx.resume();
  return ctx;
}

export function setMuted(m) {
  muted = m;
}
export function isMuted() {
  return muted;
}

/** One ratchet tick (the wheel pin clicking past a peg). */
export function tick() {
  if (muted) return;
  const c = ac();
  if (!c) return;
  const o = c.createOscillator();
  const g = c.createGain();
  o.type = "square";
  o.frequency.value = 1700 + Math.random() * 300;
  g.gain.setValueAtTime(0.07, c.currentTime);
  g.gain.exponentialRampToValueAtTime(0.001, c.currentTime + 0.04);
  o.connect(g).connect(c.destination);
  o.start();
  o.stop(c.currentTime + 0.05);
}

/** Schedule decelerating ticks to match the wheel slow-down.
 *  Returns a cancel function. */
export function spinTicks(duration = 4600) {
  if (muted || !ac()) return () => {};
  const timeouts = [];
  let elapsed = 0;
  let gap = 34;
  while (elapsed < duration - 250) {
    timeouts.push(setTimeout(tick, elapsed));
    gap *= 1.085;
    elapsed += gap;
  }
  return () => timeouts.forEach(clearTimeout);
}

/** Crowd claps + a little ta-da. */
export function cheer(intensity = 1) {
  if (muted) return;
  const c = ac();
  if (!c) return;

  // Claps: short shaped noise bursts scattered over ~1.6s
  const clapBuf = c.createBuffer(1, Math.floor(c.sampleRate * 0.06), c.sampleRate);
  const data = clapBuf.getChannelData(0);
  for (let i = 0; i < data.length; i++) {
    data[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / data.length, 2);
  }
  const claps = Math.floor(22 * intensity);
  for (let i = 0; i < claps; i++) {
    const src = c.createBufferSource();
    src.buffer = clapBuf;
    const f = c.createBiquadFilter();
    f.type = "bandpass";
    f.frequency.value = 900 + Math.random() * 1600;
    const g = c.createGain();
    g.gain.value = 0.1 + Math.random() * 0.1;
    src.connect(f).connect(g).connect(c.destination);
    src.start(c.currentTime + Math.random() * 1.6);
  }

  // Ta-da triad
  [523.25, 659.25, 783.99].forEach((freq, i) => {
    const o = c.createOscillator();
    const g = c.createGain();
    o.type = "triangle";
    o.frequency.value = freq;
    const t = c.currentTime + 0.05 + i * 0.09;
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(0.12, t + 0.02);
    g.gain.exponentialRampToValueAtTime(0.001, t + 0.5);
    o.connect(g).connect(c.destination);
    o.start(t);
    o.stop(t + 0.55);
  });
}

/** Full-time celebration. */
export function bigCheer() {
  cheer(1.4);
  setTimeout(() => cheer(1), 450);
}
