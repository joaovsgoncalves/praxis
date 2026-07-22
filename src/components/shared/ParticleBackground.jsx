import React, { useEffect, useRef } from 'react';

/**
 * Fundo de partículas ouro/ember — legível no shell, sem roxo de template.
 * Ember-like: sobem devagar + fade, ~28 sprites.
 */
export default function ParticleBackground() {
  const canvasRef = useRef(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return undefined;
    const ctx = canvas.getContext('2d');
    if (!ctx) return undefined;

    let animId;
    const reducedMotion = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;

    const resize = () => {
      const ratio = Math.min(window.devicePixelRatio || 1, 1.5);
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
      y: fromBottom ? H() + Math.random() * 40 : Math.random() * H(),
      r: 0.9 + Math.random() * 1.8,
      vx: (Math.random() - 0.5) * 0.18,
      vy: -0.18 - Math.random() * 0.42,
      life: 0,
      maxLife: 4200 + Math.random() * 5200,
      // gold → warm ember, never purple
      hue: 34 + Math.random() * 14,
    });

    const particles = Array.from({ length: 28 }, () => spawn(false));

    const drawFrame = (dt, animate) => {
      ctx.clearRect(0, 0, W(), H());

      while (particles.length < 28) particles.push(spawn(true));

      for (let i = particles.length - 1; i >= 0; i -= 1) {
        const p = particles[i];
        if (animate) {
          p.life += dt;
          p.x += p.vx;
          p.y += p.vy;
          p.vx += (Math.random() - 0.5) * 0.008;
        }

        const t = p.life / p.maxLife;
        if (animate && (t >= 1 || p.y < -12)) {
          particles.splice(i, 1);
          continue;
        }

        const fade = t < 0.12 ? t / 0.12 : 1 - (t - 0.12) / 0.88;
        const alpha = Math.max(0.05, fade * 0.55);
        const radius = p.r * (1 - t * 0.35);

        const glow = ctx.createRadialGradient(p.x, p.y, 0, p.x, p.y, radius * 5);
        glow.addColorStop(0, `hsla(${p.hue}, 92%, 62%, ${alpha})`);
        glow.addColorStop(0.55, `hsla(${p.hue}, 88%, 48%, ${alpha * 0.35})`);
        glow.addColorStop(1, `hsla(${p.hue}, 80%, 40%, 0)`);
        ctx.fillStyle = glow;
        ctx.beginPath();
        ctx.arc(p.x, p.y, radius * 5, 0, Math.PI * 2);
        ctx.fill();

        ctx.fillStyle = `hsla(${p.hue}, 95%, 72%, ${alpha * 0.95})`;
        ctx.beginPath();
        ctx.arc(p.x, p.y, radius, 0, Math.PI * 2);
        ctx.fill();
      }
    };

    if (reducedMotion) {
      drawFrame(0, false);
      return () => {
        window.removeEventListener('resize', resize);
      };
    }

    let prev = performance.now();
    const draw = (now) => {
      const dt = Math.min(48, now - prev);
      prev = now;
      drawFrame(dt, true);
      animId = requestAnimationFrame(draw);
    };
    animId = requestAnimationFrame(draw);

    return () => {
      if (animId) cancelAnimationFrame(animId);
      window.removeEventListener('resize', resize);
    };
  }, []);

  return (
    <canvas
      ref={canvasRef}
      className="pointer-events-none fixed inset-0 z-0 opacity-[0.52]"
      aria-hidden
    />
  );
}
