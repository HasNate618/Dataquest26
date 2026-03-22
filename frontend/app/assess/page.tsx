"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import SingleCharFloat from "../components/SingleCharFloat";

const GENDERS = ["Male", "Female", "Other"];
const GENRES = ["FPS", "MOBA", "RPG", "Strategy", "Battle Royale", "MMO", "Mobile Games"];
const PLATFORMS = ["PC", "Console", "Mobile", "Multi-platform"];
const PRIMARY_GAMES = [
  "Dota 2",
  "Elden Ring",
  "StarCraft II",
  "World of Warcraft",
  "Civilization VI",
  "Mobile Legends",
  "League of Legends",
  "Final Fantasy XIV",
  "Cyberpunk 2077",
  "Elder Scrolls Online",
  "Skyrim",
  "Fortnite",
  "Clash of Clans",
  "Warzone",
  "CS:GO",
  "Genshin Impact",
  "PUBG Mobile",
  "Call of Duty",
  "PUBG",
  "Age of Empires",
  "Valorant",
  "Overwatch",
  "Candy Crush",
  "Apex Legends",
];

interface FormData {
  age: string;
  gender: string;
  years_gaming: string;
  daily_gaming_hours: string;
  monthly_game_spending_usd: string;
  exercise_hours_weekly: string;
  sleep_hours: string;
  game_genre: string;
  primary_game: string;
  gaming_platform: string;
}

const defaultForm: FormData = {
  age: "",
  gender: "",
  years_gaming: "",
  daily_gaming_hours: "",
  monthly_game_spending_usd: "",
  exercise_hours_weekly: "",
  sleep_hours: "",
  game_genre: "",
  primary_game: "",
  gaming_platform: "",
};

interface AnalysisRequestPayload {
  age: number;
  gender: string;
  years_gaming: number;
  daily_gaming_hours: number;
  monthly_game_spending_usd: number;
  exercise_hours_weekly: number;
  sleep_hours: number;
  game_genre: string;
  primary_game: string;
  gaming_platform: string;
}

interface AnalysisResult {
  model: string;
  feature_order: string[];
  overall: {
    probability: number;
    percent: number;
    label: string;
  };
  issues: Array<{
    issue: string;
    probability: number;
    percent: number;
    label: string;
  }>;
  top_issue: {
    issue: string;
    probability: number;
    percent: number;
    label: string;
  } | null;
  input_profile: Record<string, string | number>;
  issue_contributor_groups?: Record<string, Array<{ group: string; share_pct: number }>>;
  issue_top_contributors?: Record<
    string,
    Array<{ feature: string; group: string; share_pct: number; delta: number }>
  >;
  overall_scenarios?: Array<{
    scenario: string;
    probability: number;
    percent: number;
    label: string;
    delta_vs_baseline: number;
  }>;
}

interface StoredAnalysis {
  generatedAt: string;
  result: AnalysisResult;
}

const NUMERIC_BOUNDS = {
  age: [10, 80],
  years_gaming: [0, 70],
  daily_gaming_hours: [0, 24],
  monthly_game_spending_usd: [0, 2000],
  exercise_hours_weekly: [0, 40],
  sleep_hours: [0, 24],
} as const;

function Label({ children }: { children: React.ReactNode }) {
  return (
    <label className="font-pixel block mb-3 text-gray-400" style={{ fontSize: "0.7rem", letterSpacing: "0.08em" }}>
      {children}
    </label>
  );
}

function SectionHeader({ children }: { children: React.ReactNode }) {
  return (
    <p className="font-pixel text-gray-500 mb-6" style={{ fontSize: "0.75rem", letterSpacing: "0.1em" }}>
      SECTION: {children}
    </p>
  );
}

function readApiErrorMessage(payload: unknown): string | null {
  if (
    payload &&
    typeof payload === "object" &&
    "error" in payload &&
    typeof (payload as { error: unknown }).error === "string"
  ) {
    return (payload as { error: string }).error;
  }
  return null;
}

function toPayload(form: FormData): AnalysisRequestPayload {
  return {
    age: Number(form.age),
    gender: form.gender.trim(),
    years_gaming: Number(form.years_gaming),
    daily_gaming_hours: Number(form.daily_gaming_hours),
    monthly_game_spending_usd: Number(form.monthly_game_spending_usd),
    exercise_hours_weekly: Number(form.exercise_hours_weekly),
    sleep_hours: Number(form.sleep_hours),
    game_genre: form.game_genre.trim(),
    primary_game: form.primary_game.trim(),
    gaming_platform: form.gaming_platform.trim(),
  };
}

function validateForm(form: FormData): string | null {
  const missingField = (Object.entries(form) as Array<[keyof FormData, string]>).find(
    ([, value]) => value.trim() === ""
  )?.[0];
  if (missingField) {
    return `Please complete "${missingField.replace(/_/g, " ")}".`;
  }

  for (const [fieldName, [minValue, maxValue]] of Object.entries(NUMERIC_BOUNDS)) {
    const rawValue = form[fieldName as keyof FormData];
    const numericValue = Number(rawValue);
    if (!Number.isFinite(numericValue)) {
      return `Field "${fieldName}" must be a valid number.`;
    }
    if (numericValue < minValue || numericValue > maxValue) {
      return `Field "${fieldName}" must be between ${minValue} and ${maxValue}.`;
    }
  }

  return null;
}

export default function AssessPage() {
  const router = useRouter();
  const [form, setForm] = useState<FormData>(defaultForm);
  const [loading, setLoading] = useState(false);
  const [progress, setProgress] = useState(0);
  const [error, setError] = useState<string | null>(null);

  const filled = Object.values(form).filter((value) => value.trim() !== "").length;
  const total = Object.keys(form).length;
  const completionPct = Math.round((filled / total) * 100);

  function set(key: keyof FormData, value: string) {
    setForm((prev) => ({ ...prev, [key]: value }));
  }

  async function handleLaunchAnalysis() {
    setError(null);
    setProgress(0);

    const validationError = validateForm(form);
    if (validationError) {
      setError(validationError);
      return;
    }

    setLoading(true);

    const payload = toPayload(form);
    const progressTimer = window.setInterval(() => {
      setProgress((current) => (current >= 90 ? current : current + 5));
    }, 120);

    try {
      const response = await fetch("/api/analyze", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      const body: unknown = await response.json();
      if (!response.ok) {
        const apiError = readApiErrorMessage(body);
        throw new Error(apiError ?? "Analysis failed. Please verify your inputs and retry.");
      }

      const result = body as AnalysisResult;
      const storedAnalysis: StoredAnalysis = {
        generatedAt: new Date().toISOString(),
        result,
      };

      try {
        window.localStorage.setItem("dq_analysis", JSON.stringify(storedAnalysis));
      } catch {
        throw new Error("Unable to persist analysis result locally.");
      }

      setProgress(100);
      setLoading(false);
      router.push("/results");
    } catch (submissionError) {
      const message = submissionError instanceof Error ? submissionError.message : "Unable to run analysis.";
      setError(message);
      setLoading(false);
      setProgress(0);
    } finally {
      window.clearInterval(progressTimer);
    }
  }

  return (
    <div className="relative min-h-screen flex flex-col items-center justify-center">
      <div className="stars-layer stars-small" />
      <div className="stars-layer stars-medium" />
      <div className="scanlines" />
      <SingleCharFloat />

      <div className="relative z-10 w-full max-w-3xl mx-auto px-8 py-16">

        {/* Header */}
        <div className="mb-14 text-center">
          <Link href="/" className="font-pixel text-gray-500 hover:text-white transition-colors fixed top-6 left-6 z-50" style={{ fontSize: "0.85rem" }}>
            ← BACK TO BASE
          </Link>

          <h1 className="font-pixel text-white mt-10 mb-4" style={{ fontSize: "clamp(1.4rem, 4vw, 2.8rem)", lineHeight: "1.5" }}>
            CHARACTER PROFILE
          </h1>

          <p className="font-pixel text-gray-500 mb-8" style={{ fontSize: "0.7rem" }}>
            Complete the required model inputs to launch analysis
          </p>

          {/* Progress bar */}
          <div>
            <div className="flex justify-between font-pixel text-gray-600 mb-2" style={{ fontSize: "0.6rem" }}>
              <span>FORM COMPLETION</span>
              <span>{completionPct}%</span>
            </div>
            <div className="progress-bar">
              <div className="progress-bar-fill" style={{ width: `${completionPct}%` }} />
            </div>
          </div>
        </div>

        <div className="space-y-12">

          {/* Demographics */}
          <div>
            <SectionHeader>DEMOGRAPHICS</SectionHeader>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
              <div>
                <Label>AGE</Label>
                <input type="number" min="10" max="80" className="input-pixel" placeholder="e.g. 22"
                  value={form.age} onChange={(e) => set("age", e.target.value)} required />
              </div>
              <div>
                <Label>GENDER</Label>
                <select className="input-pixel" value={form.gender} onChange={(e) => set("gender", e.target.value)} required>
                  <option value="">Select...</option>
                  {GENDERS.map((g) => <option key={g} value={g}>{g}</option>)}
                </select>
              </div>
              <div>
                <Label>YEARS GAMING</Label>
                <input type="number" min="0" max="70" step="1" className="input-pixel" placeholder="e.g. 8"
                  value={form.years_gaming} onChange={(e) => set("years_gaming", e.target.value)} required />
              </div>
            </div>
          </div>

          {/* Core behavior features */}
          <div>
            <SectionHeader>CAUSE-CORE FEATURES</SectionHeader>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div>
                <Label>DAILY GAMING HOURS</Label>
                <input type="number" min="0" max="24" step="0.5" className="input-pixel" placeholder="e.g. 4.5"
                  value={form.daily_gaming_hours} onChange={(e) => set("daily_gaming_hours", e.target.value)} required />
              </div>
              <div>
                <Label>MONTHLY GAME SPENDING (USD)</Label>
                <input type="number" min="0" max="2000" step="1" className="input-pixel" placeholder="e.g. 35"
                  value={form.monthly_game_spending_usd} onChange={(e) => set("monthly_game_spending_usd", e.target.value)} required />
              </div>
              <div>
                <Label>EXERCISE HOURS / WEEK</Label>
                <input type="number" min="0" max="40" step="0.5" className="input-pixel" placeholder="e.g. 3.5"
                  value={form.exercise_hours_weekly} onChange={(e) => set("exercise_hours_weekly", e.target.value)} required />
              </div>
              <div>
                <Label>HOURS OF SLEEP</Label>
                <input type="number" min="0" max="24" step="0.5" className="input-pixel" placeholder="e.g. 7.5"
                  value={form.sleep_hours} onChange={(e) => set("sleep_hours", e.target.value)} required />
              </div>
              <div>
                <Label>GAME GENRE</Label>
                <select className="input-pixel" value={form.game_genre} onChange={(e) => set("game_genre", e.target.value)} required>
                  <option value="">Select...</option>
                  {GENRES.map((genre) => <option key={genre} value={genre}>{genre}</option>)}
                </select>
              </div>
              <div>
                <Label>PRIMARY GAME</Label>
                <input
                  list="primary-game-options"
                  className="input-pixel"
                  placeholder="Type or select a game"
                  value={form.primary_game}
                  onChange={(e) => set("primary_game", e.target.value)}
                  required
                />
                <datalist id="primary-game-options">
                  {PRIMARY_GAMES.map((game) => (
                    <option key={game} value={game} />
                  ))}
                </datalist>
              </div>
              <div>
                <Label>GAMING PLATFORM</Label>
                <select className="input-pixel" value={form.gaming_platform} onChange={(e) => set("gaming_platform", e.target.value)} required>
                  <option value="">Select...</option>
                  {PLATFORMS.map((platform) => <option key={platform} value={platform}>{platform}</option>)}
                </select>
              </div>
            </div>
          </div>

          {error ? (
            <div className="border border-red-700 bg-red-950/20 px-4 py-3">
              <p className="font-mono text-red-300 text-xs tracking-wide">{error}</p>
            </div>
          ) : null}

          {/* Submit */}
          {loading ? (
            <div className="pt-4 text-center">
              <p className="font-pixel text-gray-400 mb-6" style={{ fontSize: "0.75rem" }}>
                INITIATING ANALYSIS...
              </p>
              <div className="relative">
                <div style={{ position: "relative", height: "40px", marginBottom: "4px" }}>
                  <div style={{
                    position: "absolute",
                    left: `${progress}%`,
                    bottom: 0,
                    transform: "translateX(-50%)",
                    transition: "left 0.15s linear",
                    lineHeight: 1,
                  }}>
                    <svg width="20" height="32" viewBox="0 0 20 32" fill="none" xmlns="http://www.w3.org/2000/svg">
                      <polygon points="10,0 6,10 14,10" fill="white"/>
                      <rect x="6" y="10" width="8" height="12" fill="white"/>
                      <rect x="8" y="13" width="4" height="4" fill="black"/>
                      <polygon points="6,17 1,26 6,23" fill="white"/>
                      <polygon points="14,17 19,26 14,23" fill="white"/>
                      <rect x="8" y="22" width="4" height="3" fill="white"/>
                      <rect x="9" y="25" width="2" height="4" fill="#aaa"/>
                      <rect x="8" y="27" width="4" height="2" fill="#666"/>
                    </svg>
                  </div>
                </div>
                <div className="progress-bar">
                  <div className="progress-bar-fill" style={{ width: `${progress}%` }} />
                </div>
              </div>
              <p className="font-pixel text-gray-600 mt-3" style={{ fontSize: "0.6rem" }}>{progress}% COMPLETE</p>
            </div>
          ) : (
            <button
              type="button"
              onClick={handleLaunchAnalysis}
              className="btn-pixel w-full mt-4"
              style={{ fontSize: "1.1rem", padding: "1.5rem 2rem", whiteSpace: "nowrap" }}
            >
              LAUNCH ANALYSIS &rsaquo;
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
