import { hashString } from "@/lib/hash";
import { useAvatarStore } from "@/stores/avatar-store";
import { useEffect } from "react";

interface AvatarProps {
  name: string;
  peerId?: string;
  size?: "sm" | "md" | "lg";
}

const sizeMap = { sm: "size-7 text-xs", md: "size-10 text-sm", lg: "size-14 text-lg" };
const imgSizeMap = { sm: "size-7", md: "size-10", lg: "size-14" };

// Monochrome palette — distinct gray shades (all dark enough for white text)
const colors = [
  "bg-neutral-800",
  "bg-neutral-600",
  "bg-zinc-700",
  "bg-zinc-500",
  "bg-stone-700",
  "bg-stone-500",
  "bg-gray-700",
  "bg-neutral-500",
];

function hashColor(name: string) {
  return colors[hashString(name) % colors.length];
}

export function Avatar({ name, peerId, size = "md" }: AvatarProps) {
  const dataUrl = peerId ? useAvatarStore((s) => s.map[peerId]) : undefined;
  const loadFromDexie = useAvatarStore((s) => s.loadFromDexie);

  useEffect(() => {
    if (peerId) loadFromDexie();
  }, [peerId, loadFromDexie]);

  if (dataUrl) {
    return (
      <img src={dataUrl} alt={name} className={`${imgSizeMap[size]} rounded-full object-cover`} />
    );
  }

  const initial = name.charAt(0).toUpperCase();
  return (
    <div
      className={`${sizeMap[size]} ${hashColor(name)} flex items-center justify-center rounded-full text-white font-medium`}
    >
      {initial}
    </div>
  );
}
