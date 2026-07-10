import React, { useEffect, useRef } from 'react';

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

    const particles = Array.from({ length: 34 }, () => ({
      x: Math.random() * window.innerWidth,
      y: Math.random() * window.innerHeight,
      r: Math.random() * 1 + 0.35,
      dx: (Math.random() - 0.5) * 0.12,
      dy: (Math.random() - 0.5) * 0.12,
      alpha: Math.random() * 0.28 + 0.06,
      dAlpha: (Math.random() - 0.5) * 0.0015,
      gold: Math.random() > 0.42,
    }));

    const drawFrame = (animate = true) => {
      ctx.clearRect(0, 0, window.innerWidth, window.innerHeight);
      particles.forEach((particle) => {
        if (animate) {
          particle.x += particle.dx;
          particle.y += particle.dy;
          particle.alpha += particle.dAlpha;
          if (particle.alpha <= 0.04 || particle.alpha >= 0.36) particle.dAlpha *= -1;
          if (particle.x < 0) particle.x = window.innerWidth;
          if (particle.x > window.innerWidth) particle.x = 0;
          if (particle.y < 0) particle.y = window.innerHeight;
          if (particle.y > window.innerHeight) particle.y = 0;
        }

        ctx.beginPath();
        ctx.arc(particle.x, particle.y, particle.r, 0, Math.PI * 2);
        ctx.fillStyle = particle.gold
          ? `rgba(224, 169, 42, ${particle.alpha})`
          : `rgba(148, 116, 205, ${particle.alpha * 0.72})`;
        ctx.fill();
      });
    };

    const draw = () => {
      drawFrame(true);
      animId = requestAnimationFrame(draw);
    };

    if (reducedMotion) drawFrame(false);
    else draw();

    return () => {
      if (animId) cancelAnimationFrame(animId);
      window.removeEventListener('resize', resize);
    };
  }, []);

  return (
    <canvas
      ref={canvasRef}
      className="pointer-events-none fixed inset-0 z-0 opacity-30"
      aria-hidden
    />
  );
}
