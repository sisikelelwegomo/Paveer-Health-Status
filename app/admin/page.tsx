"use client";

import Link from "next/link";
import { useState } from "react";

type Action = "simulate-down" | "simulate-recover" | "run-check" | "seed-examples";

export default function AdminPage() {
  const [busy, setBusy] = useState<Action | null>(null);
  const [result, setResult] = useState<string>("");

  async function run(action: Action) {
    setBusy(action);
    setResult("");

    try {
      if (action === "run-check") {
        const res = await fetch("/api/monitor", { method: "POST" });
        setResult(await res.text());
        return;
      }

      const res = await fetch("/api/admin", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action }),
      });

      setResult(await res.text());
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="relative min-h-screen bg-[#050608] text-zinc-100">
      <div className="pointer-events-none absolute inset-0 overflow-hidden">
        <div className="absolute -top-48 left-1/2 h-[520px] w-[920px] -translate-x-1/2 rounded-full bg-emerald-500/10 blur-3xl" />
        <div className="absolute -top-32 right-[-260px] h-[440px] w-[640px] rounded-full bg-sky-500/10 blur-3xl" />
      </div>

      <div className="relative mx-auto w-full max-w-3xl px-6 py-12">
        <header className="flex items-center justify-between">
          <div className="flex flex-col gap-1">
            <h1 className="text-2xl font-semibold tracking-tight">Admin</h1>
            <p className="text-sm text-zinc-400">Simulate events and trigger checks.</p>
          </div>
          <Link
            href="/"
            className="text-sm font-medium text-zinc-300 hover:text-zinc-100"
          >
            Back to status
          </Link>
        </header>

        <main className="mt-10 flex flex-col gap-6">
          <div className="rounded-3xl border border-white/10 bg-white/5 p-6 backdrop-blur">
            <h2 className="text-base font-semibold text-zinc-100">Actions</h2>
            <p className="mt-1 text-sm text-zinc-400">
              These actions update local state and trigger EmailJS notifications when configured.
            </p>

            <div className="mt-5 flex flex-wrap gap-3">
              <button
                type="button"
                onClick={() => run("run-check")}
                disabled={busy !== null}
                className="rounded-xl border border-white/10 bg-white/5 px-4 py-2 text-sm font-medium text-zinc-200 hover:bg-white/10 disabled:opacity-50"
              >
                {busy === "run-check" ? "Running…" : "Run check"}
              </button>
              <button
                type="button"
                onClick={() => run("seed-examples")}
                disabled={busy !== null}
                className="rounded-xl border border-white/10 bg-white/5 px-4 py-2 text-sm font-medium text-zinc-200 hover:bg-white/10 disabled:opacity-50"
              >
                {busy === "seed-examples" ? "Seeding…" : "Seed examples"}
              </button>
              <button
                type="button"
                onClick={() => run("simulate-down")}
                disabled={busy !== null}
                className="rounded-xl border border-white/10 bg-white/5 px-4 py-2 text-sm font-medium text-zinc-200 hover:bg-white/10 disabled:opacity-50"
              >
                {busy === "simulate-down" ? "Simulating…" : "Simulate DOWN"}
              </button>
              <button
                type="button"
                onClick={() => run("simulate-recover")}
                disabled={busy !== null}
                className="rounded-xl border border-white/10 bg-white/5 px-4 py-2 text-sm font-medium text-zinc-200 hover:bg-white/10 disabled:opacity-50"
              >
                {busy === "simulate-recover" ? "Simulating…" : "Simulate RECOVERED"}
              </button>
            </div>
          </div>

          <div className="rounded-3xl border border-white/10 bg-white/5 p-6 backdrop-blur">
            <h2 className="text-base font-semibold text-zinc-100">Result</h2>
            <pre className="mt-4 overflow-auto rounded-2xl bg-black/60 p-4 text-xs text-zinc-100">
              {result || "—"}
            </pre>
          </div>
        </main>
      </div>
    </div>
  );
}
