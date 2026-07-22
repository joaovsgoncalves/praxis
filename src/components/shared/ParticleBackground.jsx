import React, { useEffect, useRef } from 'react';

/**
 * Fundo de partículas ouro/ember — bem legível no shell.
 * Brasas sobem com halo; sem roxo. Respeita prefers-reduced-motion.
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

    const COUNT = () => {
      const area = window.innerWidth * window.innerHeight;
      // ~48 on phone, ~70 on desktop — dense enough to notice
      return Math.max(42, Math.min(72, Math.round(area / 14000)));
    };

    const resize = () => {
      const ratio = Math.min(window.devicePixelRatio || 1, 2);
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

    const spawn = (fromBottom = true) => {
      const big = Math.random() > 0.72;
      return {
        x: Math.random() * W(),
        y: fromBottom ? H() + Math.random() * 60 : Math.random() * H(),
        r: big ? 2.2 + Math.random() * 2.4 : 1.3 + Math.random() * 1.6,
        vx: (Math.random() - 0.5) * 0.22,
        vy: -0.22 - Math.random() * (big ? 0.55 : 0.38),
        life: fromBottom ? 0 : Math.random() * 2800,
        maxLife: 3800 + Math.random() * 4800,
        hue: 32 + Math.random() * 16, // gold → warm amber
        glowMul: big ? 7.5 : 5.5,
      };
    };

    const particles = Array.from({ length: COUNT() }, () => spawn(false));

    const drawFrame = (dt, animate) => {
      ctx.clearRect(0, 0, W(), H());

      const target = COUNT();
      while (particles.length < target) particles.push(spawn(true));

      for (let i = particles.length - 1; i >= 0; i -= 1) {
        const p = particles[i];
        if (animate) {
          p.life += dt;
          p.x += p.vx;
          p.y += p.vy;
          p.vx += (Math.random() - 0.5) * 0.01;
        }

        const t = p.life / p.maxLife;
        if (animate && (t >= 1 || p.y < -16)) {
          particles.splice(i, 1);
          continue;
        }

        // Hold peak brightness longer, softer fade out
        const fade = t < 0.08 ? t / 0.08 : t > 0.72 ? (1 - t) / 0.28 : 1;
        const alpha = Math.max(0.18, fade * 0.92);
        const radius = p.r * (1 - t * 0.28);
        const halo = radius * p.glowMul;

        const glow = ctx.createRadialGradient(p.x, p.y, 0, p.x, p.y, halo);
        glow.addColorStop(0, `hsla(${p.hue}, 96%, 68%, ${alpha})`);
        glow.addColorStop(0.35, `hsla(${p.hue}, 94%, 56%, ${alpha * 0.55})`);
        glow.addColorStop(0.7, `hsla(${p.hue}, 90%, 48%, ${alpha * 0.18})`);
        glow.addColorStop(1, `hsla(${p.hue}, 85%, 42%, 0)`);
        ctx.fillStyle = glow;
        ctx.beginPath();
        ctx.arc(p.x, p.y, halo, 0, Math.PI * 2);
        ctx.fill();

        // Bright core
        ctx.fillStyle = `hsla(${p.hue}, 100%, 82%, ${Math.min(1, alpha * 1.15)})`;
        ctx.beginPath();
        ctx.arc(p.x, p.y, Math.max(0.8, radius * 0.85), 0, Math.PI * 2);
        ctx.fill();
      }
    };

    if (reducedMotion) {
      // Static field — still visible without motion
      for (const p of particles) {
        p.life = p.maxLife * 0.35;
      }
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
      className="pointer-events-none fixed inset-0 z-0 opacity-90"
      aria-hidden
    />
  );
}
