"use client";

import { useEffect, useState } from "react";
import Link from "next/link";

// Placeholder archetypes — swap with real clustering output
const ARCHETYPES: Record<string, { title: string; description: string }> = {
  "0": {
    title: "THE COMPETITIVE WARRIOR",
    description: "High-intensity, rank-driven player. You live for the grind, thrive under pressure, and measure success in LP and MMR. Social but combative.",
  },
  "1": {
    title: "THE CASUAL EXPLORER",
    description: "Gaming is your escape, not your obsession. You prefer rich worlds and good stories over leaderboards. Balanced lifestyle, moderate hours.",
  },
  "2": {
    title: "THE SOCIAL CONNECTOR",
    description: "Multiplayer is your element. You game to bond, not to win. High social score, low toxicity. Gaming is just the backdrop.",
  },
  "3": {
    title: "THE LONE WANDERER",
    description: "Solo player, deep focus. Long sessions, single-player worlds. Introverted gamer archetype — intense but self-contained.",
  },
  "4": {
    title: "THE CONTENT CREATOR",
    description: "You stream, clip, and share. Gaming is both hobby and platform. High engagement, high spend, high visibility.",
  },
};

interface MentalHealthScores {
  anxiety: number;
  depression: number;
  addiction: number;
  happiness: number;
}

// Mock scoring based on form data — replace with real API response
function mockPredict(form: Record<string, string>): { cluster: string; scores: MentalHealthScores } {
  const hours = parseFloat(form.daily_hours || "3");
  const sleep = parseFloat(form.sleep_hours || "7");
  const exercise = parseFloat(form.exercise_days || "3");
  const social = parseFloat(form.social_score || "5");
  const toxic = parseFloat(form.toxic_exposure || "5");
  const multiplayer = parseFloat(form.multiplayer_ratio || "0.5");
  const streaming = form.streaming === "yes";

  // Very rough heuristics for demo
  const anxiety = Math.min(100, Math.round((hours * 6) + (toxic * 4) + Math.max(0, (8 - sleep) * 5)));
  const depression = Math.min(100, Math.round(Math.max(0, (6 - sleep) * 8) + Math.max(0, (5 - social) * 5) + hours * 3));
  const addiction = Math.min(100, Math.round(hours * 9 + parseFloat(form.spending_monthly || "0") * 0.2));
  const happiness = Math.min(100, Math.max(0, Math.round(social * 7 + exercise * 5 + sleep * 4 - hours * 2)));

  // Cluster heuristic
  let cluster = "1";
  if (hours > 6 && form.competitive_rank && !["Unranked", "Bronze"].includes(form.competitive_rank)) cluster = "0";
  else if (multiplayer > 0.7 && social > 6) cluster = "2";
  else if (multiplayer < 0.3 && social < 4) cluster = "3";
  else if (streaming) cluster = "4";

  return { cluster, scores: { anxiety, depression, addiction, happiness } };
}

interface MeterProps {
  label: string;
  value: number;
  color?: string;
}

function Meter({ label, value, color = "#fff" }: MeterProps) {
  const [width, setWidth] = useState(0);

  useEffect(() => {
    const t = setTimeout(() => setWidth(value), 100);
    return () => clearTimeout(t);
  }, [value]);

  const level = value < 30 ? "LOW" : value < 60 ? "MODERATE" : value < 80 ? "HIGH" : "CRITICAL";

  return (
    <div className="mb-5">
      <div className="flex justify-between font-mono text-xs text-gray-400 mb-2">
        <span className="tracking-widest">{label}</span>
        <span style={{ color, fontSize: "0.6rem" }} className="font-pixel">
          {level} ({value})
        </span>
      </div>
      <div className="meter-track">
        <div
          className="meter-fill"
          style={{ width: `${width}%`, background: color, transition: "width 0.9s ease" }}
        />
      </div>
    </div>
  );
}

export default function ResultsPage() {
  const [result, setResult] = useState<{ cluster: string; scores: MentalHealthScores } | null>(null);

  useEffect(() => {
    const raw = localStorage.getItem("dq_form");
    if (raw) {
      const form = JSON.parse(raw);
      setResult(mockPredict(form));
    } else {
      // Demo fallback
      setResult({
        cluster: "0",
        scores: { anxiety: 72, depression: 45, addiction: 68, happiness: 55 },
      });
    }
  }, []);

  if (!result) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <p className="font-mono text-gray-400 text-sm">LOADING RESULTS...</p>
      </div>
    );
  }

  const archetype = ARCHETYPES[result.cluster] ?? ARCHETYPES["1"];

  return (
    <div className="relative min-h-screen">
      <div className="stars-layer stars-small" style={{ opacity: 0.3 }} />
      <div className="stars-layer stars-medium" style={{ opacity: 0.3 }} />
      <div className="scanlines" />

      <div className="relative z-10 max-w-2xl mx-auto px-6 py-16">
        {/* Header */}
        <div className="mb-12">
          <p className="font-mono text-gray-600 text-xs tracking-widest mb-8">MISSION COMPLETE — ANALYSIS REPORT</p>
          <h1 className="font-pixel text-white" style={{ fontSize: "0.85rem", lineHeight: "2.2" }}>
            YOUR RESULTS
          </h1>
        </div>

        {/* Cluster Card */}
        <div className="card-pixel mb-8">
          <p className="font-mono text-xs text-gray-500 tracking-widest mb-4">// MODEL 1: CLUSTER ANALYSIS</p>
          <p className="font-mono text-xs text-gray-500 tracking-widest mb-3">YOU ARE —</p>
          <h2 className="font-pixel text-white mb-6" style={{ fontSize: "0.75rem", lineHeight: "2" }}>
            {archetype.title}
          </h2>
          <p className="font-mono text-gray-300 text-sm leading-7">
            {archetype.description}
          </p>
          <p className="font-mono text-xs text-gray-600 mt-4 tracking-widest">
            CLUSTER ID: {result.cluster}
          </p>
        </div>

        {/* Mental Health Card */}
        <div className="card-pixel mb-10">
          <p className="font-mono text-xs text-gray-500 tracking-widest mb-6">// MODEL 2: MENTAL HEALTH PREDICTION</p>

          <Meter label="ANXIETY SCORE" value={result.scores.anxiety} />
          <Meter label="DEPRESSION RISK" value={result.scores.depression} />
          <Meter label="ADDICTION RISK" value={result.scores.addiction} />
          <Meter label="HAPPINESS INDEX" value={result.scores.happiness} color="#aaa" />

          <div className="border-t border-gray-800 mt-6 pt-6">
            <p className="font-mono text-xs text-gray-600 leading-6">
              * Results are generated by machine learning models trained on gaming and lifestyle data.
              This is not a clinical diagnosis.
            </p>
          </div>
        </div>

        {/* Actions */}
        <div className="flex gap-4 flex-wrap">
          <Link href="/assess">
            <button className="btn-pixel px-8 py-4">
              ← REPLAY MISSION
            </button>
          </Link>
          <Link href="/">
            <button
              className="font-mono text-xs border border-gray-700 text-gray-400 px-8 py-4 hover:border-white hover:text-white transition-colors"
            >
              RETURN TO BASE
            </button>
          </Link>
        </div>
      </div>
    </div>
  );
}
