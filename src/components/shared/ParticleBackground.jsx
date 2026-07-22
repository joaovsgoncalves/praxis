import React, { useEffect, useRef } from 'react';

/**
 * Fundo de partículas ouro/ember — presente, sem gritar.
 * Pontos pequenos sobem devagar; halo contido. Sem roxo.
 */
export default function ParticleBackground() {
  const canvasRef = useRef(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return undefined;
    const ctx = canvas.getContext('2d');
    if (!ctx) return undefined;

    let animId = 0;
    let running = true;
    const reducedMotion = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;

    const targetCount = () => {
      const area = window.innerWidth * window.innerHeight;
      return Math.max(28, Math.min(44, Math.round(area / 22000)));
    };

    const resize = () => {
      const ratio = Math.min(window.devicePixelRatio || 1, 1.75);
      canvas.width = Math.round(window.innerWidth * ratio);
      canvas.height = Math.round(window.innerHeight * ratio);
      canvas.style.width = `${window.innerWidth}px`;
      canvas.style.height = `${window.innerHeight}px`;
      ctx.setTransform(ratio, 0, 0, ratio, 0, 0);
    };

    resize();
    window.addEventListener('resize', resize);

    const W = () => window.innerWidth;
    const H = () => window.innerHeight;

    const spawn = (fromBottom = true) => ({
      x: Math.random() * W(),
      y: fromBottom ? H() + Math.random() * 24 : Math.random() * H(),
      r: 0.7 + Math.random() * 1.1,
      // px per second — movement is obvious but calm
      vx: (Math.random() - 0.5) * 14,
      vy: -(18 + Math.random() * 28),
      life: 0,
      maxLife: 5.5 + Math.random() * 6.5, // seconds
      hue: 34 + Math.random() * 12,
      twinkle: Math.random() * Math.PI * 2,
    });

    const particles = Array.from({ length: targetCount() }, () => spawn(false));

    const drawFrame = (dtSec, animate) => {
      ctx.clearRect(0, 0, W(), H());

      const want = targetCount();
      while (particles.length < want) particles.push(spawn(true));

      for (let i = particles.length - 1; i >= 0; i -= 1) {
        const p = particles[i];
        if (animate) {
          p.life += dtSec;
          p.x += p.vx * dtSec;
          p.y += p.vy * dtSec;
          p.twinkle += dtSec * 2.2;
          // gentle drift
          p.vx += Math.sin(p.twinkle) * 2.5 * dtSec;
        }

        const t = p.life / p.maxLife;
        if (animate && (t >= 1 || p.y < -20 || p.x < -40 || p.x > W() + 40)) {
          particles.splice(i, 1);
          continue;
        }

        const envelope = t < 0.12 ? t / 0.12 : t > 0.75 ? (1 - t) / 0.25 : 1;
        const twinkle = 0.82 + Math.sin(p.twinkle) * 0.18;
        const alpha = Math.max(0.08, envelope * twinkle * 0.42);
        const radius = p.r * (1 - t * 0.25);
        const halo = radius * 3.6;

        const glow = ctx.createRadialGradient(p.x, p.y, 0, p.x, p.y, halo);
        glow.addColorStop(0, `hsla(${p.hue}, 92%, 64%, ${alpha})`);
        glow.addColorStop(0.55, `hsla(${p.hue}, 88%, 52%, ${alpha * 0.28})`);
        glow.addColorStop(1, `hsla(${p.hue}, 80%, 45%, 0)`);
        ctx.fillStyle = glow;
        ctx.beginPath();
        ctx.arc(p.x, p.y, halo, 0, Math.PI * 2);
        ctx.fill();

        ctx.fillStyle = `hsla(${p.hue}, 96%, 74%, ${alpha * 0.95})`;
        ctx.beginPath();
        ctx.arc(p.x, p.y, Math.max(0.55, radius * 0.7), 0, Math.PI * 2);
        ctx.fill();
      }
    };

    if (reducedMotion) {
      for (const p of particles) p.life = p.maxLife * 0.3;
      drawFrame(0, false);
      return () => window.removeEventListener('resize', resize);
    }

    let prev = performance.now();
    const tick = (now) => {
      if (!running) return;
      const dtSec = Math.min(0.05, (now - prev) / 1000);
      prev = now;
      drawFrame(dtSec, true);
      animId = requestAnimationFrame(tick);
    };
    animId = requestAnimationFrame(tick);

    return () => {
      running = false;
      cancelAnimationFrame(animId);
      window.removeEventListener('resize', resize);
    };
  }, []);

  return (
    <canvas
      ref={canvasRef}
      className="pointer-events-none fixed inset-0 z-0 opacity-[0.58]"
      aria-hidden
    />
  );
}
