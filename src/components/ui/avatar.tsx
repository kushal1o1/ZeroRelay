interface AvatarProps {
  name: string;
  size?: "sm" | "md" | "lg";
}

const sizeMap = { sm: "size-7 text-xs", md: "size-10 text-sm", lg: "size-14 text-lg" };

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
  let hash = 0;
  for (let i = 0; i < name.length; i++) {
    hash = name.charCodeAt(i) + ((hash << 5) - hash);
  }
  return colors[Math.abs(hash) % colors.length];
}

export function Avatar({ name, size = "md" }: AvatarProps) {
  const initial = name.charAt(0).toUpperCase();
  return (
    <div
      className={`${sizeMap[size]} ${hashColor(name)} flex items-center justify-center rounded-full text-white font-medium`}
    >
      {initial}
    </div>
  );
}
