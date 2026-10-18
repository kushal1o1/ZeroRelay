const features = [
  {
    title: "Mesh Topology",
    desc: "Every peer connects to every other peer directly. No central server bottleneck.",
  },
  {
    title: "Private Rooms",
    desc: "Share a room code, add an optional password. Only the creator can delete it.",
  },
  {
    title: "Any File Type",
    desc: "Share text, code, notes, or files of any size. Drag, drop, done.",
  },
  {
    title: "Retention Control",
    desc: "Per-item: session, 5 min, 1 hour, 1 day, or forever. You decide.",
  },
  {
    title: "Local Network",
    desc: "Global is scoped to your network: devices on the same WiFi find each other instantly.",
  },
  {
    title: "Dark Mode",
    desc: "Full light / dark theme support. Comfortable day or night.",
  },
];

export function Features() {
  return (
    <div className="grid gap-4 md:grid-cols-2 md:gap-6">
      {features.map((f) => (
        <div key={f.title} className="rounded-xl border border-border bg-card p-5 md:p-6">
          <h3 className="font-semibold">{f.title}</h3>
          <p className="mt-1.5 text-sm leading-relaxed text-muted-foreground">{f.desc}</p>
        </div>
      ))}
    </div>
  );
}
