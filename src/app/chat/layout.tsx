import { RoomProvider } from "@/components/room-provider";

export default function ChatLayout({ children }: { children: React.ReactNode }) {
  return <RoomProvider>{children}</RoomProvider>;
}
