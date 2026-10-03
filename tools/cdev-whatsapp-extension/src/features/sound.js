/* CDEV WhatsApp — sons dos avisos (gerados via Web Audio, sem arquivos). */
(() => {
  let ctx = null;
  let last = 0;

  // [frequência Hz, duração s, atraso s]
  const PATTERNS = {
    toast: [[880, 0.07, 0]],
    warn: [[440, 0.12, 0], [330, 0.16, 0.13]],
    reminder: [[784, 0.16, 0], [988, 0.16, 0.18], [1175, 0.28, 0.36]],
    online: [[659, 0.12, 0], [988, 0.2, 0.13]],
    alert: [[988, 0.14, 0], [740, 0.14, 0.16], [988, 0.14, 0.32], [740, 0.22, 0.48]],
  };

  function audio() {
    if (!ctx) {
      const AC = globalThis.AudioContext || globalThis.webkitAudioContext;
      if (!AC) return null;
      ctx = new AC();
    }
    if (ctx.state === "suspended") ctx.resume().catch(() => {});
    return ctx;
  }

  /** kind: toast | warn | reminder | online | alert */
  function play(kind = "toast", { force = false, volume } = {}) {
    const f = WAW.store?.config?.features || {};
    if (!force && f.sounds === false) return;
    if (!force && kind === "toast" && f.soundToasts === false) return;
    const now = Date.now();
    if (kind === "toast" && now - last < 350) return; // evita metralhadora de bipes
    last = now;
    const ac = audio();
    if (!ac) return;
    const vol = Math.max(0, Math.min(1, volume ?? f.soundVolume ?? 0.6)) * (kind === "toast" ? 0.35 : 0.7);
    if (!vol) return;
    const t0 = ac.currentTime + 0.01;
    for (const [freq, dur, delay] of PATTERNS[kind] || PATTERNS.toast) {
      const osc = ac.createOscillator();
      const gain = ac.createGain();
      osc.type = kind === "alert" ? "triangle" : "sine";
      osc.frequency.value = freq;
      gain.gain.setValueAtTime(0.0001, t0 + delay);
      gain.gain.exponentialRampToValueAtTime(vol, t0 + delay + 0.015);
      gain.gain.exponentialRampToValueAtTime(0.0001, t0 + delay + dur);
      osc.connect(gain).connect(ac.destination);
      osc.start(t0 + delay);
      osc.stop(t0 + delay + dur + 0.02);
    }
  }

  // Navegadores só liberam áudio após interação: destrava no primeiro clique/tecla.
  const unlock = () => audio();
  if (typeof document !== "undefined") {
    document.addEventListener("pointerdown", unlock, { once: true, capture: true });
    document.addEventListener("keydown", unlock, { once: true, capture: true });
  }

  WAW.sound = { play, PATTERNS };
})();
