// Leitor de áudio: forma de onda clicável, recuar/avançar 15 s e velocidade de reprodução.
const SPEEDS = [0.75, 1, 1.25, 1.5, 2];
const fmt = (s: number) => (Number.isFinite(s) ? `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, '0')}` : '0:00');

export function createAudioPlayer(url: string): HTMLElement {
  const wrap = document.createElement('div');
  wrap.className = 'ap';
  const audio = document.createElement('audio');
  audio.preload = 'metadata';
  audio.src = url;
  const btn = (cls: string, html: string, title: string) => {
    const b = document.createElement('button');
    b.type = 'button';
    b.className = 'ap-btn ' + cls;
    b.innerHTML = html;
    b.title = title;
    return b;
  };
  const back = btn('ap-skip', '↺<small>15</small>', 'Recuar 15 segundos');
  const play = btn('ap-play', '▶', 'Reproduzir');
  const fwd = btn('ap-skip', '↻<small>15</small>', 'Avançar 15 segundos');
  const canvas = document.createElement('canvas');
  canvas.className = 'ap-wave';
  canvas.title = 'Clique para saltar para esse momento';
  const time = document.createElement('span');
  time.className = 'ap-time';
  time.textContent = '0:00 / 0:00';
  const speed = btn('ap-speed', '1×', 'Velocidade de reprodução');
  wrap.append(back, play, fwd, canvas, time, speed, audio);

  let peaks: number[] | null = null;
  const draw = () => {
    const w = (canvas.width = canvas.clientWidth * devicePixelRatio || 300);
    const h = (canvas.height = 36 * devicePixelRatio);
    const ctx = canvas.getContext('2d')!;
    ctx.clearRect(0, 0, w, h);
    const n = Math.max(30, Math.floor(w / (4 * devicePixelRatio)));
    const progress = audio.duration ? audio.currentTime / audio.duration : 0;
    const style = getComputedStyle(wrap);
    const on = style.getPropertyValue('--accent').trim() || '#4f46e5';
    const off = style.getPropertyValue('--border').trim() || '#ddd';
    for (let i = 0; i < n; i++) {
      const p = peaks ? peaks[Math.floor((i / n) * peaks.length)] : 0.25 + 0.15 * Math.sin(i * 0.9);
      const bh = Math.max(2 * devicePixelRatio, p * h * 0.9);
      ctx.fillStyle = i / n < progress ? on : off;
      ctx.fillRect(i * (w / n), (h - bh) / 2, Math.max(1, w / n - 2 * devicePixelRatio), bh);
    }
  };
  const loadPeaks = async () => {
    if (peaks) return;
    try {
      const buf = await (await fetch(url)).arrayBuffer();
      const ac = new AudioContext();
      const data = (await ac.decodeAudioData(buf)).getChannelData(0);
      ac.close();
      const N = 200, step = Math.floor(data.length / N) || 1;
      const out: number[] = [];
      for (let i = 0; i < N; i++) {
        let m = 0;
        for (let j = i * step; j < Math.min(data.length, (i + 1) * step); j += 16) m = Math.max(m, Math.abs(data[j]));
        out.push(m);
      }
      const max = Math.max(...out, 0.01);
      peaks = out.map((v) => v / max);
      draw();
    } catch {}
  };
  const update = () => {
    time.textContent = `${fmt(audio.currentTime)} / ${fmt(audio.duration)}`;
    play.textContent = audio.paused ? '▶' : '❚❚';
    play.title = audio.paused ? 'Reproduzir' : 'Pausa';
    draw();
  };
  play.onclick = () => { audio.paused ? audio.play() : audio.pause(); loadPeaks(); };
  back.onclick = () => { audio.currentTime = Math.max(0, audio.currentTime - 15); };
  fwd.onclick = () => { audio.currentTime = Math.min(audio.duration || 0, audio.currentTime + 15); };
  speed.onclick = () => {
    const i = (SPEEDS.indexOf(audio.playbackRate) + 1) % SPEEDS.length;
    audio.playbackRate = SPEEDS[i];
    speed.textContent = String(SPEEDS[i]).replace('.', ',') + '×';
  };
  canvas.onclick = (e) => {
    if (!audio.duration) return;
    const r = canvas.getBoundingClientRect();
    audio.currentTime = ((e.clientX - r.left) / r.width) * audio.duration;
    loadPeaks();
  };
  ['timeupdate', 'play', 'pause', 'loadedmetadata', 'ended'].forEach((ev) => audio.addEventListener(ev, update));
  new ResizeObserver(draw).observe(canvas);
  requestAnimationFrame(draw);
  return wrap;
}
