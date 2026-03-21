"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import SingleCharFloat from "../components/SingleCharFloat";

const GENRES = ["FPS", "MOBA", "RPG", "Battle Royale", "Sports", "Strategy", "Casual", "MMO"];
const RANKS = ["Unranked", "Bronze", "Silver", "Gold", "Platinum", "Diamond", "Master", "Grandmaster"];
const GENDERS = ["Male", "Female", "Non-binary", "Prefer not to say"];

interface FormData {
  age: string;
  gender: string;
  daily_hours: string;
  genre: string;
  competitive_rank: string;
  sleep_hours: string;
  exercise_days: string;
  social_score: string;
  spending_monthly: string;
  multiplayer_ratio: string;
  streaming: string;
  toxic_exposure: string;
}

const defaultForm: FormData = {
  age: "", gender: "", daily_hours: "", genre: "",
  competitive_rank: "", sleep_hours: "", exercise_days: "",
  social_score: "", spending_monthly: "", multiplayer_ratio: "",
  streaming: "", toxic_exposure: "",
};

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
      // {children}
    </p>
  );
}

export default function AssessPage() {
  const router = useRouter();
  const [form, setForm] = useState<FormData>(defaultForm);
  const [loading, setLoading] = useState(false);
  const [progress, setProgress] = useState(0);

  const filled = Object.values(form).filter(Boolean).length;
  const total = Object.keys(form).length;
  const completionPct = Math.round((filled / total) * 100);

  function set(key: keyof FormData, value: string) {
    setForm((prev) => ({ ...prev, [key]: value }));
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    for (let i = 0; i <= 100; i += 10) {
      await new Promise((r) => setTimeout(r, 120));
      setProgress(i);
    }
    localStorage.setItem("dq_form", JSON.stringify(form));
    router.push("/results");
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
            Complete all fields to initiate analysis
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

        <form onSubmit={handleSubmit} className="space-y-12">

          {/* Demographics */}
          <div>
            <SectionHeader>DEMOGRAPHICS</SectionHeader>
            <div className="grid grid-cols-2 gap-6">
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
            </div>
          </div>

          {/* Gaming Profile */}
          <div>
            <SectionHeader>GAMING PROFILE</SectionHeader>
            <div className="space-y-6">
              <div className="grid grid-cols-2 gap-6">
                <div>
                  <Label>DAILY HOURS</Label>
                  <input type="number" min="0" max="24" step="0.5" className="input-pixel" placeholder="e.g. 4.5"
                    value={form.daily_hours} onChange={(e) => set("daily_hours", e.target.value)} required />
                </div>
                <div>
                  <Label>FAVOURITE GENRE</Label>
                  <select className="input-pixel" value={form.genre} onChange={(e) => set("genre", e.target.value)} required>
                    <option value="">Select...</option>
                    {GENRES.map((g) => <option key={g} value={g}>{g}</option>)}
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-6">
                <div>
                  <Label>COMPETITIVE RANK</Label>
                  <select className="input-pixel" value={form.competitive_rank} onChange={(e) => set("competitive_rank", e.target.value)} required>
                    <option value="">Select...</option>
                    {RANKS.map((r) => <option key={r} value={r}>{r}</option>)}
                  </select>
                </div>
                <div>
                  <Label>MONTHLY SPENDING ($)</Label>
                  <input type="number" min="0" className="input-pixel" placeholder="e.g. 30"
                    value={form.spending_monthly} onChange={(e) => set("spending_monthly", e.target.value)} required />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-6">
                <div>
                  <Label>MULTIPLAYER RATIO (0-1)</Label>
                  <input type="number" min="0" max="1" step="0.1" className="input-pixel" placeholder="e.g. 0.7"
                    value={form.multiplayer_ratio} onChange={(e) => set("multiplayer_ratio", e.target.value)} required />
                </div>
                <div>
                  <Label>DO YOU STREAM?</Label>
                  <select className="input-pixel" value={form.streaming} onChange={(e) => set("streaming", e.target.value)} required>
                    <option value="">Select...</option>
                    <option value="yes">Yes</option>
                    <option value="no">No</option>
                  </select>
                </div>
              </div>

              <div>
                <Label>TOXIC EXPOSURE (0 = none / 10 = constant)</Label>
                <input type="range" min="0" max="10" className="w-full accent-white cursor-pointer mt-1"
                  value={form.toxic_exposure || "5"} onChange={(e) => set("toxic_exposure", e.target.value)} />
                <div className="flex justify-between font-pixel text-gray-600 mt-2" style={{ fontSize: "0.6rem" }}>
                  <span>NONE</span>
                  <span className="text-white">{form.toxic_exposure || "5"}</span>
                  <span>CONSTANT</span>
                </div>
              </div>
            </div>
          </div>

          {/* Lifestyle */}
          <div>
            <SectionHeader>LIFESTYLE</SectionHeader>
            <div className="space-y-6">
              <div className="grid grid-cols-2 gap-6">
                <div>
                  <Label>SLEEP HOURS / NIGHT</Label>
                  <input type="number" min="2" max="14" step="0.5" className="input-pixel" placeholder="e.g. 7"
                    value={form.sleep_hours} onChange={(e) => set("sleep_hours", e.target.value)} required />
                </div>
                <div>
                  <Label>EXERCISE DAYS / WEEK</Label>
                  <input type="number" min="0" max="7" className="input-pixel" placeholder="e.g. 3"
                    value={form.exercise_days} onChange={(e) => set("exercise_days", e.target.value)} required />
                </div>
              </div>

              <div>
                <Label>SOCIAL INTERACTION (0 = isolated / 10 = very social)</Label>
                <input type="range" min="0" max="10" className="w-full accent-white cursor-pointer mt-1"
                  value={form.social_score || "5"} onChange={(e) => set("social_score", e.target.value)} />
                <div className="flex justify-between font-pixel text-gray-600 mt-2" style={{ fontSize: "0.6rem" }}>
                  <span>ISOLATED</span>
                  <span className="text-white">{form.social_score || "5"}</span>
                  <span>SOCIAL</span>
                </div>
              </div>
            </div>
          </div>

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
                      {/* Nose */}
                      <polygon points="10,0 6,10 14,10" fill="white"/>
                      {/* Body */}
                      <rect x="6" y="10" width="8" height="12" fill="white"/>
                      {/* Window */}
                      <rect x="8" y="13" width="4" height="4" fill="black"/>
                      {/* Wings */}
                      <polygon points="6,17 1,26 6,23" fill="white"/>
                      <polygon points="14,17 19,26 14,23" fill="white"/>
                      {/* Exhaust */}
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
            <button type="submit" className="btn-pixel w-full mt-4" style={{ fontSize: "1.1rem", padding: "1.5rem 2rem", whiteSpace: "nowrap" }}>
              LAUNCH ANALYSIS &rsaquo;
            </button>
          )}
        </form>
      </div>
    </div>
  );
}
