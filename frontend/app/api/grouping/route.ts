import { spawn } from "node:child_process";
import { constants as fsConstants } from "node:fs";
import { access } from "node:fs/promises";
import path from "node:path";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

interface GroupingRequestPayload {
  age: number;
  years_gaming: number;
  daily_gaming_hours: number;
  monthly_game_spending_usd: number;
  exercise_hours_weekly: number;
  gender: string;
  game_genre: string;
  primary_game: string;
  gaming_platform: string;
}

interface GroupingResponsePayload {
  cluster: number;
  group_name: string;
  available_groups: Array<{ cluster: number; group_name: string }>;
  n_features: number;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

const NUMERIC_RANGES = {
  age: [10, 80],
  years_gaming: [0, 70],
  daily_gaming_hours: [0, 24],
  monthly_game_spending_usd: [0, 2000],
  exercise_hours_weekly: [0, 40],
} as const;

type NumericField = keyof typeof NUMERIC_RANGES;
type StringField = "gender" | "game_genre" | "primary_game" | "gaming_platform";

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

function parseStringField(source: Record<string, unknown>, field: StringField): string {
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

function validatePayload(payload: unknown): GroupingRequestPayload {
  if (!isRecord(payload)) {
    throw new Error("Request body must be a JSON object.");
  }

  return {
    age: parseNumericField(payload, "age"),
    years_gaming: parseNumericField(payload, "years_gaming"),
    daily_gaming_hours: parseNumericField(payload, "daily_gaming_hours"),
    monthly_game_spending_usd: parseNumericField(payload, "monthly_game_spending_usd"),
    exercise_hours_weekly: parseNumericField(payload, "exercise_hours_weekly"),
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
    const scriptPath = path.join(candidateRoot, "train", "predict_k_cluster.py");
    const modelPath = path.join(candidateRoot, "model", "k_cluster.pkl");
    lastScriptPath = scriptPath;

    if (!(await pathExists(scriptPath))) {
      continue;
    }

    return {
      projectRoot: candidateRoot,
      scriptPath,
      modelPath,
    };
  }

  throw new Error(
    `Grouping script could not be located. Checked candidate roots: ${rootCandidates.join(", ")}. ` +
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

function isGroupingResponsePayload(value: unknown): value is GroupingResponsePayload {
  if (!isRecord(value)) {
    return false;
  }

  return (
    Number.isInteger(value.cluster) &&
    typeof value.group_name === "string" &&
    Array.isArray(value.available_groups) &&
    value.available_groups.every(
      (entry) =>
        isRecord(entry) && Number.isInteger(entry.cluster) && typeof entry.group_name === "string"
    ) &&
    Number.isInteger(value.n_features)
  );
}

async function runGrouping(
  pythonBinary: string,
  scriptPath: string,
  modelPath: string,
  payload: GroupingRequestPayload
): Promise<GroupingResponsePayload> {
  const scriptArgs = [
    scriptPath,
    "--model",
    modelPath,
    "--payload",
    JSON.stringify(payload),
  ];

  return new Promise((resolve, reject) => {
    const processHandle = spawn(pythonBinary, scriptArgs, {
      stdio: ["ignore", "pipe", "pipe"],
    });

    const timeoutHandle = setTimeout(() => {
      processHandle.kill("SIGKILL");
      reject(new Error("KMeans grouping timed out."));
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
              `Grouping process exited with code ${exitCode ?? "unknown"} without an error message.`
          )
        );
        return;
      }

      let parsedOutput: unknown;
      try {
        parsedOutput = JSON.parse(stdout);
      } catch {
        reject(new Error("Grouping script did not return valid JSON output."));
        return;
      }

      if (!isGroupingResponsePayload(parsedOutput)) {
        reject(new Error("Grouping script returned an unexpected response shape."));
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

  let payload: GroupingRequestPayload;
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
        modelPath: string;
      }
    | undefined;

  try {
    modelPaths = await resolveModelPaths();
  } catch (pathError) {
    const message = pathError instanceof Error ? pathError.message : "Failed to resolve model paths.";
    return Response.json({ error: message }, { status: 500 });
  }

  if (!(await pathExists(modelPaths.modelPath))) {
    return Response.json(
      {
        error: `KMeans model artifact missing at ${modelPaths.modelPath}. Train/export the model before grouping.`,
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
    const groupingResponse = await runGrouping(
      pythonBinary,
      modelPaths.scriptPath,
      modelPaths.modelPath,
      payload
    );
    return Response.json(groupingResponse, { status: 200 });
  } catch (groupingError) {
    const message = groupingError instanceof Error ? groupingError.message : "Grouping failed with an unknown error.";
    return Response.json(
      {
        error: `Failed to run KMeans grouping: ${message}`,
      },
      { status: 500 }
    );
  }
}
