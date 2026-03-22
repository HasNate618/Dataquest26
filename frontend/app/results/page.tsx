"use client";

import { useMemo } from "react";
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
    <div className="mb-5">
      <div className="flex justify-between font-mono text-xs text-gray-400 mb-2">
        <span className="tracking-widest">{toTitle(issue.issue)}</span>
        <span style={{ color: barColor, fontSize: "0.6rem" }} className="font-pixel">
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
    <div className="border border-gray-800 p-4">
      <p className="font-mono text-[11px] text-gray-500 tracking-widest mb-4">{toTitle(issueName)}</p>
      <div style={{ width: "100%", height: 220 }}>
        <ResponsiveContainer>
          <PieChart>
            <Pie data={chartData} dataKey="value" nameKey="name" innerRadius={40} outerRadius={78} label>
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

  if (!stored) {
    return (
      <div className="relative min-h-screen flex items-center justify-center">
        <div className="stars-layer stars-small" style={{ opacity: 0.3 }} />
        <div className="stars-layer stars-medium" style={{ opacity: 0.3 }} />
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
  const scenarioDataForChart = scenarioData
    .filter((row) => row.scenario !== "baseline")
    .map((row) => ({
      scenario: scenarioLabel(row.scenario),
      delta: Number((row.delta_vs_baseline * 100).toFixed(2)),
    }));

  return (
    <div className="relative min-h-screen">
      <div className="stars-layer stars-small" style={{ opacity: 0.3 }} />
      <div className="stars-layer stars-medium" style={{ opacity: 0.3 }} />
      <div className="scanlines" />

      <div className="relative z-10 max-w-3xl mx-auto px-6 py-16">
        <div className="mb-10">
          <p className="font-mono text-gray-600 text-xs tracking-widest mb-8">MISSION COMPLETE — MODEL INFERENCE REPORT</p>
          <h1 className="font-pixel text-white" style={{ fontSize: "0.85rem", lineHeight: "2.2" }}>
            YOUR RESULTS
          </h1>
          <p className="font-mono text-xs text-gray-500 mt-4">Generated at {generatedAt}</p>
        </div>

        <div className="card-pixel mb-8">
          <p className="font-mono text-xs text-gray-500 tracking-widest mb-4">MODEL SUMMARY</p>
          <p className="font-mono text-sm text-gray-300 mb-3">Primary model: <span className="text-white">{result.model}</span></p>
          <p className="font-mono text-sm text-gray-300 mb-3">
            Overall wellbeing risk:{" "}
            <span style={{ color: levelColor(result.overall.label) }} className="font-semibold">
              {result.overall.label.toUpperCase()} ({result.overall.percent.toFixed(1)}%)
            </span>
          </p>
          <p className="font-mono text-sm text-gray-300">
            Highest issue risk: <span className="text-white">{topIssueLabel}</span>
          </p>
        </div>

        <div className="card-pixel mb-8">
          <p className="font-mono text-xs text-gray-500 tracking-widest mb-6">ISSUE RISK BREAKDOWN</p>
          {result.issues.map((issue) => (
            <Meter key={issue.issue} issue={issue} />
          ))}
        </div>

        {scenarioDataForChart.length > 0 ? (
          <div className="card-pixel mb-8">
            <p className="font-mono text-xs text-gray-500 tracking-widest mb-6">INTERVENTION SCENARIO IMPACT (VS BASELINE)</p>
            <div style={{ width: "100%", height: 320 }}>
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
                      <Cell key={entry.scenario} fill={entry.delta <= 0 ? "#22c55e" : "#ff6464"} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
            <p className="font-mono text-xs text-gray-600 mt-4">
              Negative values indicate lower overall risk than baseline.
            </p>
          </div>
        ) : null}

        {issueContributorEntries.length > 0 ? (
          <div className="card-pixel mb-8">
            <p className="font-mono text-xs text-gray-500 tracking-widest mb-6">CAUSE GROUP CONTRIBUTOR PIE CHARTS</p>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {issueContributorEntries.map(([issueName, contributorData]) => (
                <IssueContributorPie key={issueName} issueName={issueName} data={contributorData} />
              ))}
            </div>
          </div>
        ) : null}

        {result.issue_top_contributors ? (
          <div className="card-pixel mb-8">
            <p className="font-mono text-xs text-gray-500 tracking-widest mb-6">TOP PERSONALIZED CONTRIBUTORS</p>
            <div className="space-y-6">
              {Object.entries(result.issue_top_contributors).map(([issueName, contributors]) => (
                <div key={issueName} className="border border-gray-800 p-4">
                  <p className="font-mono text-[11px] text-gray-500 tracking-widest mb-3">{toTitle(issueName)}</p>
                  <div className="space-y-2">
                    {contributors.slice(0, 3).map((contributor) => (
                      <div key={`${issueName}-${contributor.feature}`} className="flex justify-between gap-4 text-xs font-mono">
                        <span className="text-gray-200">{toTitle(contributor.feature)} ({toTitle(contributor.group)})</span>
                        <span className="text-gray-400">{contributor.share_pct.toFixed(1)}% share</span>
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </div>
        ) : null}

        <div className="card-pixel mb-10">
          <p className="font-mono text-xs text-gray-500 tracking-widest mb-6">MODEL INPUT PROFILE</p>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {result.feature_order.map((fieldName) => (
              <div key={fieldName} className="border border-gray-800 p-3">
                <p className="font-mono text-[11px] text-gray-500 tracking-widest mb-1">{toTitle(fieldName)}</p>
                <p className="font-mono text-sm text-gray-200">{String(result.input_profile[fieldName] ?? "")}</p>
              </div>
            ))}
          </div>
          <div className="border-t border-gray-800 mt-6 pt-6">
            <p className="font-mono text-xs text-gray-600 leading-6">
              Results are generated from the trained grouped wellbeing model and are intended for educational insights, not clinical diagnosis.
            </p>
          </div>
        </div>

        <div className="flex gap-4 flex-wrap">
          <Link href="/assess">
            <button className="btn-pixel px-8 py-4">← REPLAY MISSION</button>
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
