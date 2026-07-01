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

const colors = [
  "bg-blue-500",
  "bg-green-500",
  "bg-orange-500",
  "bg-purple-500",
  "bg-pink-500",
  "bg-teal-500",
  "bg-indigo-500",
  "bg-rose-500",
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
