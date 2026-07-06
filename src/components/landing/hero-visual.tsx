"use client";
import { useCallback, useEffect, useRef, useState, type CSSProperties } from "react";

interface PoolPeer {
  id: number;
  name: string;
  avatar: string;
}

interface ActivePeer extends PoolPeer {
  poolId: number;
  angle: number;
  radiusPct: number;
  key: string;
  fading: boolean;
}

const peerPool: PoolPeer[] = [
  { id: 1, name: "Alice", avatar: "https://randomuser.me/api/portraits/women/44.jpg" },
  { id: 2, name: "Bob", avatar: "https://randomuser.me/api/portraits/men/32.jpg" },
  { id: 3, name: "Carol", avatar: "https://randomuser.me/api/portraits/women/68.jpg" },
  { id: 4, name: "Dave", avatar: "https://randomuser.me/api/portraits/men/75.jpg" },
  { id: 5, name: "Elena", avatar: "https://randomuser.me/api/portraits/women/21.jpg" },
  { id: 6, name: "Farid", avatar: "https://randomuser.me/api/portraits/men/16.jpg" },
  { id: 7, name: "Grace", avatar: "https://randomuser.me/api/portraits/women/56.jpg" },
  { id: 8, name: "Hiro", avatar: "https://randomuser.me/api/portraits/men/88.jpg" },
];

const CX = 150;
const CY = 150;
const labels = [
  { text: "FILES", x: 150, y: 18 },
  { text: "CHAT", x: 282, y: 150 },
  { text: "CONTENT", x: 150, y: 286 },
  { text: "P2P", x: 18, y: 150 },
];

function toXY(angleDeg: number, radiusPct: number) {
  const rad = (angleDeg * Math.PI) / 180;
  return {
    leftPct: 50 + radiusPct * Math.cos(rad),
    topPct: 50 + radiusPct * Math.sin(rad),
  };
}

export function HeroVisual() {
  const ref = useRef<HTMLDivElement>(null);
  const [size, setSize] = useState({ w: 320, h: 320 });
  const [mounted, setMounted] = useState(false);
  const [active, setActive] = useState<ActivePeer[]>([]);
  const [failedImages, setFailedImages] = useState<Set<string>>(new Set());

  const onImgError = useCallback((key: string) => {
    setFailedImages((prev) => new Set(prev).add(key));
  }, []);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const update = () => {
      const rect = el.getBoundingClientRect();
      setSize({ w: rect.width, h: rect.height });
    };
    update();
    const obs = new ResizeObserver(update);
    obs.observe(el);
    setMounted(true);
    return () => obs.disconnect();
  }, []);

  useEffect(() => {
    const spawnOne = () => {
      setActive((prev) => {
        if (prev.length >= 4) return prev;
        const used = new Set(prev.map((p) => p.poolId));
        const candidates = peerPool.filter((p) => !used.has(p.id));
        if (!candidates.length) return prev;

        const chosen = candidates[Math.floor(Math.random() * candidates.length)];
        const angle = Math.random() * 360;
        const radiusPct = 26 + Math.random() * 16;
        const key = `${chosen.id}-${Date.now()}`;
        const life = 4000 + Math.random() * 2500;

        setTimeout(() => {
          setActive((p) => p.map((x) => (x.key === key ? { ...x, fading: true } : x)));
        }, life - 500);
        setTimeout(() => {
          setActive((p) => p.filter((x) => x.key !== key));
        }, life);

        return [...prev, { ...chosen, poolId: chosen.id, angle, radiusPct, key, fading: false }];
      });
    };

    spawnOne();
    const interval = setInterval(spawnOne, 1400);
    return () => clearInterval(interval);
  }, []);

  const packets = active.map((p) => {
    const rad = (p.angle * Math.PI) / 180;
    const dx = (p.radiusPct / 100) * Math.cos(rad) * size.w;
    const dy = (p.radiusPct / 100) * Math.sin(rad) * size.h;
    return (
      <span
        key={`packet-${p.key}`}
        className="hero-packet"
        style={{ "--dx": `${dx}px`, "--dy": `${dy}px` } as CSSProperties}
      />
    );
  });

  return (
    <div
      ref={ref}
      className={`relative mx-auto h-[320px] w-[320px] md:h-[420px] md:w-[420px] ${mounted ? "hero-mounted" : ""}`}
    >
      <style jsx>{`
        .hero-node {
          position: absolute;
          transform: translate(-50%, -50%);
        }
        .hero-avatar-wrap {
          position: relative;
          animation: hero-pop 0.5s cubic-bezier(0.16, 1, 0.3, 1);
        }
        .hero-avatar {
          display: block;
          border-radius: 9999px;
          object-fit: cover;
          background: var(--color-muted);
          box-shadow:
            0 1px 2px rgba(0, 0, 0, 0.08),
            0 0 0 1px rgba(0, 0, 0, 0.08);
          animation: hero-float 5s ease-in-out infinite;
        }
        .hero-blip-ring {
          position: absolute;
          inset: -8px;
          border-radius: 9999px;
          border: 1.5px solid var(--color-signal);
          animation: hero-blip 1.1s ease-out forwards;
          pointer-events: none;
          opacity: 0.5;
        }
        .hero-center {
          position: absolute;
          top: 50%;
          left: 50%;
          transform: translate(-50%, -50%);
        }
        .hero-ring {
          position: absolute;
          inset: 0;
          border-radius: 9999px;
          border: 1.5px solid var(--color-signal);
          animation: hero-ring 3s ease-out infinite;
          opacity: 0.6;
        }
        .hero-sweep-mask {
          position: absolute;
          inset: 0;
          border-radius: 9999px;
          overflow: hidden;
          pointer-events: none;
        }
        .hero-sweep {
          position: absolute;
          inset: -20%;
          background: conic-gradient(
            from 0deg,
            rgba(128, 128, 128, 0.18),
            rgba(128, 128, 128, 0.05) 12%,
            transparent 32%
          );
          animation: hero-sweep-rotate 4s linear infinite;
          transform-origin: 50% 50%;
        }
        .hero-outer-rings {
          animation: hero-rotate 120s linear infinite;
          transform-origin: 150px 150px;
        }
        :global(.hero-packet) {
          position: absolute;
          left: 50%;
          top: 50%;
          width: 6px;
          height: 6px;
          margin-left: -3px;
          margin-top: -3px;
          border-radius: 9999px;
          background: var(--color-signal);
          box-shadow: 0 0 8px var(--color-signal);
          opacity: 0;
          animation: hero-packet 3.6s ease-in-out infinite;
        }
        .hero-glow {
          position: absolute;
          inset: 0;
          border-radius: 9999px;
          background: var(--color-signal);
          opacity: 0.05;
          pointer-events: none;
        }
        .hero-avatar-fallback {
          display: flex;
          align-items: center;
          justify-content: center;
          border-radius: 9999px;
          background: var(--color-border);
          color: var(--color-muted-foreground);
          font-weight: 600;
          font-size: 14px;
        }
        @keyframes hero-pop {
          from {
            opacity: 0;
            transform: scale(0.3);
          }
          60% {
            opacity: 1;
            transform: scale(1.08);
          }
          to {
            opacity: 1;
            transform: scale(1);
          }
        }
        @keyframes hero-blip {
          from {
            transform: scale(0.7);
            opacity: 0.9;
          }
          to {
            transform: scale(2.4);
            opacity: 0;
          }
        }
        @keyframes hero-float {
          0%,
          100% {
            transform: translateY(0);
          }
          50% {
            transform: translateY(-5px);
          }
        }
        @keyframes hero-ring {
          0% {
            transform: scale(1);
            opacity: 0.5;
          }
          100% {
            transform: scale(2.4);
            opacity: 0;
          }
        }
        @keyframes hero-sweep-rotate {
          to {
            transform: rotate(360deg);
          }
        }
        @keyframes hero-rotate {
          to {
            transform: rotate(360deg);
          }
        }
        @keyframes hero-packet {
          0% {
            transform: translate(0, 0) scale(0.5);
            opacity: 0;
          }
          15% {
            opacity: 1;
            transform: translate(0, 0) scale(1);
          }
          50% {
            transform: translate(var(--dx), var(--dy)) scale(1);
            opacity: 1;
          }
          85% {
            transform: translate(0, 0) scale(1);
            opacity: 1;
          }
          100% {
            transform: translate(0, 0) scale(0.5);
            opacity: 0;
          }
        }
        @media (prefers-reduced-motion: reduce) {
          .hero-avatar,
          .hero-ring,
          .hero-outer-rings,
          .hero-sweep,
          .hero-avatar-wrap,
          .hero-blip-ring,
          :global(.hero-packet) {
            animation: none !important;
          }
        }
      `}</style>

      <div className="hero-glow" />

      <div className="hero-sweep-mask">
        <div className="hero-sweep" />
      </div>

      <svg viewBox="0 0 300 300" className="h-full w-full">
        <g className="hero-outer-rings">
          {[40, 80, 120].map((r) => (
            <circle
              key={r}
              cx={CX}
              cy={CY}
              r={r}
              fill="none"
              stroke="currentColor"
              className="text-border"
              strokeWidth={1}
              strokeDasharray={r === 120 ? "2 6" : undefined}
              opacity={0.4}
            />
          ))}
        </g>

        {active.map((p) => {
          const rad = (p.angle * Math.PI) / 180;
          const x = CX + (p.radiusPct / 100) * 300 * Math.cos(rad);
          const y = CY + (p.radiusPct / 100) * 300 * Math.sin(rad);
          return (
            <line
              key={`line-${p.key}`}
              x1={CX}
              y1={CY}
              x2={x}
              y2={y}
              stroke="currentColor"
              className="text-border"
              strokeWidth={1}
              strokeDasharray="3 5"
              opacity={p.fading ? 0 : 0.5}
              style={{ transition: "opacity .5s ease" }}
            />
          );
        })}

        {labels.map((l) => (
          <text
            key={l.text}
            x={l.x}
            y={l.y}
            textAnchor="middle"
            className="fill-muted-foreground text-[7px] font-semibold md:text-[8px]"
            opacity={0.5}
          >
            {l.text}
          </text>
        ))}
      </svg>

      <div className="hero-center">
        <div className="relative flex size-14 items-center justify-center md:size-16">
          <span className="hero-ring" />
          <span className="hero-ring" style={{ animationDelay: "1s" }} />
          <div className="relative flex size-10 items-center justify-center rounded-full bg-card shadow-sm ring-1 ring-border md:size-12">
            <span className="text-xs font-semibold text-card-foreground">You</span>
          </div>
        </div>
      </div>

      {active.map((p) => {
        const { leftPct, topPct } = toXY(p.angle, p.radiusPct);
        return (
          <div
            key={p.key}
            className="hero-node"
            style={{
              left: `${leftPct}%`,
              top: `${topPct}%`,
              opacity: p.fading ? 0 : 1,
              transition: "opacity .5s ease",
            }}
          >
            <div className="hero-avatar-wrap">
              <span className="hero-blip-ring" />
              {failedImages.has(p.key) ? (
                <div className="hero-avatar hero-avatar-fallback size-12 md:size-14">
                  {p.name[0]}
                </div>
              ) : (
                <img
                  src={p.avatar}
                  alt={p.name}
                  width={48}
                  height={48}
                  onError={() => onImgError(p.key)}
                  className="hero-avatar size-12 md:size-14"
                />
              )}
            </div>
            <p className="mt-1 text-center text-[10px] font-medium text-muted-foreground">
              {p.name}
            </p>
          </div>
        );
      })}

      {packets}
    </div>
  );
}
