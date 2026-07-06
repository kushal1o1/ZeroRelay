const SIZES = {
  sm: { text: "text-sm", icon: "size-4", gap: "gap-0.5" },
  md: { text: "text-lg", icon: "size-5", gap: "gap-0.5" },
  lg: { text: "text-2xl", icon: "size-7", gap: "gap-1" },
  xl: { text: "text-5xl md:text-7xl", icon: "size-12 md:size-16", gap: "gap-1.5" },
} as const;

/** Bold theta (θ) glyph with a hard offset shadow layer for a 3D/embossed feel.
 * The shadow uses a mid-gray so it reads on both light and dark backgrounds.
 * Stands in for the "0" in ZeroRelay; inherits its main color via currentColor. */
function ThetaIcon({ className = "" }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 26 26"
      fill="none"
      aria-hidden="true"
      className={`shrink-0 ${className}`}
      strokeLinecap="round"
      strokeWidth={4}
    >
      <g transform="translate(1.4,2)" stroke="var(--color-muted-foreground)">
        <ellipse cx="12" cy="12" rx="7" ry="9" />
        <line x1="6.4" y1="12" x2="17.6" y2="12" />
      </g>
      <g stroke="currentColor">
        <ellipse cx="12" cy="12" rx="7" ry="9" />
        <line x1="6.4" y1="12" x2="17.6" y2="12" />
      </g>
    </svg>
  );
}

/**
 * The ZeroRelay wordmark: a bold, 3D theta (the brand icon, standing in for
 * "0") tight against a bold "Relay". Reused in the topbar, landing, etc.
 */
export function Logo({
  size = "md",
  className = "",
}: {
  size?: keyof typeof SIZES;
  className?: string;
}) {
  const s = SIZES[size];
  return (
    <span
      aria-label="ZeroRelay"
      className={`inline-flex select-none items-center font-mono font-extrabold tracking-tight ${s.gap} ${s.text} ${className}`}
    >
      <ThetaIcon className={`${s.icon} text-foreground`} />
      <span aria-hidden="true" className="text-muted-foreground">
        Relay
      </span>
    </span>
  );
}
