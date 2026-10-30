// Vexel sound: every sound and the music are generated in the browser with the Web Audio API.

const Sound = (() => {
  let ctx = null, master = null, musicBus = null;
  let muted = false, musicOn = false, nextNoteTime = 0, step = 0;
  try { muted = localStorage.getItem("vexelMuted") === "1"; } catch (e) { /* storage can be blocked */ }

  function ensure() {
    if (!ctx) {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return false;
      ctx = new AC();
      master = ctx.createGain();
      master.gain.value = muted ? 0 : 0.7;
      master.connect(ctx.destination);
      musicBus = ctx.createGain();
      musicBus.gain.value = 0.14;
      musicBus.connect(master);
    }
    if (ctx.state === "suspended") ctx.resume();
    return true;
  }

  // one beep: frequency, start time, length, wave shape, loudness, optional slide to another pitch
  function tone(freq, start, dur, type = "square", vol = 0.2, slideTo = null, dest = master) {
    const o = ctx.createOscillator(), g = ctx.createGain();
    o.type = type;
    o.frequency.setValueAtTime(freq, start);
    if (slideTo) o.frequency.exponentialRampToValueAtTime(slideTo, start + dur);
    g.gain.setValueAtTime(vol, start);
    g.gain.exponentialRampToValueAtTime(0.0001, start + dur);
    o.connect(g); g.connect(dest);
    o.start(start); o.stop(start + dur + 0.02);
  }

  // a burst of static, used for explosions
  function noise(start, dur, vol = 0.3, cutoff = 800) {
    const len = Math.floor(ctx.sampleRate * dur);
    const buf = ctx.createBuffer(1, len, ctx.sampleRate), d = buf.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / len);
    const src = ctx.createBufferSource();
    src.buffer = buf;
    const f = ctx.createBiquadFilter();
    f.type = "lowpass"; f.frequency.value = cutoff;
    const g = ctx.createGain();
    g.gain.value = vol;
    src.connect(f); f.connect(g); g.connect(master);
    src.start(start);
  }

  const N = (m) => 440 * Math.pow(2, (m - 69) / 12);   // note number -> Hz (69 = A4)

  const sfx = {
    place:      (t) => { tone(N(72), t, .07, "square", .18); tone(N(79), t + .06, .08, "square", .18); },
    lock:       (t) => tone(N(76), t, .09, "square", .2),
    ready:      (t) => { tone(N(72), t, .08); tone(N(76), t + .08, .08); tone(N(79), t + .16, .14); },
    unready:    (t) => { tone(N(79), t, .08); tone(N(72), t + .08, .12); },
    zap:        (t) => { tone(1600, t, .28, "sawtooth", .16, 120); tone(900, t, .2, "square", .08, 100); },
    boom:       (t) => { noise(t, .5, .5, 900); tone(120, t, .4, "triangle", .3, 40); },
    eliminated: (t) => { [67, 64, 60, 55].forEach((m, i) => tone(N(m), t + i * .16, .22, "triangle", .28)); },
    win:        (t) => { [72, 76, 79, 84, 79, 84].forEach((m, i) => tone(N(m), t + i * .12, .16, "square", .2));
                         tone(N(88), t + .72, .4, "square", .2); },
    lose:       (t) => { [67, 65, 64, 60].forEach((m, i) => tone(N(m), t + i * .2, .25, "triangle", .22)); },
    shrink:     (t) => { tone(180, t, .5, "sawtooth", .15, 60); noise(t, .4, .15, 400); },
    start:      (t) => { [60, 64, 67, 72].forEach((m, i) => tone(N(m), t + i * .09, .12, "square", .2)); },
    tick:       (t) => tone(N(84), t, .04, "square", .12),
  };

  function play(name) {
    if (muted || !ensure()) return;
    const f = sfx[name];
    if (f) f(ctx.currentTime + 0.01);
  }

  // a cute little looping tune: a square-wave melody over a triangle-wave bass, 32 steps long
  const MELODY = [72, 0, 76, 0, 79, 76, 0, 72,  74, 0, 77, 0, 81, 77, 0, 74,
                  76, 0, 79, 0, 84, 79, 0, 76,  79, 77, 76, 74, 72, 0, 67, 0];
  const BASS   = [48, 0, 48, 0, 48, 0, 55, 0,   53, 0, 53, 0, 53, 0, 60, 0,
                  55, 0, 55, 0, 55, 0, 59, 0,   48, 0, 55, 0, 48, 0, 43, 0];

  function schedule() {
    while (nextNoteTime < ctx.currentTime + 0.3) {
      const i = step % MELODY.length;
      if (MELODY[i]) tone(N(MELODY[i]), nextNoteTime, .16, "square", .5, null, musicBus);
      if (BASS[i]) tone(N(BASS[i]), nextNoteTime, .34, "triangle", .7, null, musicBus);
      nextNoteTime += .2;
      step++;
    }
  }
  function startMusic() {
    if (musicOn || !ensure()) return;
    musicOn = true;
    nextNoteTime = ctx.currentTime + 0.1;
    setInterval(schedule, 100);
  }

  return {
    unlock() { if (ensure()) startMusic(); },
    play,
    isMuted: () => muted,
    toggleMute() {
      muted = !muted;
      try { localStorage.setItem("vexelMuted", muted ? "1" : "0"); } catch (e) { /* ignore */ }
      if (master) master.gain.value = muted ? 0 : 0.7;
      return muted;
    },
  };
})();