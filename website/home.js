/* YUMIA — animations de la page d'accueil (aucune bibliothèque). */
(() => {
  const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  // ---------------------------------------------------------------- en-tête qui se fige au défilement
  const top = document.getElementById('top');
  const onScroll = () => top.classList.toggle('solid', window.scrollY > 30);
  onScroll();
  window.addEventListener('scroll', onScroll, { passive: true });

  // ---------------------------------------------------------------- ciel étoilé
  const cv = document.getElementById('stars');
  const ctx = cv.getContext('2d');
  let stars = [];
  const resize = () => {
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    cv.width = innerWidth * dpr; cv.height = innerHeight * dpr;
    cv.style.width = innerWidth + 'px'; cv.style.height = innerHeight + 'px';
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    const n = Math.round(innerWidth * innerHeight / 9000);
    stars = Array.from({ length: n }, () => ({
      x: Math.random() * innerWidth, y: Math.random() * innerHeight * 1.6,
      r: Math.random() * 1.3 + 0.3, p: Math.random() * 6.28, s: Math.random() * 0.8 + 0.4, d: Math.random() * 0.5 + 0.2,
    }));
  };
  resize();
  window.addEventListener('resize', resize);
  const draw = (t) => {
    ctx.clearRect(0, 0, innerWidth, innerHeight);
    const sy = window.scrollY;
    for (const s of stars) {
      const a = reduce ? 0.5 : 0.25 + 0.6 * (0.5 + 0.5 * Math.sin(t / 1000 * s.s + s.p));
      const y = ((s.y - sy * s.d) % (innerHeight * 1.6) + innerHeight * 1.6) % (innerHeight * 1.6);
      if (y > innerHeight) continue;
      ctx.globalAlpha = a;
      ctx.fillStyle = '#fff';
      ctx.beginPath(); ctx.arc(s.x, y, s.r, 0, 6.283); ctx.fill();
    }
    if (!reduce) requestAnimationFrame(draw);
  };
  requestAnimationFrame(draw);

  // ---------------------------------------------------------------- envies tapées dans la barre
  const typed = document.getElementById('typed');
  const wishes = ["J'ai faim, quoi de bon ?", 'Un rooftop pour ce soir', 'Une balade en famille', 'Un spa pour souffler',
    'Un escape game entre amis', 'Surprends-moi !'];
  if (!reduce && typed) {
    let w = 0, i = wishes[0].length, del = true;
    const tick = () => {
      const s = wishes[w];
      if (del) {
        i--;
        if (i <= 0) { del = false; w = (w + 1) % wishes.length; }
      } else {
        i++;
        if (i >= wishes[w].length) { del = true; typed.textContent = wishes[w]; return setTimeout(tick, 1900); }
      }
      typed.textContent = wishes[w].slice(0, Math.max(0, i)) || ' ';
      setTimeout(tick, del ? 32 : 62);
    };
    setTimeout(tick, 2200);
  }

  // ---------------------------------------------------------------- téléphones en 3D qui suivent la souris
  const stage = document.getElementById('stage');
  if (stage && !reduce && window.matchMedia('(pointer: fine)').matches) {
    const inner = stage.querySelector('.stage-inner');
    window.addEventListener('pointermove', (e) => {
      const x = e.clientX / innerWidth - 0.5, y = e.clientY / innerHeight - 0.5;
      inner.style.setProperty('--ry', `${(-6 + x * 16).toFixed(2)}deg`);
      inner.style.setProperty('--rx', `${(4 - y * 10).toFixed(2)}deg`);
    }, { passive: true });
  }

  // ---------------------------------------------------------------- apparitions au défilement
  const io = new IntersectionObserver((entries) => {
    for (const e of entries) if (e.isIntersecting) { e.target.classList.add('in'); io.unobserve(e.target); }
  }, { threshold: 0.18 });
  document.querySelectorAll('.reveal, #socialStage, #zero').forEach((el) => io.observe(el));

  // ---------------------------------------------------------------- compteurs
  const counters = new IntersectionObserver((entries) => {
    for (const e of entries) {
      if (!e.isIntersecting) continue;
      counters.unobserve(e.target);
      const end = +e.target.dataset.count;
      if (reduce) { e.target.textContent = end; continue; }
      const t0 = performance.now();
      const step = (t) => {
        const p = Math.min(1, (t - t0) / 1400);
        e.target.textContent = Math.round(end * (1 - Math.pow(1 - p, 3)));
        if (p < 1) requestAnimationFrame(step);
      };
      requestAnimationFrame(step);
    }
  }, { threshold: 0.6 });
  document.querySelectorAll('[data-count]').forEach((el) => counters.observe(el));

  // ---------------------------------------------------------------- « Comment ça marche » : le téléphone suit les étapes
  const steps = [...document.querySelectorAll('.step')];
  const screens = [...document.querySelectorAll('[data-screen]')];
  const bar = document.getElementById('progress');
  const setStep = (n) => {
    steps.forEach((s, i) => s.classList.toggle('active', i === n));
    screens.forEach((s, i) => s.classList.toggle('on', i === n));
    if (bar) bar.style.height = `${((n + 1) / steps.length) * 100}%`;
  };
  const so = new IntersectionObserver((entries) => {
    for (const e of entries) if (e.isIntersecting) setStep(+e.target.dataset.step);
  }, { rootMargin: '-45% 0px -45% 0px' });
  steps.forEach((s) => so.observe(s));
  setStep(0);

  // ---------------------------------------------------------------- vidéo : chargée et lancée quand elle est visible
  const film = document.getElementById('film');
  const sound = document.getElementById('sound');
  if (film) {
    const vo = new IntersectionObserver((entries) => {
      for (const e of entries) {
        if (e.isIntersecting) {
          const src = film.querySelector('source');
          if (src && !src.src) { src.src = src.dataset.src; film.load(); }
          if (!reduce) film.play().catch(() => {});
        } else film.pause();
      }
    }, { threshold: 0.35 });
    vo.observe(film);
    sound.addEventListener('click', () => {
      film.muted = !film.muted;
      sound.textContent = film.muted ? '🔊 Activer le son' : '🔇 Couper le son';
      if (!film.muted) film.play().catch(() => {});
    });
  }
})();
