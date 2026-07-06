"use client";

import Link from "next/link";
import { Features } from "@/components/landing/features";
import { HeroVisual } from "@/components/landing/hero-visual";

function GitHubIcon() {
  return (
    <svg viewBox="0 0 24 24" className="size-5" fill="currentColor">
      <path d="M12 0C5.37 0 0 5.37 0 12c0 5.31 3.435 9.795 8.205 11.385.6.105.825-.255.825-.57 0-.285-.015-1.23-.015-2.235-3.015.555-3.795-.735-4.035-1.41-.135-.345-.72-1.41-1.23-1.695-.42-.225-1.02-.78-.015-.795.945-.015 1.62.87 1.845 1.23 1.08 1.815 2.805 1.305 3.495.99.105-.78.42-1.305.765-1.605-2.67-.3-5.46-1.335-5.46-5.925 0-1.305.465-2.385 1.23-3.225-.12-.3-.54-1.53.12-3.18 0 0 1.005-.315 3.3 1.23.96-.27 1.98-.405 3-.405s2.04.135 3 .405c2.295-1.56 3.3-1.23 3.3-1.23.66 1.65.24 2.88.12 3.18.765.84 1.23 1.905 1.23 3.225 0 4.605-2.805 5.625-5.475 5.925.435.375.81 1.095.81 2.22 0 1.605-.015 2.895-.015 3.3 0 .315.225.69.825.57A12.02 12.02 0 0024 12c0-6.63-5.37-12-12-12z" />
    </svg>
  );
}

export default function LandingPage() {
  return (
    <div className="flex min-h-screen flex-col bg-background">
      <header className="flex items-center justify-between border-b border-border px-4 py-3 md:px-8">
        <span className="text-xl font-bold tracking-tight md:text-2xl">
          <span className="relative">
            <span className="absolute inset-x-0 top-1/2 h-[0.08em] -translate-y-1/2 bg-current opacity-60" aria-hidden />
            0
          </span>
          Relay
        </span>
        <div className="flex items-center gap-3">
          <a
            href="https://github.com/kushal1o1/ZeroRelay"
            target="_blank"
            rel="noopener noreferrer"
            className="hidden items-center gap-1.5 text-sm text-muted-foreground transition-colors hover:text-foreground sm:inline-flex"
          >
            <GitHubIcon />
            Star on GitHub
          </a>
          <Link
            href="/chat"
            className="rounded-lg bg-signal px-4 py-2 text-sm font-medium text-background transition-colors hover:bg-signal/90"
          >
            Enter Chat
          </Link>
        </div>
      </header>

      <section className="flex flex-col items-center justify-center px-4 pb-12 pt-16 text-center md:pb-16 md:pt-24">
        <h1 className="text-5xl font-bold tracking-tight md:text-7xl">
          <span className="relative">
            <span className="absolute inset-x-0 top-1/2 h-[0.08em] -translate-y-1/2 bg-current opacity-60" aria-hidden />
            0
          </span>
          Relay
        </h1>
        <p className="mt-4 max-w-2xl text-lg text-muted-foreground md:text-xl">
          Share files, chat, and content directly between browsers.
          <br />
          Peer-to-peer. No servers. Just fast.
        </p>
        <div className="mt-8">
          <HeroVisual />
        </div>
        <div className="mt-8 flex items-center gap-4">
          <Link
            href="/chat"
            className="inline-flex items-center gap-2 rounded-xl bg-signal px-8 py-3 text-lg font-semibold text-background transition-colors hover:bg-signal/90"
          >
            Get Started →
          </Link>
          <a
            href="https://github.com/kushal1o1/ZeroRelay"
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-2 rounded-xl border border-border bg-card px-6 py-3 text-sm font-medium transition-colors hover:bg-muted sm:hidden"
          >
            <GitHubIcon />
            Star
          </a>
        </div>
      </section>

      <section className="border-t border-border px-4 py-12 md:py-20">
        <h2 className="text-center text-2xl font-semibold md:text-3xl">
          How It Works
        </h2>
        <div className="mx-auto mt-8 grid max-w-4xl gap-6 md:grid-cols-3">
          {[
            {
              step: "01",
              title: "Create a Room",
              desc: "Pick a name and optional password. Rooms are instant — no signup needed.",
            },
            {
              step: "02",
              title: "Share P2P",
              desc: "Send files, chat, code, or content. Everything goes directly to connected peers. No uploads.",
            },
            {
              step: "03",
              title: "Direct & Fast",
              desc: "Browser-to-browser via WebRTC. The relay only helps find peers — your data stays between you.",
            },
          ].map((item) => (
            <div
              key={item.step}
              className="rounded-xl border border-border bg-card p-6 text-center"
            >
              <span className="text-3xl font-bold text-signal">
                {item.step}
              </span>
              <h3 className="mt-3 text-lg font-semibold">{item.title}</h3>
              <p className="mt-2 text-sm text-muted-foreground">{item.desc}</p>
            </div>
          ))}
        </div>
      </section>

      <section className="border-t border-border px-4 py-12 md:py-20">
        <h2 className="text-center text-2xl font-semibold md:text-3xl">
          Features
        </h2>
        <div className="mx-auto mt-8 max-w-4xl">
          <Features />
        </div>
      </section>

      <section className="border-t border-border bg-muted/30 px-4 py-12 text-center md:py-20">
        <h2 className="text-2xl font-semibold md:text-3xl">Open Source</h2>
        <p className="mx-auto mt-3 max-w-md text-muted-foreground">
          0Relay is free and open source. View the code, contribute, or leave a
          star on GitHub.
        </p>
        <a
          href="https://github.com/kushal1o1/ZeroRelay"
          target="_blank"
          rel="noopener noreferrer"
          className="mt-6 inline-flex items-center gap-2 rounded-xl border border-border bg-card px-6 py-3 text-sm font-medium transition-colors hover:bg-muted"
        >
          <GitHubIcon />
          Star on GitHub
        </a>
      </section>

      <section className="border-t border-border px-4 py-16 text-center md:py-24">
        <h2 className="text-2xl font-semibold md:text-3xl">
          Ready to relay?
        </h2>
        <p className="mt-3 text-muted-foreground">
          No signup. No servers. Just pure peer-to-peer.
        </p>
        <Link
          href="/chat"
            className="mt-6 inline-flex items-center gap-2 rounded-xl bg-signal px-8 py-3 text-lg font-semibold text-background transition-colors hover:bg-signal/90"
        >
          Enter the Mesh →
        </Link>
      </section>

      <footer className="border-t border-border px-4 py-6 text-center text-sm text-muted-foreground">
        <a
          href="https://github.com/kushal1o1/ZeroRelay"
          target="_blank"
          rel="noopener noreferrer"
          className="hover:text-foreground"
        >
          GitHub
        </a>
        <span className="mx-3">·</span>
        Built with WebRTC · Cloudflare Durable Objects · Next.js · Tailwind CSS
      </footer>
    </div>
  );
}
