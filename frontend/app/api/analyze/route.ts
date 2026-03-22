import { spawn } from "node:child_process";
import { constants as fsConstants } from "node:fs";
import { access } from "node:fs/promises";
import path from "node:path";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const NUMERIC_RANGES = {
  age: [10, 80],
  daily_gaming_hours: [0, 24],
  monthly_game_spending_usd: [0, 2000],
  exercise_hours_weekly: [0, 40],
  years_gaming: [0, 70],
} as const;

type NumericField = keyof typeof NUMERIC_RANGES;
type CategoricalField = "gender" | "game_genre" | "primary_game" | "gaming_platform";

interface AnalysisRequestPayload {
  age: number;
  daily_gaming_hours: number;
  monthly_game_spending_usd: number;
  exercise_hours_weekly: number;
  years_gaming: number;
  gender: string;
  game_genre: string;
  primary_game: string;
  gaming_platform: string;
}

interface IssueRiskPayload {
  issue: string;
  probability: number;
  percent: number;
  label: string;
}

interface ContributorGroupPayload {
  group: string;
  share_pct: number;
}

interface TopContributorPayload {
  feature: string;
  group: string;
  share_pct: number;
  delta: number;
}

interface ScenarioPayload {
  scenario: string;
  probability: number;
  percent: number;
  label: string;
  delta_vs_baseline: number;
}

interface AnalysisResponsePayload {
  model: string;
  feature_order: string[];
  overall: {
    probability: number;
    percent: number;
    label: string;
  };
  issues: IssueRiskPayload[];
  top_issue: IssueRiskPayload | null;
  input_profile: AnalysisRequestPayload;
  issue_contributor_groups?: Record<string, ContributorGroupPayload[]>;
  issue_top_contributors?: Record<string, TopContributorPayload[]>;
  overall_scenarios?: ScenarioPayload[];
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function parseNumericField(source: Record<string, unknown>, field: NumericField): number {
  const rawValue = source[field];
  const numericValue = typeof rawValue === "number" ? rawValue : Number(rawValue);
  if (!Number.isFinite(numericValue)) {
    throw new Error(`Field "${field}" must be a valid number.`);
  }
  const [minValue, maxValue] = NUMERIC_RANGES[field];
  if (numericValue < minValue || numericValue > maxValue) {
    throw new Error(`Field "${field}" must be between ${minValue} and ${maxValue}.`);
  }
  return numericValue;
}

function parseStringField(source: Record<string, unknown>, field: CategoricalField): string {
  const rawValue = source[field];
  if (typeof rawValue !== "string") {
    throw new Error(`Field "${field}" must be a string.`);
  }
  const trimmedValue = rawValue.trim();
  if (trimmedValue.length === 0) {
    throw new Error(`Field "${field}" is required.`);
  }
  return trimmedValue;
}

function validatePayload(payload: unknown): AnalysisRequestPayload {
  if (!isRecord(payload)) {
    throw new Error("Request body must be a JSON object.");
  }

  return {
    age: parseNumericField(payload, "age"),
    daily_gaming_hours: parseNumericField(payload, "daily_gaming_hours"),
    monthly_game_spending_usd: parseNumericField(payload, "monthly_game_spending_usd"),
    exercise_hours_weekly: parseNumericField(payload, "exercise_hours_weekly"),
    years_gaming: parseNumericField(payload, "years_gaming"),
    gender: parseStringField(payload, "gender"),
    game_genre: parseStringField(payload, "game_genre"),
    primary_game: parseStringField(payload, "primary_game"),
    gaming_platform: parseStringField(payload, "gaming_platform"),
  };
}

async function pathExists(filePath: string): Promise<boolean> {
  try {
    await access(filePath, fsConstants.F_OK);
    return true;
  } catch (error) {
    const err = error as NodeJS.ErrnoException;
    if (err.code === "ENOENT") {
      return false;
    }
    throw error;
  }
}

function uniquePaths(paths: Array<string | undefined>): string[] {
  return [...new Set(paths.filter((value): value is string => typeof value === "string" && value.length > 0))];
}

async function resolveModelPaths() {
  const cwd = process.cwd();
  const rootCandidates = uniquePaths([
    process.env.DATAQUEST_PROJECT_ROOT,
    path.resolve(cwd, ".."),
    cwd,
    path.resolve(cwd, "../.."),
    path.resolve(cwd, "../../.."),
  ]);

  let lastScriptPath = "";

  for (const candidateRoot of rootCandidates) {
    const scriptPath = path.join(candidateRoot, "train", "infer_grouped_model.py");
    const modelArtifactPath = path.join(candidateRoot, "train", "artifacts", "grouped_wellbeing_model.pkl");
    lastScriptPath = scriptPath;

    if (!(await pathExists(scriptPath))) {
      continue;
    }

    return {
      projectRoot: candidateRoot,
      scriptPath,
      modelArtifactPath,
    };
  }

  throw new Error(
    `Inference script could not be located. Checked candidate roots: ${rootCandidates.join(", ")}. ` +
      `Last attempted path: ${lastScriptPath}.`
  );
}

async function resolvePythonBinary(projectRoot: string): Promise<string> {
  const candidates = [
    path.join(projectRoot, ".venv", "bin", "python"),
    path.join(projectRoot, ".venv", "bin", "python3"),
  ];

  for (const candidate of candidates) {
    if (await pathExists(candidate)) {
      return candidate;
    }
  }

  throw new Error(
    `Python runtime not found. Expected one of: ${candidates.join(", ")}. ` +
      "Create the project virtual environment and install model dependencies."
  );
}

function isIssueRiskPayload(value: unknown): value is IssueRiskPayload {
  if (!isRecord(value)) {
    return false;
  }
  return (
    typeof value.issue === "string" &&
    typeof value.label === "string" &&
    Number.isFinite(value.probability) &&
    Number.isFinite(value.percent)
  );
}

function isContributorGroupPayload(value: unknown): value is ContributorGroupPayload {
  if (!isRecord(value)) {
    return false;
  }
  return typeof value.group === "string" && Number.isFinite(value.share_pct);
}

function isTopContributorPayload(value: unknown): value is TopContributorPayload {
  if (!isRecord(value)) {
    return false;
  }
  return (
    typeof value.feature === "string" &&
    typeof value.group === "string" &&
    Number.isFinite(value.share_pct) &&
    Number.isFinite(value.delta)
  );
}

function isScenarioPayload(value: unknown): value is ScenarioPayload {
  if (!isRecord(value)) {
    return false;
  }
  return (
    typeof value.scenario === "string" &&
    typeof value.label === "string" &&
    Number.isFinite(value.probability) &&
    Number.isFinite(value.percent) &&
    Number.isFinite(value.delta_vs_baseline)
  );
}

function isAnalysisResponsePayload(value: unknown): value is AnalysisResponsePayload {
  if (!isRecord(value)) {
    return false;
  }

  if (
    typeof value.model !== "string" ||
    !Array.isArray(value.feature_order) ||
    !value.feature_order.every((item) => typeof item === "string")
  ) {
    return false;
  }

  if (!isRecord(value.overall)) {
    return false;
  }

  if (
    !Number.isFinite(value.overall.probability) ||
    !Number.isFinite(value.overall.percent) ||
    typeof value.overall.label !== "string"
  ) {
    return false;
  }

  if (!Array.isArray(value.issues) || !value.issues.every((issue) => isIssueRiskPayload(issue))) {
    return false;
  }

  if (value.top_issue !== null && !isIssueRiskPayload(value.top_issue)) {
    return false;
  }

  if (!isRecord(value.input_profile)) {
    return false;
  }

  if (
    value.issue_contributor_groups !== undefined &&
    (!isRecord(value.issue_contributor_groups) ||
      !Object.values(value.issue_contributor_groups).every(
        (entry) => Array.isArray(entry) && entry.every((item) => isContributorGroupPayload(item))
      ))
  ) {
    return false;
  }

  if (
    value.issue_top_contributors !== undefined &&
    (!isRecord(value.issue_top_contributors) ||
      !Object.values(value.issue_top_contributors).every(
        (entry) => Array.isArray(entry) && entry.every((item) => isTopContributorPayload(item))
      ))
  ) {
    return false;
  }

  if (
    value.overall_scenarios !== undefined &&
    (!Array.isArray(value.overall_scenarios) || !value.overall_scenarios.every((item) => isScenarioPayload(item)))
  ) {
    return false;
  }

  return true;
}

async function runInference(
  pythonBinary: string,
  scriptPath: string,
  modelArtifactPath: string,
  payload: AnalysisRequestPayload
): Promise<AnalysisResponsePayload> {
  const scriptArgs = [
    scriptPath,
    "--artifact",
    modelArtifactPath,
    "--payload",
    JSON.stringify(payload),
  ];

  return new Promise((resolve, reject) => {
    const processHandle = spawn(pythonBinary, scriptArgs, {
      stdio: ["ignore", "pipe", "pipe"],
    });

    const timeoutHandle = setTimeout(() => {
      processHandle.kill("SIGKILL");
      reject(new Error("Model inference timed out."));
    }, 25000);

    let stdout = "";
    let stderr = "";

    processHandle.stdout.on("data", (chunk: Buffer) => {
      stdout += chunk.toString();
    });

    processHandle.stderr.on("data", (chunk: Buffer) => {
      stderr += chunk.toString();
    });

    processHandle.on("error", (error) => {
      clearTimeout(timeoutHandle);
      reject(error);
    });

    processHandle.on("close", (exitCode) => {
      clearTimeout(timeoutHandle);
      if (exitCode !== 0) {
        reject(
          new Error(
            stderr.trim() ||
              `Inference process exited with code ${exitCode ?? "unknown"} without an error message.`
          )
        );
        return;
      }

      let parsedOutput: unknown;
      try {
        parsedOutput = JSON.parse(stdout);
      } catch {
        reject(new Error("Inference script did not return valid JSON output."));
        return;
      }

      if (!isAnalysisResponsePayload(parsedOutput)) {
        reject(new Error("Inference script returned an unexpected response shape."));
        return;
      }

      resolve(parsedOutput);
    });
  });
}

export async function POST(request: Request) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "Invalid JSON body." }, { status: 400 });
  }

  let payload: AnalysisRequestPayload;
  try {
    payload = validatePayload(body);
  } catch (validationError) {
    const message = validationError instanceof Error ? validationError.message : "Invalid request payload.";
    return Response.json({ error: message }, { status: 400 });
  }

  let modelPaths:
    | {
        projectRoot: string;
        scriptPath: string;
        modelArtifactPath: string;
      }
    | undefined;
  try {
    modelPaths = await resolveModelPaths();
  } catch (pathError) {
    const message = pathError instanceof Error ? pathError.message : "Failed to resolve model paths.";
    return Response.json({ error: message }, { status: 500 });
  }

  if (!(await pathExists(modelPaths.modelArtifactPath))) {
    return Response.json(
      {
        error: `Model artifact missing at ${modelPaths.modelArtifactPath}. Train the model before running analysis.`,
      },
      { status: 500 }
    );
  }

  let pythonBinary: string;
  try {
    pythonBinary = await resolvePythonBinary(modelPaths.projectRoot);
  } catch (pythonError) {
    const message = pythonError instanceof Error ? pythonError.message : "Python runtime unavailable.";
    return Response.json({ error: message }, { status: 500 });
  }

  try {
    const analysisResponse = await runInference(
      pythonBinary,
      modelPaths.scriptPath,
      modelPaths.modelArtifactPath,
      payload
    );
    return Response.json(analysisResponse, { status: 200 });
  } catch (inferenceError) {
    const message =
      inferenceError instanceof Error ? inferenceError.message : "Inference failed with an unknown error.";
    return Response.json(
      {
        error: `Failed to run trained model inference: ${message}`,
      },
      { status: 500 }
    );
  }
}
