import React, { useEffect, useRef } from 'react';

/**
 * Fundo de partículas ouro/ember — visível e em movimento calmo.
 * Pontos sobem com drift; halo contido. Sem roxo.
 * Respeita prefers-reduced-motion (campo estático nesses casos).
 */
export default function ParticleBackground() {
  const canvasRef = useRef(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return undefined;
    const ctx = canvas.getContext('2d', { alpha: true });
    if (!ctx) return undefined;

    let animId = 0;
    let running = true;
    let reducedMotion = window.matchMedia?.('(prefers-reduced-motion: reduce)')?.matches === true;
    const motionQuery = window.matchMedia?.('(prefers-reduced-motion: reduce)');

    const targetCount = () => {
      const area = window.innerWidth * window.innerHeight;
      // denser field so movement reads even on large screens
      return Math.max(36, Math.min(64, Math.round(area / 16000)));
    };

    const resize = () => {
      const ratio = Math.min(window.devicePixelRatio || 1, 2);
      const w = Math.max(1, window.innerWidth);
      const h = Math.max(1, window.innerHeight);
      canvas.width = Math.round(w * ratio);
      canvas.height = Math.round(h * ratio);
      canvas.style.width = `${w}px`;
      canvas.style.height = `${h}px`;
      ctx.setTransform(ratio, 0, 0, ratio, 0, 0);
    };

    resize();
    window.addEventListener('resize', resize);

    const W = () => window.innerWidth;
    const H = () => window.innerHeight;

    const spawn = (fromBottom = true) => ({
      x: Math.random() * W(),
      y: fromBottom ? H() + Math.random() * 40 : Math.random() * H(),
      // larger core so the rise is readable at a glance
      r: 1.1 + Math.random() * 1.8,
      // px/sec — calm but clearly alive (~0.8–2.2px/frame @60fps)
      vx: (Math.random() - 0.5) * 22,
      vy: -(42 + Math.random() * 56),
      life: 0,
      maxLife: 6 + Math.random() * 7,
      hue: 34 + Math.random() * 14,
      twinkle: Math.random() * Math.PI * 2,
    });

    const particles = Array.from({ length: targetCount() }, () => spawn(false));

    const drawFrame = (dtSec, animate) => {
      const width = W();
      const height = H();
      if (width < 1 || height < 1) return;

      ctx.clearRect(0, 0, width, height);

      const want = targetCount();
      while (particles.length < want) particles.push(spawn(true));

      for (let i = particles.length - 1; i >= 0; i -= 1) {
        const p = particles[i];
        if (animate) {
          p.life += dtSec;
          p.x += p.vx * dtSec;
          p.y += p.vy * dtSec;
          p.twinkle += dtSec * 2.6;
          p.vx += Math.sin(p.twinkle) * 4.5 * dtSec;
        }

        const t = p.life / p.maxLife;
        if (animate && (t >= 1 || p.y < -30 || p.x < -50 || p.x > width + 50)) {
          particles.splice(i, 1);
          continue;
        }

        const envelope = t < 0.1 ? t / 0.1 : t > 0.72 ? (1 - t) / 0.28 : 1;
        const twinkle = 0.78 + Math.sin(p.twinkle) * 0.22;
        // stronger alpha so motion is obvious under card washes
        const alpha = Math.max(0.12, envelope * twinkle * 0.62);
        const radius = p.r * (1 - t * 0.22);
        const halo = radius * 4.2;

        const glow = ctx.createRadialGradient(p.x, p.y, 0, p.x, p.y, halo);
        glow.addColorStop(0, `hsla(${p.hue}, 94%, 66%, ${alpha})`);
        glow.addColorStop(0.5, `hsla(${p.hue}, 90%, 54%, ${alpha * 0.34})`);
        glow.addColorStop(1, `hsla(${p.hue}, 82%, 46%, 0)`);
        ctx.fillStyle = glow;
        ctx.beginPath();
        ctx.arc(p.x, p.y, halo, 0, Math.PI * 2);
        ctx.fill();

        ctx.fillStyle = `hsla(${p.hue}, 98%, 78%, ${Math.min(0.95, alpha * 1.05)})`;
        ctx.beginPath();
        ctx.arc(p.x, p.y, Math.max(0.7, radius * 0.75), 0, Math.PI * 2);
        ctx.fill();
      }
    };

    const stopLoop = () => {
      if (animId) {
        cancelAnimationFrame(animId);
        animId = 0;
      }
    };

    let prev = performance.now();
    const tick = (now) => {
      if (!running) return;
      if (reducedMotion) {
        animId = 0;
        return;
      }
      const dtSec = Math.min(0.05, (now - prev) / 1000);
      prev = now;
      drawFrame(dtSec, true);
      animId = requestAnimationFrame(tick);
    };

    const startLoop = () => {
      stopLoop();
      if (reducedMotion) {
        for (const p of particles) {
          if (p.life === 0) p.life = p.maxLife * (0.15 + Math.random() * 0.45);
        }
        drawFrame(0, false);
        return;
      }
      prev = performance.now();
      animId = requestAnimationFrame(tick);
    };

    const onMotionChange = (event) => {
      reducedMotion = event.matches === true;
      startLoop();
    };

    // pause when tab hidden — saves battery and avoids huge dt jumps
    const onVisibility = () => {
      if (document.hidden) {
        stopLoop();
        return;
      }
      prev = performance.now();
      startLoop();
    };

    motionQuery?.addEventListener?.('change', onMotionChange);
    document.addEventListener('visibilitychange', onVisibility);
    startLoop();

    return () => {
      running = false;
      stopLoop();
      window.removeEventListener('resize', resize);
      document.removeEventListener('visibilitychange', onVisibility);
      motionQuery?.removeEventListener?.('change', onMotionChange);
    };
  }, []);

  return (
    <canvas
      ref={canvasRef}
      className="pointer-events-none fixed inset-0 z-0 opacity-[0.72]"
      aria-hidden
    />
  );
}
