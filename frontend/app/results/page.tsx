"use client";

import { useMemo } from "react";
import Link from "next/link";
import {
  Cell,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Legend,
} from "recharts";

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
  action?: string;
  detail: string;
  impact_pct: number;
  new_risk_pct: number;
  type?: string;
  scenario_key?: string;
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
  grouping?: {
    cluster: number;
    group_name: string;
    available_groups: Array<{ cluster: number; group_name: string }>;
    n_features: number;
  };
}

function toTitle(value: string): string {
  return value
    .replace(/_/g, " ")
    .replace(/\b\w/g, (char) => char.toUpperCase());
}

function levelColor(label: string): string {
  if (label === "High") return "#ef4444"; // red for high risk
  if (label === "Moderate") return "#f59e0b"; // amber for moderate
  if (label === "Mild") return "#3b82f6"; // blue for mild
  return "#10b981"; // green for low
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
    gaming_load: "#8b5cf6", // purple
    gaming_spend: "#f59e0b", // amber
    health_habits: "#10b981", // green
    game_context: "#06b6d4", // cyan
    context: "#ec4899", // pink
    sleep_process: "#6366f1", // indigo
    other: "#94a3b8", // slate
  };
  return palette[group] ?? "#60a5fa";
}

function groupLabel(group: string): string {
  const labels: Record<string, string> = {
    gaming_load: "Daily Gaming Hours",
    gaming_spend: "In-Game Spending",
    health_habits: "Health & Exercise",
    game_context: "Game Choice & Platform",
    context: "Years Gaming",
    sleep_process: "Sleep Quality",
    other: "Other",
  };
  return labels[group] ?? group;
}

function scenarioLabel(value: string): string {
  return value
    .replace(/_/g, " ")
    .replace(/\b\w/g, (char) => char.toUpperCase());
}

function Meter({ issue }: { issue: AnalysisIssue }) {
  const barColor = levelColor(issue.label);

  return (
    <div className="mb-7">
      <div className="flex justify-between items-center font-mono text-xs text-gray-400 mb-3">
        <span className="tracking-wide font-semibold">
          {toTitle(issue.issue)}
        </span>
        <span style={{ color: barColor }} className="font-pixel text-sm">
          {issue.label.toUpperCase()} ({issue.percent.toFixed(1)}%)
        </span>
      </div>
      <div
        className="meter-track"
        style={{ height: "14px", borderWidth: "2px" }}
      >
        <div
          className="meter-fill"
          style={{
            width: `${issue.percent}%`,
            background: barColor,
            transition: "width 1s ease",
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
  // Filter out groups with 0% share and map to descriptive names
  const chartData = data
    .filter((item) => item.share_pct > 0)
    .map((item) => ({
      name: groupLabel(item.group),
      value: Number(item.share_pct.toFixed(2)),
      fill: groupColor(item.group),
    }));

  return (
    <div className="border-2 border-gray-700 p-5 md:p-6 bg-black/40">
      <p className="font-mono text-xs text-gray-500 tracking-widest mb-6">
        {toTitle(issueName)}
      </p>
      <div style={{ width: "100%", height: 260 }}>
        <ResponsiveContainer>
          <PieChart>
            <Pie
              data={chartData}
              dataKey="value"
              nameKey="name"
              innerRadius={50}
              outerRadius={90}
              label={(props) => {
                // eslint-disable-next-line @typescript-eslint/no-explicit-any
                const percent = ((props as any).percent as number) || 0;
                if (percent < 0.03) return ""; // Hide labels for very small slices
                return `${(percent * 100).toFixed(0)}%`;
              }}
              labelLine={false}
              fill="#8884d8"
              style={{ fontSize: "13px", fontWeight: "600" }}
            >
              {chartData.map((entry) => (
                <Cell key={`${issueName}-${entry.name}`} fill={entry.fill} />
              ))}
            </Pie>
            <Tooltip
              formatter={(value, name) => [
                formatTooltipValue(value),
                String(name),
              ]}
              contentStyle={{
                background: "#050505",
                border: "1px solid #555",
                color: "#f1f5f9",
                fontSize: "11px",
              }}
            />
            <Legend
              wrapperStyle={{ fontSize: "12px", paddingTop: "16px" }}
              iconType="circle"
              iconSize={10}
            />
          </PieChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}

export default function ResultsPage() {
  const stored = useMemo(() => readStoredAnalysis(), []);

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
            <button className="btn-pixel px-8 py-4">
              GO TO CHARACTER PROFILE
            </button>
          </Link>
        </div>
      </div>
    );
  }

  const { result } = stored;
  const personaName = stored.grouping?.group_name ?? null;
  const personaCluster = stored.grouping?.cluster ?? null;
  const topIssueLabel = result.top_issue
    ? toTitle(result.top_issue.issue)
    : "None";
  const generatedAt = new Date(stored.generatedAt).toLocaleString();
  const issueContributorEntries = Object.entries(
    result.issue_contributor_groups ?? {},
  );
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
    curr.probability < best.probability ? curr : best,
  );
  const bestImprovement = (
    (bestScenario.probability - baselineScenario!.probability) *
    100
  ).toFixed(1);

  return (
    <div className="relative min-h-screen flex flex-col items-center">
      {/* Background layers */}
      <div className="stars-layer stars-small" />
      <div className="stars-layer stars-medium" />
      <div className="scanlines" />

      <div className="relative z-10 w-full max-w-4xl px-4 md:px-6 py-12 md:py-20 flex flex-col items-center">
        {/* Back link */}
        <Link
          href="/"
          className="font-pixel text-gray-500 hover:text-white transition-colors fixed top-6 left-6 z-50"
          style={{ fontSize: "0.85rem" }}
        >
          ← BACK TO BASE
        </Link>

        {/* Header */}
        <div className="mb-16 md:mb-20 text-center pt-8 w-full">
          <p className="font-mono text-gray-600 text-xs tracking-widest mb-6 md:mb-8">
            MISSION COMPLETE — MODEL INFERENCE REPORT
          </p>
          <h1
            className="font-pixel text-white mb-6 md:mb-8"
            style={{
              fontSize: "clamp(2rem, 5vw, 3rem)",
              lineHeight: "1.3",
              letterSpacing: "0.05em",
            }}
          >
            YOUR RESULTS
          </h1>
          <p className="font-mono text-xs text-gray-500">
            Generated at {generatedAt}
          </p>
        </div>

        <div className="card-pixel mb-8">
          <p className="font-mono text-xs text-gray-500 tracking-widest mb-4">
            MODEL SUMMARY
          </p>
          <p className="font-mono text-sm text-gray-300 mb-3">
            Primary model: <span className="text-white">{result.model}</span>
          </p>
          {personaName ? (
            <p className="font-mono text-sm text-gray-300 mb-3">
              Persona group: <span className="text-white">{personaName}</span>
              {personaCluster !== null ? (
                <span className="text-gray-500">
                  {" "}
                  (Cluster {personaCluster})
                </span>
              ) : null}
            </p>
          ) : null}
          <p className="font-mono text-sm text-gray-300 mb-3">
            Overall wellbeing risk:{" "}
            <span
              style={{ color: levelColor(result.overall.label) }}
              className="font-semibold"
            >
              {result.overall.label.toUpperCase()} (
              {result.overall.percent.toFixed(1)}%)
            </span>
          </p>
          <p className="font-mono text-sm text-gray-300">
            Highest issue risk:{" "}
            <span className="text-white">{topIssueLabel}</span>
          </p>
        </div>
        {/* Summary Card */}
        <div className="card-pixel mb-14 md:mb-16 w-full">
          <p
            className="font-pixel text-gray-300 tracking-widest mb-10"
            style={{ fontSize: "1.1rem", letterSpacing: "0.15em" }}
          >
            MODEL SUMMARY
          </p>
          <div className="space-y-6 md:space-y-7">
            <p className="font-mono text-sm text-gray-300">
              Primary model:{" "}
              <span className="text-white font-semibold">{result.model}</span>
            </p>
            <p className="font-mono text-sm text-gray-300">
              Overall wellbeing risk:{" "}
              <span
                style={{ color: levelColor(result.overall.label) }}
                className="font-bold"
              >
                {result.overall.label.toUpperCase()} (
                {result.overall.percent.toFixed(1)}%)
              </span>
            </p>
            <p className="font-mono text-sm text-gray-300">
              Highest issue risk:{" "}
              <span className="text-white font-semibold">{topIssueLabel}</span>
            </p>
          </div>
        </div>

        {/* Input Profile */}
        <div className="card-pixel mb-14 md:mb-16 w-full">
          <p
            className="font-pixel text-gray-300 tracking-widest mb-10"
            style={{ fontSize: "1.1rem", letterSpacing: "0.15em" }}
          >
            INPUT PROFILE
          </p>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5 md:gap-6">
            {result.feature_order.map((fieldName) => (
              <div
                key={fieldName}
                className="border-2 border-gray-700 p-4 md:p-5 bg-black/40"
              >
                <p className="font-mono text-[10px] text-gray-500 tracking-widest mb-3">
                  {toTitle(fieldName)}
                </p>
                <p className="font-mono text-sm text-gray-100 font-semibold">
                  {String(result.input_profile[fieldName] ?? "")}
                </p>
              </div>
            ))}
          </div>
          <div className="border-t-2 border-gray-700 mt-10 pt-10">
            <p className="font-mono text-xs text-gray-600 leading-relaxed">
              Results are generated from the trained grouped wellbeing model and
              are intended for educational insights, not clinical diagnosis.
            </p>
          </div>
        </div>

        {/* Issue Breakdown */}
        <div className="card-pixel mb-14 md:mb-16 w-full">
          <p
            className="font-pixel text-gray-300 tracking-widest mb-10"
            style={{ fontSize: "1.1rem", letterSpacing: "0.15em" }}
          >
            ISSUE RISK BREAKDOWN
          </p>
          <div className="space-y-4">
            {result.issues.map((issue) => (
              <Meter key={issue.issue} issue={issue} />
            ))}
          </div>
        </div>

        {/* Contributor Pie Charts */}
        {issueContributorEntries.length > 0 ? (
          <div className="card-pixel mb-14 md:mb-16 w-full">
            <p
              className="font-pixel text-gray-300 tracking-widest mb-10"
              style={{ fontSize: "1.1rem", letterSpacing: "0.15em" }}
            >
              CONTRIBUTOR BREAKDOWN
            </p>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6 md:gap-8">
              {issueContributorEntries.map(([issueName, contributorData]) => (
                <IssueContributorPie
                  key={issueName}
                  issueName={issueName}
                  data={contributorData}
                />
              ))}
            </div>
          </div>
        ) : null}

        {/* Better Scenario Visualization */}
        {scenarioDataForChart.length > 0 ? (
          <div className="card-pixel mb-10 md:mb-14 w-full">
            <p
              className="font-pixel text-gray-300 text-xs tracking-widest mb-10"
              style={{ fontSize: "1rem", letterSpacing: "0.12em" }}
            >
              INTERVENTION IMPACT — WHAT IF SCENARIOS
            </p>

            {/* Quick stats */}
            <div className="grid grid-cols-2 md:grid-cols-3 gap-5 mb-10">
              <div className="border-2 border-gray-700 p-5 bg-black/40">
                <p className="text-[10px] text-gray-500 tracking-widest mb-3">
                  CURRENT RISK
                </p>
                <p className="text-xl font-semibold text-white">
                  {baselineRisk.toFixed(1)}%
                </p>
              </div>
              <div className="border-2 border-emerald-500/50 p-5 bg-emerald-950/20">
                <p className="text-[10px] text-emerald-400 tracking-widest mb-3">
                  BEST CASE
                </p>
                <p className="text-xl font-semibold text-emerald-300">
                  {bestScenario.percent.toFixed(1)}%
                </p>
              </div>
              <div className="border-2 border-cyan-500/50 p-5 bg-cyan-950/20">
                <p className="text-[10px] text-cyan-400 tracking-widest mb-3">
                  POTENTIAL SAVINGS
                </p>
                <p className="text-xl font-semibold text-cyan-300">
                  {bestImprovement}pp
                </p>
              </div>
            </div>

            {/* Bar chart */}
            <div style={{ width: "100%", height: 340 }} className="mb-10">
              <ResponsiveContainer>
                <BarChart data={scenarioDataForChart}>
                  <XAxis
                    dataKey="scenario"
                    tick={{ fill: "#9ca3af", fontSize: 11 }}
                    interval={0}
                    angle={-20}
                    textAnchor="end"
                    height={80}
                  />
                  <YAxis tick={{ fill: "#9ca3af", fontSize: 11 }} unit="pp" />
                  <Tooltip
                    formatter={(value) => {
                      const numeric =
                        typeof value === "number" ? value : Number(value);
                      const formatted = Number.isFinite(numeric)
                        ? `${numeric.toFixed(2)} pp`
                        : "0.00 pp";
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
                        fill={entry.delta <= 0 ? "#10b981" : "#f59e0b"}
                        style={{ opacity: 0.85 }}
                      />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>
        ) : null}

        {/* Recommendations */}
        {recommendations.length > 0 ? (
          <div className="card-pixel mb-10 md:mb-14 w-full">
            <p
              className="font-pixel text-gray-300 text-xs tracking-widest mb-10"
              style={{ fontSize: "0.95rem", letterSpacing: "0.12em" }}
            >
              AI RECOMMENDATIONS — RANKED BY IMPACT
            </p>
            <div className="space-y-6">
              {recommendations.slice(0, 4).map((rec) => (
                <div
                  key={`${rec.rank}-${rec.title}`}
                  className={`p-6 border-2 rounded ${
                    rec.type === "warning"
                      ? "border-orange-500/60 bg-orange-950/20"
                      : "border-emerald-500/60 bg-emerald-950/20"
                  }`}
                >
                  <div className="flex justify-between items-start gap-4 mb-4">
                    <div className="flex-1">
                      <p className="font-mono text-sm text-white font-semibold mb-2">
                        {rec.rank}. {rec.title}
                      </p>
                      {rec.action && (
                        <p className="text-[11px] font-mono text-gray-400 mt-1">
                          {rec.action}
                        </p>
                      )}
                    </div>
                    {rec.impact_pct > 0 && rec.type !== "warning" && (
                      <span className="text-xs font-mono px-3 py-1.5 bg-emerald-900/50 text-emerald-300 rounded whitespace-nowrap font-semibold">
                        -{rec.impact_pct.toFixed(1)}pp
                      </span>
                    )}
                  </div>
                  <p className="font-mono text-[12px] text-gray-300 whitespace-pre-line leading-relaxed mt-3">
                    {rec.detail}
                  </p>
                </div>
              ))}
            </div>
          </div>
        ) : null}

        {/* Action Buttons */}
        <div className="flex gap-6 md:gap-8 flex-wrap justify-center pb-8 w-full mt-6">
          <Link href="/assess">
            <button
              className="btn-pixel font-pixel"
              style={{
                fontSize: "0.9rem",
                padding: "1.3rem 2.8rem",
                letterSpacing: "0.1em",
              }}
            >
              ← REPLAY MISSION
            </button>
          </Link>
          <Link href="/">
            <button
              className="font-pixel border-2 border-gray-700 text-gray-400 hover:border-white hover:text-white transition-colors"
              style={{
                fontSize: "0.9rem",
                padding: "1.3rem 2.8rem",
                letterSpacing: "0.1em",
              }}
            >
              RETURN TO BASE
            </button>
          </Link>
        </div>
      </div>
    </div>
  );
}
