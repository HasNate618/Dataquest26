"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { Cell, Pie, PieChart, ResponsiveContainer, Tooltip, BarChart, Bar, XAxis, YAxis } from "recharts";

interface AnalysisIssue {
  issue: string;
  probability: number;
  percent: number;
  label: string;
}

interface ContributorGroup {
  group: string;
  share_pct: number;
}

interface TopContributor {
  feature: string;
  group: string;
  share_pct: number;
  delta: number;
}

interface ScenarioResult {
  scenario: string;
  probability: number;
  percent: number;
  label: string;
  delta_vs_baseline: number;
}

interface Recommendation {
  rank: number;
  title: string;
  detail: string;
  impact_pct: number;
  new_risk_pct: number;
  type?: string;
}

interface AnalysisResult {
  model: string;
  feature_order: string[];
  overall: {
    probability: number;
    percent: number;
    label: string;
  };
  issues: AnalysisIssue[];
  top_issue: AnalysisIssue | null;
  input_profile: Record<string, string | number>;
  issue_contributor_groups?: Record<string, ContributorGroup[]>;
  issue_top_contributors?: Record<string, TopContributor[]>;
  overall_scenarios?: ScenarioResult[];
  recommendations?: Recommendation[];
}

interface StoredAnalysis {
  generatedAt: string;
  result: AnalysisResult;
}

function toTitle(value: string): string {
  return value
    .replace(/_/g, " ")
    .replace(/\b\w/g, (char) => char.toUpperCase());
}

function levelColor(label: string): string {
  if (label === "High") return "#ff6464";
  if (label === "Moderate") return "#ffd166";
  if (label === "Mild") return "#8ecae6";
  return "#9be564";
}

function formatTooltipValue(value: unknown): string {
  if (typeof value === "number" && Number.isFinite(value)) {
    return `${value.toFixed(1)}%`;
  }
  if (typeof value === "string" && value.length > 0) {
    const parsed = Number(value);
    if (Number.isFinite(parsed)) {
      return `${parsed.toFixed(1)}%`;
    }
  }
  return "0.0%";
}

function groupColor(group: string): string {
  const palette: Record<string, string> = {
    gaming_load: "#ff6464",
    gaming_spend: "#ffd166",
    health_habits: "#9be564",
    game_context: "#8ecae6",
    context: "#bdb2ff",
    other: "#94a3b8",
  };
  return palette[group] ?? "#a8dadc";
}

function scenarioLabel(value: string): string {
  return value.replace(/_/g, " ").replace(/\b\w/g, (char) => char.toUpperCase());
}

function Meter({ issue }: { issue: AnalysisIssue }) {
  const barColor = levelColor(issue.label);

  return (
    <div className="mb-5 md:mb-6">
      <div className="flex justify-between font-mono text-xs text-gray-400 mb-3">
        <span className="tracking-widest">{toTitle(issue.issue)}</span>
        <span style={{ color: barColor, fontSize: "0.65rem" }} className="font-pixel">
          {issue.label.toUpperCase()} ({issue.percent.toFixed(1)}%)
        </span>
      </div>
      <div className="meter-track">
        <div
          className="meter-fill"
          style={{
            width: `${issue.percent}%`,
            background: barColor,
            transition: "width 0.9s ease",
          }}
        />
      </div>
    </div>
  );
}

function readStoredAnalysis(): StoredAnalysis | null {
  if (
    typeof window === "undefined" ||
    typeof window.localStorage === "undefined" ||
    typeof window.localStorage.getItem !== "function"
  ) {
    return null;
  }

  const raw = window.localStorage.getItem("dq_analysis");
  if (!raw) {
    return null;
  }

  try {
    const parsed: unknown = JSON.parse(raw);
    if (
      parsed &&
      typeof parsed === "object" &&
      "generatedAt" in parsed &&
      "result" in parsed &&
      typeof (parsed as { generatedAt: unknown }).generatedAt === "string"
    ) {
      return parsed as StoredAnalysis;
    }
  } catch {
    return null;
  }

  return null;
}

function IssueContributorPie({
  issueName,
  data,
}: {
  issueName: string;
  data: ContributorGroup[];
}) {
  const chartData = data.map((item) => ({
    name: toTitle(item.group),
    value: Number(item.share_pct.toFixed(2)),
    fill: groupColor(item.group),
  }));

  return (
    <div className="border border-gray-700 p-4 md:p-5 bg-black/40">
      <p className="font-mono text-[11px] text-gray-500 tracking-widest mb-5">{toTitle(issueName)}</p>
      <div style={{ width: "100%", height: 220 }} className="md:h-[240px]">
        <ResponsiveContainer>
          <PieChart>
            <Pie data={chartData} dataKey="value" nameKey="name" innerRadius={45} outerRadius={85} label>
              {chartData.map((entry) => (
                <Cell key={`${issueName}-${entry.name}`} fill={entry.fill} />
              ))}
            </Pie>
            <Tooltip
              formatter={(value, name) => [formatTooltipValue(value), String(name)]}
              contentStyle={{
                background: "#050505",
                border: "1px solid #444",
                color: "#f1f5f9",
                fontSize: "11px",
              }}
            />
          </PieChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}

export default function ResultsPage() {
  const stored = useMemo(() => readStoredAnalysis(), []);
  const [selectedScenario, setSelectedScenario] = useState<string | null>(null);

  if (!stored) {
    return (
      <div className="relative min-h-screen flex items-center justify-center">
        <div className="stars-layer stars-small" />
        <div className="stars-layer stars-medium" />
        <div className="scanlines" />
        <div className="relative z-10 max-w-xl mx-auto px-6 text-center">
          <p className="font-mono text-gray-400 text-sm mb-6">
            NO ANALYSIS DATA FOUND. COMPLETE THE PROFILE TO GENERATE RESULTS.
          </p>
          <Link href="/assess">
            <button className="btn-pixel px-8 py-4">GO TO CHARACTER PROFILE</button>
          </Link>
        </div>
      </div>
    );
  }

  const { result } = stored;
  const topIssueLabel = result.top_issue ? toTitle(result.top_issue.issue) : "None";
  const generatedAt = new Date(stored.generatedAt).toLocaleString();
  const issueContributorEntries = Object.entries(result.issue_contributor_groups ?? {});
  const scenarioData = result.overall_scenarios ?? [];
  const recommendations = result.recommendations ?? [];
  const baselineScenario = scenarioData.find((s) => s.scenario === "baseline");
  const baselineRisk = baselineScenario?.percent ?? 0;

  const scenarioDataForChart = scenarioData
    .filter((row) => row.scenario !== "baseline")
    .map((row) => ({
      scenario: scenarioLabel(row.scenario),
      delta: Number((row.delta_vs_baseline * 100).toFixed(2)),
      fullScenario: row,
    }));

  const bestScenario = scenarioData.reduce((best, curr) =>
    curr.probability < best.probability ? curr : best
  );
  const bestImprovement = ((bestScenario.probability - baselineScenario!.probability) * 100).toFixed(1);

  return (
    <div className="relative min-h-screen flex flex-col items-center">
      {/* Background layers */}
      <div className="stars-layer stars-small" />
      <div className="stars-layer stars-medium" />
      <div className="scanlines" />

      <div className="relative z-10 w-full max-w-4xl px-4 md:px-6 py-12 md:py-20 flex flex-col items-center">
        {/* Back link */}
        <Link href="/" className="font-pixel text-gray-500 hover:text-white transition-colors fixed top-6 left-6 z-50" style={{ fontSize: "0.85rem" }}>
          ← BACK TO BASE
        </Link>

        {/* Header */}
        <div className="mb-12 md:mb-16 text-center pt-8 w-full">
          <p className="font-mono text-gray-600 text-xs tracking-widest mb-4 md:mb-6">MISSION COMPLETE — MODEL INFERENCE REPORT</p>
          <h1 className="font-pixel text-white mb-4 md:mb-6" style={{ fontSize: "clamp(1.5rem, 4vw, 2.5rem)", lineHeight: "1.4" }}>
            YOUR RESULTS
          </h1>
          <p className="font-mono text-xs text-gray-500">Generated at {generatedAt}</p>
        </div>

        {/* Summary Card */}
        <div className="card-pixel mb-10 md:mb-14 w-full">
          <p className="font-mono text-xs text-gray-500 tracking-widest mb-6">MODEL SUMMARY</p>
          <div className="space-y-4 md:space-y-5">
            <p className="font-mono text-sm text-gray-300">Primary model: <span className="text-white">{result.model}</span></p>
            <p className="font-mono text-sm text-gray-300">
              Overall wellbeing risk:{" "}
              <span style={{ color: levelColor(result.overall.label) }} className="font-semibold">
                {result.overall.label.toUpperCase()} ({result.overall.percent.toFixed(1)}%)
              </span>
            </p>
            <p className="font-mono text-sm text-gray-300">
              Highest issue risk: <span className="text-white">{topIssueLabel}</span>
            </p>
          </div>
        </div>

        {/* Issue Breakdown */}
        <div className="card-pixel mb-10 md:mb-14 w-full">
          <p className="font-mono text-xs text-gray-500 tracking-widest mb-8">ISSUE RISK BREAKDOWN</p>
          <div className="space-y-2">
            {result.issues.map((issue) => (
              <Meter key={issue.issue} issue={issue} />
            ))}
          </div>
        </div>

        {/* Recommendations */}
        {recommendations.length > 0 ? (
          <div className="card-pixel mb-10 md:mb-14 w-full">
            <p className="font-mono text-xs text-gray-500 tracking-widest mb-8">🎯 AI RECOMMENDATIONS</p>
            <div className="space-y-4">
              {recommendations.slice(0, 4).map((rec) => (
                <div
                  key={`${rec.rank}-${rec.title}`}
                  className={`p-4 border ${
                    rec.type === "warning"
                      ? "border-orange-700/50 bg-orange-950/20"
                      : "border-green-700/50 bg-green-950/20"
                  } rounded`}
                >
                  <div className="flex justify-between items-start gap-4 mb-2">
                    <p className="font-mono text-sm text-white font-semibold">{rec.title}</p>
                    {rec.impact_pct > 0 && rec.type !== "warning" && (
                      <span className="text-xs font-mono px-2 py-1 bg-green-900/50 text-green-300 rounded">
                        -{rec.impact_pct.toFixed(1)}pp
                      </span>
                    )}
                  </div>
                  <p className="font-mono text-xs text-gray-300">{rec.detail}</p>
                </div>
              ))}
            </div>
          </div>
        ) : null}

        {/* Better Scenario Visualization */}
        {scenarioDataForChart.length > 0 ? (
          <div className="card-pixel mb-10 md:mb-14 w-full">
            <p className="font-mono text-xs text-gray-500 tracking-widest mb-8">INTERVENTION IMPACT — WHAT IF SCENARIOS</p>
            
            {/* Quick stats */}
            <div className="grid grid-cols-2 md:grid-cols-3 gap-4 mb-8">
              <div className="border border-gray-700 p-4 bg-black/40">
                <p className="text-[10px] text-gray-500 tracking-widest mb-2">CURRENT RISK</p>
                <p className="text-lg font-semibold text-white">{baselineRisk.toFixed(1)}%</p>
              </div>
              <div className="border border-green-700/50 p-4 bg-green-950/20">
                <p className="text-[10px] text-green-400 tracking-widest mb-2">BEST CASE</p>
                <p className="text-lg font-semibold text-green-300">{bestScenario.percent.toFixed(1)}%</p>
              </div>
              <div className="border border-blue-700/50 p-4 bg-blue-950/20">
                <p className="text-[10px] text-blue-400 tracking-widest mb-2">POTENTIAL SAVINGS</p>
                <p className="text-lg font-semibold text-blue-300">{bestImprovement}pp</p>
              </div>
            </div>

            {/* Bar chart */}
            <div style={{ width: "100%", height: 340 }} className="mb-8">
              <ResponsiveContainer>
                <BarChart data={scenarioDataForChart}>
                  <XAxis dataKey="scenario" tick={{ fill: "#9ca3af", fontSize: 11 }} interval={0} angle={-20} textAnchor="end" height={80} />
                  <YAxis tick={{ fill: "#9ca3af", fontSize: 11 }} unit="pp" />
                  <Tooltip
                    formatter={(value) => {
                      const numeric = typeof value === "number" ? value : Number(value);
                      const formatted = Number.isFinite(numeric) ? `${numeric.toFixed(2)} pp` : "0.00 pp";
                      return [formatted, "Delta vs baseline"];
                    }}
                    contentStyle={{
                      background: "#050505",
                      border: "1px solid #444",
                      color: "#f1f5f9",
                      fontSize: "11px",
                    }}
                  />
                  <Bar dataKey="delta">
                    {scenarioDataForChart.map((entry) => (
                      <Cell
                        key={entry.scenario}
                        fill={entry.delta <= 0 ? "#22c55e" : "#ff6464"}
                        onClick={() =>
                          setSelectedScenario(
                            selectedScenario === entry.fullScenario.scenario
                              ? null
                              : entry.fullScenario.scenario
                          )
                        }
                        style={{ cursor: "pointer", opacity: 0.8 }}
                      />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>

            {/* Scenario details - Interactive */}
            <div className="space-y-3">
              <p className="text-xs text-gray-500 font-mono">SCENARIO DETAILS (click bar to expand):</p>
              {scenarioDataForChart.map((row) => (
                <button
                  key={row.scenario}
                  onClick={() =>
                    setSelectedScenario(
                      selectedScenario === row.fullScenario.scenario ? null : row.fullScenario.scenario
                    )
                  }
                  className="w-full text-left p-4 border border-gray-700 bg-black/40 hover:border-gray-500 transition-colors"
                >
                  <div className="flex justify-between items-center gap-4">
                    <span className="font-mono text-sm text-white">{row.scenario}</span>
                    <span
                      className={`font-mono text-sm font-semibold ${
                        row.delta <= 0 ? "text-green-400" : "text-red-400"
                      }`}
                    >
                      {row.delta > 0 ? "+" : ""}{row.delta.toFixed(2)}pp
                    </span>
                  </div>
                  {selectedScenario === row.fullScenario.scenario && (
                    <div className="mt-3 text-xs text-gray-300 space-y-1 border-t border-gray-700 pt-3">
                      <p>
                        <span className="text-gray-500">Current risk:</span> {baselineRisk.toFixed(1)}%
                      </p>
                      <p>
                        <span className="text-gray-500">New risk:</span> {row.fullScenario.percent.toFixed(1)}%
                      </p>
                      <p>
                        <span className="text-gray-500">Change:</span>{" "}
                        <span className={row.delta <= 0 ? "text-green-400" : "text-red-400"}>
                          {row.delta > 0 ? "+" : ""}{row.delta.toFixed(2)} percentage points
                        </span>
                      </p>
                    </div>
                  )}
                </button>
              ))}
            </div>
          </div>
        ) : null}

        {/* Contributor Pie Charts */}
        {issueContributorEntries.length > 0 ? (
          <div className="card-pixel mb-10 md:mb-14 w-full">
            <p className="font-mono text-xs text-gray-500 tracking-widest mb-8">CAUSE GROUP CONTRIBUTOR PIE CHARTS</p>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-5 md:gap-6">
              {issueContributorEntries.map(([issueName, contributorData]) => (
                <IssueContributorPie key={issueName} issueName={issueName} data={contributorData} />
              ))}
            </div>
          </div>
        ) : null}

        {/* Top Contributors */}
        {result.issue_top_contributors ? (
          <div className="card-pixel mb-10 md:mb-14 w-full">
            <p className="font-mono text-xs text-gray-500 tracking-widest mb-8">TOP PERSONALIZED CONTRIBUTORS</p>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-5 md:gap-6">
              {Object.entries(result.issue_top_contributors).map(([issueName, contributors]) => (
                <div key={issueName} className="border border-gray-700 p-5 bg-black/40">
                  <p className="font-mono text-[11px] text-gray-500 tracking-widest mb-4">{toTitle(issueName)}</p>
                  <div className="space-y-3">
                    {contributors.slice(0, 3).map((contributor) => (
                      <div key={`${issueName}-${contributor.feature}`} className="flex justify-between gap-4 text-xs font-mono">
                        <span className="text-gray-200">{toTitle(contributor.feature)} ({toTitle(contributor.group)})</span>
                        <span className="text-gray-400">{contributor.share_pct.toFixed(1)}%</span>
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </div>
        ) : null}

        {/* Input Profile */}
        <div className="card-pixel mb-10 md:mb-14 w-full">
          <p className="font-mono text-xs text-gray-500 tracking-widest mb-8">MODEL INPUT PROFILE</p>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 md:gap-5">
            {result.feature_order.map((fieldName) => (
              <div key={fieldName} className="border border-gray-700 p-4 bg-black/40">
                <p className="font-mono text-[11px] text-gray-500 tracking-widest mb-2">{toTitle(fieldName)}</p>
                <p className="font-mono text-sm text-gray-200">{String(result.input_profile[fieldName] ?? "")}</p>
              </div>
            ))}
          </div>
          <div className="border-t border-gray-700 mt-8 pt-8">
            <p className="font-mono text-xs text-gray-600 leading-relaxed">
              Results are generated from the trained grouped wellbeing model and are intended for educational insights, not clinical diagnosis.
            </p>
          </div>
        </div>

        {/* Action Buttons */}
        <div className="flex gap-4 md:gap-6 flex-wrap justify-center pb-8 w-full">
          <Link href="/assess">
            <button className="btn-pixel" style={{ fontSize: "0.85rem", padding: "1.2rem 2.5rem" }}>← REPLAY MISSION</button>
          </Link>
          <Link href="/">
            <button
              className="font-pixel border border-gray-700 text-gray-400 hover:border-white hover:text-white transition-colors"
              style={{ fontSize: "0.85rem", padding: "1.2rem 2.5rem" }}
            >
              RETURN TO BASE
            </button>
          </Link>
        </div>
      </div>
    </div>
  );
}
