"use client";

import { useEffect, useState } from "react";

type PerfMode = "balanced" | "full";

const STORAGE_KEY = "dq_perf_mode";
const PERF_MODE_EVENT = "dq-perf-mode-change";

function normalizeMode(value: string | null): PerfMode {
  return value === "full" ? "full" : "balanced";
}

function applyMode(nextMode: PerfMode) {
  document.documentElement.setAttribute("data-perf-mode", nextMode);
  window.localStorage.setItem(STORAGE_KEY, nextMode);
  window.dispatchEvent(new Event(PERF_MODE_EVENT));
}

export default function PerformanceModeToggle() {
  const [mode, setMode] = useState<PerfMode>(() => {
    if (typeof window === "undefined") {
      return "balanced";
    }
    return normalizeMode(window.localStorage.getItem(STORAGE_KEY));
  });

  useEffect(() => {
    applyMode(mode);
  }, [mode]);

  function handleToggle() {
    const nextMode: PerfMode = mode === "full" ? "balanced" : "full";
    setMode(nextMode);
    applyMode(nextMode);
  }

  return (
    <button
      type="button"
      onClick={handleToggle}
      className="fixed bottom-4 right-4 z-[60] border border-gray-700 bg-black/85 px-3 py-2 font-mono text-[11px] tracking-wider text-gray-300 hover:border-white hover:text-white transition-colors"
      title={mode === "full" ? "Switch to reduced GPU mode" : "Switch to full visual effects"}
    >
      {mode === "full" ? "PERF: FULL FX" : "PERF: BALANCED"}
    </button>
  );
}
