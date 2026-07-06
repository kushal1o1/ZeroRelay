import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "0Relay",
  description: "Peer-to-peer file sharing on the network",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        <script
          // biome-ignore lint/security/noDangerouslySetInnerHtml: needed for FOUC prevention
          dangerouslySetInnerHTML={{
            __html: `
              try {
                if (localStorage.getItem("theme") === "dark" || (!localStorage.getItem("theme") && window.matchMedia("(prefers-color-scheme: dark)").matches)) {
                  document.documentElement.classList.add("dark");
                }
              } catch(e) {}
            `,
          }}
        />
      </head>
      <body className="antialiased">{children}</body>
    </html>
  );
}
