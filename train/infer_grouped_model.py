#!/usr/bin/env python3
"""Run inference against grouped wellbeing model bundle.

Usage:
  python train/infer_grouped_model.py --artifact train/artifacts/grouped_wellbeing_model.pkl --payload '{"age": 25, ...}'
"""

from __future__ import annotations

import argparse
import json
import pickle
from pathlib import Path
from typing import Any

import numpy as np
import pandas as pd


DEFAULT_ARTIFACT = Path(__file__).resolve().parent / "artifacts" / "grouped_wellbeing_model.pkl"
NUMERIC_RANGES = {
    "age": (10.0, 80.0),
    "daily_gaming_hours": (0.0, 24.0),
    "monthly_game_spending_usd": (0.0, 2000.0),
    "exercise_hours_weekly": (0.0, 40.0),
    "years_gaming": (0.0, 70.0),
}


def _is_finite_number(value: Any) -> bool:
    return isinstance(value, (int, float)) and np.isfinite(float(value))


def _read_json_payload(payload_arg: str | None, payload_path: str | None) -> dict[str, Any]:
    if payload_arg is not None:
        try:
            parsed = json.loads(payload_arg)
        except json.JSONDecodeError as exc:
            raise ValueError(f"Invalid JSON in --payload: {exc}") from exc
    elif payload_path is not None:
        payload_file = Path(payload_path)
        if not payload_file.exists():
            raise FileNotFoundError(f"Payload file not found: {payload_file}")
        try:
            parsed = json.loads(payload_file.read_text(encoding="utf-8"))
        except json.JSONDecodeError as exc:
            raise ValueError(f"Invalid JSON in --payload-file: {exc}") from exc
    else:
        raise ValueError("Provide either --payload or --payload-file.")

    if not isinstance(parsed, dict):
        raise ValueError("Payload must be a JSON object.")
    return parsed


def _validate_payload(payload: dict[str, Any], feature_order: list[str]) -> dict[str, Any]:
    missing = [field for field in feature_order if field not in payload]
    if missing:
        raise ValueError(f"Missing required fields: {missing}")

    profile: dict[str, Any] = {}
    for field in feature_order:
        value = payload[field]
        if field in NUMERIC_RANGES:
            if not _is_finite_number(value):
                raise ValueError(f'Field "{field}" must be a finite number.')
            numeric_value = float(value)
            lower, upper = NUMERIC_RANGES[field]
            if numeric_value < lower or numeric_value > upper:
                raise ValueError(f'Field "{field}" must be between {lower:g} and {upper:g}.')
            profile[field] = numeric_value
        else:
            if not isinstance(value, str):
                raise ValueError(f'Field "{field}" must be a string.')
            normalized = value.strip()
            if not normalized:
                raise ValueError(f'Field "{field}" cannot be empty.')
            profile[field] = normalized

    return profile


def _probability_label(probability: float) -> str:
    if probability >= 0.75:
        return "High"
    if probability >= 0.5:
        return "Moderate"
    if probability >= 0.25:
        return "Mild"
    return "Low"


def run_inference(artifact_path: Path, payload: dict[str, Any]) -> dict[str, Any]:
    if not artifact_path.exists():
        raise FileNotFoundError(f"Model artifact not found: {artifact_path}")

    with artifact_path.open("rb") as f:
        bundle = pickle.load(f)

    feature_order = bundle["feature_taxonomy"]["feature_cols"]
    profile = _validate_payload(payload, feature_order)
    one_row = pd.DataFrame([profile], columns=feature_order)

    overall_model = bundle["overall_model"]
    overall_probability = float(overall_model.predict_proba(one_row)[:, 1][0])
    overall_percent = round(overall_probability * 100, 1)

    issues = []
    for issue_name, issue_model in bundle["issue_models"].items():
        issue_features = bundle["issue_feature_sets"][issue_name]
        issue_row = one_row[issue_features]
        issue_probability = float(issue_model.predict_proba(issue_row)[:, 1][0])
        issues.append(
            {
                "issue": issue_name,
                "probability": round(issue_probability, 6),
                "percent": round(issue_probability * 100, 1),
                "label": _probability_label(issue_probability),
            }
        )

    issues_sorted = sorted(issues, key=lambda item: item["probability"], reverse=True)
    top_issue = issues_sorted[0] if issues_sorted else None

    return {
        "model": type(overall_model.named_steps["model"]).__name__,
        "feature_order": feature_order,
        "overall": {
            "probability": round(overall_probability, 6),
            "percent": overall_percent,
            "label": _probability_label(overall_probability),
        },
        "issues": issues_sorted,
        "top_issue": top_issue,
        "input_profile": profile,
    }


def main() -> None:
    parser = argparse.ArgumentParser(description="Run grouped wellbeing model inference.")
    parser.add_argument("--artifact", default=str(DEFAULT_ARTIFACT), help="Path to grouped_wellbeing_model.pkl")
    parser.add_argument("--payload", help="JSON payload string with required input features")
    parser.add_argument("--payload-file", help="Path to JSON payload file")
    args = parser.parse_args()

    artifact_path = Path(args.artifact)
    payload = _read_json_payload(args.payload, args.payload_file)
    result = run_inference(artifact_path, payload)
    print(json.dumps(result))


if __name__ == "__main__":
    main()
