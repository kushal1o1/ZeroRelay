const SIZES = {
  sm: { text: "text-sm", icon: "size-4", ml: "-ml-1" },
  md: { text: "text-lg", icon: "size-5", ml: "-ml-1" },
  lg: { text: "text-2xl", icon: "size-7", ml: "-ml-1.5" },
  xl: { text: "text-5xl md:text-7xl", icon: "size-12 md:size-16", ml: "-ml-3" },
} as const;

/** Bold theta (θ) glyph with a hard offset shadow layer for a 3D/embossed feel.
 * Shadow layer uses currentColor at low opacity so it works in strict
 * black/white themes without needing a separate muted-color token.
 * Stands in for the "0" in ZeroRelay; inherits color via currentColor. */
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
      {/* offset shadow layer */}
      <g transform="translate(1.4,2)" stroke="currentColor" strokeOpacity="0.35">
        <ellipse cx="12" cy="12" rx="7" ry="9" />
        <line x1="6.4" y1="12" x2="17.6" y2="12" />
      </g>
      {/* main layer */}
      <g stroke="currentColor">
        <ellipse cx="12" cy="12" rx="7" ry="9" />
        <line x1="6.4" y1="12" x2="17.6" y2="12" />
      </g>
    </svg>
  );
}

/**
 * The ZeroRelay wordmark: a bold, 3D theta (the brand icon, standing in for
 * "0") tight against a bold "Relay". Both pull from the same black/white
 * foreground token — "Relay" is dialed down slightly via opacity so the icon
 * reads as the anchor without introducing a second color.
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
      className={`inline-flex select-none items-center font-mono font-extrabold tracking-tight text-foreground ${s.text} ${className}`}
    >
      <ThetaIcon className={`${s.icon}`} />
      <span aria-hidden="true" className={`opacity-80 ${s.ml}`}>
        Relay
      </span>
    </span>
  );
}
