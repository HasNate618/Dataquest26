#!/usr/bin/env python3
"""Train and serialize grouped cause->issue wellbeing models.

Outputs:
- train/artifacts/grouped_wellbeing_model.pkl
- train/artifacts/grouped_wellbeing_metrics.json

Uses the same core assumptions as the executed notebook, including:
- cause-core feature taxonomy
- non-circular issue target definitions
- per-issue leakage guards
"""

from __future__ import annotations

import json
import pickle
from pathlib import Path
from typing import Dict, List

import numpy as np
import pandas as pd
from sklearn.base import clone
from sklearn.compose import ColumnTransformer
from sklearn.ensemble import GradientBoostingClassifier, RandomForestClassifier
from sklearn.impute import SimpleImputer
from sklearn.inspection import permutation_importance
from sklearn.linear_model import LogisticRegression
from sklearn.metrics import accuracy_score, f1_score, precision_score, recall_score, roc_auc_score
from sklearn.model_selection import train_test_split
from sklearn.pipeline import Pipeline
from sklearn.preprocessing import OneHotEncoder, StandardScaler


RANDOM_SEED = 42
DATA_FILENAME = "Gaming and Mental Health.csv"
ARTIFACT_DIR = Path(__file__).resolve().parent / "artifacts"
ARTIFACT_MODEL = ARTIFACT_DIR / "grouped_wellbeing_model.pkl"
ARTIFACT_METRICS = ARTIFACT_DIR / "grouped_wellbeing_metrics.json"
ISSUE_RELIABILITY_ROC_THRESHOLD = 0.65


def find_data_path() -> Path:
    here = Path(__file__).resolve()
    candidates = [
        here.parent.parent / "data" / DATA_FILENAME,
        Path.cwd() / "data" / DATA_FILENAME,
        Path.cwd().parent / "data" / DATA_FILENAME,
    ]
    for p in candidates:
        if p.exists():
            return p
    raise FileNotFoundError(f"Could not locate dataset '{DATA_FILENAME}'")


def clean_data(raw_df: pd.DataFrame) -> pd.DataFrame:
    df = raw_df.copy()

    for c in df.select_dtypes(include=["object", "string"]).columns:
        df[c] = df[c].astype("string").str.strip()
        df[c] = df[c].replace({"": pd.NA, "nan": pd.NA, "None": pd.NA, "NA": pd.NA})

    if "record_id" in df.columns:
        df = df.drop_duplicates(subset=["record_id"], keep="first").reset_index(drop=True)

    numeric_cols = [
        "age",
        "daily_gaming_hours",
        "sleep_hours",
        "grades_gpa",
        "work_productivity_score",
        "weight_change_kg",
        "exercise_hours_weekly",
        "social_isolation_score",
        "face_to_face_social_hours_weekly",
        "monthly_game_spending_usd",
        "years_gaming",
    ]

    for c in numeric_cols:
        df[c] = pd.to_numeric(df[c], errors="coerce")

    valid_ranges = {
        "age": (10, 80),
        "daily_gaming_hours": (0, 24),
        "sleep_hours": (0, 24),
        "grades_gpa": (0, 4.3),
        "work_productivity_score": (1, 10),
        "weight_change_kg": (-30, 30),
        "exercise_hours_weekly": (0, 40),
        "social_isolation_score": (1, 10),
        "face_to_face_social_hours_weekly": (0, 80),
        "monthly_game_spending_usd": (0, 2000),
        "years_gaming": (0, 70),
    }

    for c, (lo, hi) in valid_ranges.items():
        df[c] = df[c].clip(lower=lo, upper=hi)

    for c in numeric_cols:
        if df[c].isna().any():
            df[c] = df[c].fillna(df[c].median())

    cat_cols = [c for c in df.columns if c not in numeric_cols]
    for c in cat_cols:
        if df[c].isna().any():
            df[c] = df[c].fillna(df[c].mode().iloc[0])

    return df


def add_targets_and_taxonomy(df: pd.DataFrame):
    actionable_cause_features = [
        "daily_gaming_hours",
        "monthly_game_spending_usd",
        "exercise_hours_weekly",
        "game_genre",
        "primary_game",
        "gaming_platform",
    ]
    context_confounders = ["age", "gender", "years_gaming"]
    mediator_features = [
        "sleep_hours",
        "sleep_quality",
        "sleep_disruption_frequency",
        "mood_state",
        "mood_swing_frequency",
        "social_isolation_score",
        "face_to_face_social_hours_weekly",
        "academic_work_performance",
        "work_productivity_score",
    ]

    feature_cols = actionable_cause_features + context_confounders

    negative_moods = {"Depressed", "Anxious", "Withdrawn"}
    poor_sleep_levels = {"Very Poor", "Insomnia"}
    poor_perf_levels = {"Poor", "Failing"}

    df["adverse_mood"] = df["mood_state"].isin(negative_moods).astype(int)
    df["adverse_sleep"] = df["sleep_quality"].isin(poor_sleep_levels).astype(int)
    df["high_isolation"] = (df["social_isolation_score"] >= 7).astype(int)
    df["low_social_contact"] = (df["face_to_face_social_hours_weekly"] <= 3).astype(int)
    df["poor_performance"] = df["academic_work_performance"].isin(poor_perf_levels).astype(int)

    df["wellbeing_problem_score"] = (
        df["adverse_mood"]
        + df["adverse_sleep"]
        + df["high_isolation"]
        + df["low_social_contact"]
        + df["poor_performance"]
    )
    df["wellbeing_problem"] = (df["wellbeing_problem_score"] >= 2).astype(int)

    issue_target_specs = {
        "social_isolation_problem": {
            "definition_cols": ["social_isolation_score", "face_to_face_social_hours_weekly"],
            "target": (
                (df["social_isolation_score"] >= 7)
                | (df["face_to_face_social_hours_weekly"] <= 5)
            ).astype(int),
        },
        "productivity_problem": {
            "definition_cols": ["academic_work_performance", "work_productivity_score"],
            "target": (
                (df["academic_work_performance"].isin(["Poor", "Failing"]))
                | (df["work_productivity_score"] <= 4)
            ).astype(int),
        },
        "sleep_problem": {
            "definition_cols": ["sleep_quality", "sleep_disruption_frequency"],
            "target": (
                (df["sleep_quality"].isin(["Poor", "Very Poor", "Insomnia"]))
                | (df["sleep_disruption_frequency"].isin(["Often", "Always"]))
            ).astype(int),
        },
        "emotional_problem": {
            "definition_cols": ["mood_state"],
            "target": df["mood_state"].isin(["Depressed", "Anxious", "Withdrawn"]).astype(int),
        },
        "dysregulation_problem": {
            "definition_cols": ["mood_swing_frequency", "continued_despite_problems"],
            "target": (
                (df["mood_swing_frequency"].isin(["Often", "Daily"]))
                | (df["continued_despite_problems"] == True)
            ).astype(int),
        },
    }

    issue_targets = pd.DataFrame({k: v["target"] for k, v in issue_target_specs.items()})

    feature_taxonomy = {
        "actionable_cause_features": actionable_cause_features,
        "context_confounders": context_confounders,
        "mediator_features": mediator_features,
        "feature_cols": feature_cols,
    }

    cause_group_map = {
        "daily_gaming_hours": "gaming_load",
        "monthly_game_spending_usd": "gaming_spend",
        "exercise_hours_weekly": "health_habits",
        "game_genre": "game_context",
        "primary_game": "game_context",
        "gaming_platform": "game_context",
        "age": "context",
        "gender": "context",
        "years_gaming": "context",
        "sleep_hours": "sleep_process",
        "sleep_quality": "sleep_process",
        "sleep_disruption_frequency": "sleep_process",
        "mood_state": "emotion_process",
        "mood_swing_frequency": "emotion_process",
        "social_isolation_score": "social_process",
        "face_to_face_social_hours_weekly": "social_process",
        "academic_work_performance": "productivity_process",
        "work_productivity_score": "productivity_process",
    }

    return df, issue_targets, issue_target_specs, feature_taxonomy, cause_group_map


def make_preprocessor(X: pd.DataFrame) -> ColumnTransformer:
    num_features = X.select_dtypes(include=["number"]).columns.tolist()
    cat_features = [c for c in X.columns if c not in num_features]

    return ColumnTransformer(
        transformers=[
            (
                "num",
                Pipeline(steps=[("imputer", SimpleImputer(strategy="median")), ("scaler", StandardScaler())]),
                num_features,
            ),
            (
                "cat",
                Pipeline(
                    steps=[
                        ("imputer", SimpleImputer(strategy="most_frequent")),
                        ("onehot", OneHotEncoder(handle_unknown="ignore")),
                    ]
                ),
                cat_features,
            ),
        ]
    )


def train_overall(df: pd.DataFrame, feature_cols: List[str]):
    X = df[feature_cols].copy()
    y = df["wellbeing_problem"].copy()
    X_train, X_test, y_train, y_test = train_test_split(
        X, y, test_size=0.25, random_state=RANDOM_SEED, stratify=y
    )

    preprocess = make_preprocessor(X)
    models = {
        "LogisticRegression": LogisticRegression(max_iter=2500, class_weight="balanced", random_state=RANDOM_SEED),
        "RandomForest": RandomForestClassifier(
            n_estimators=500,
            min_samples_leaf=2,
            class_weight="balanced",
            random_state=RANDOM_SEED,
            n_jobs=-1,
        ),
        "GradientBoosting": GradientBoostingClassifier(random_state=RANDOM_SEED),
    }

    best_name = None
    best_pipe = None
    best_score = (-1.0, -1.0)
    best_metrics = None

    for model_name, model in models.items():
        pipe = Pipeline(steps=[("preprocess", clone(preprocess)), ("model", clone(model))])
        pipe.fit(X_train, y_train)
        pred = pipe.predict(X_test)
        proba = pipe.predict_proba(X_test)[:, 1]

        row = {
            "model": model_name,
            "accuracy": accuracy_score(y_test, pred),
            "precision": precision_score(y_test, pred, zero_division=0),
            "recall": recall_score(y_test, pred, zero_division=0),
            "f1": f1_score(y_test, pred, zero_division=0),
            "roc_auc": roc_auc_score(y_test, proba),
        }
        score = (row["f1"], row["roc_auc"])
        if score > best_score:
            best_score = score
            best_name = model_name
            best_pipe = pipe
            best_metrics = row

    perm = permutation_importance(
        best_pipe, X_test, y_test, n_repeats=10, random_state=RANDOM_SEED, scoring="f1", n_jobs=-1
    )
    perm_df = (
        pd.DataFrame({"feature": X_test.columns, "importance": perm.importances_mean})
        .sort_values("importance", ascending=False)
        .reset_index(drop=True)
    )

    return best_name, best_pipe, best_metrics, perm_df


def train_issue_models(
    df: pd.DataFrame,
    issue_targets: pd.DataFrame,
    issue_target_specs: Dict,
    feature_taxonomy: Dict[str, List[str]],
):
    issue_model_candidates = {
        "LogisticRegression": LogisticRegression(max_iter=2500, class_weight="balanced", random_state=RANDOM_SEED),
        "RandomForest": RandomForestClassifier(
            n_estimators=450,
            min_samples_leaf=2,
            class_weight="balanced",
            random_state=RANDOM_SEED,
            n_jobs=-1,
        ),
        "GradientBoosting": GradientBoostingClassifier(random_state=RANDOM_SEED),
    }

    issue_track_feature_sets = {
        "cause_core": feature_taxonomy["feature_cols"],
        "augmented": feature_taxonomy["feature_cols"] + feature_taxonomy["mediator_features"],
    }

    issue_feature_sets: Dict[str, Dict[str, List[str]]] = {}
    issue_best_models: Dict[str, Pipeline] = {}
    issue_model_rows = []

    for issue_name, spec in issue_target_specs.items():
        def_cols = set(spec["definition_cols"])
        issue_feature_sets[issue_name] = {}
        for track_name, base_feats in issue_track_feature_sets.items():
            issue_feature_sets[issue_name][track_name] = [f for f in base_feats if f not in def_cols]

    for issue_name in issue_targets.columns:
        y_issue = issue_targets[issue_name].astype(int)
        if y_issue.nunique() < 2:
            continue

        for track_name, feats in issue_feature_sets[issue_name].items():
            X_issue = df[feats].copy()
            X_train, X_test, y_train, y_test = train_test_split(
                X_issue, y_issue, test_size=0.25, random_state=RANDOM_SEED, stratify=y_issue
            )

            preprocess = make_preprocessor(X_issue)
            best_pipe = None
            best_name = None
            best_score = (-1.0, -1.0)
            best_row = None

            for model_name, model_obj in issue_model_candidates.items():
                pipe = Pipeline(steps=[("preprocess", clone(preprocess)), ("model", clone(model_obj))])
                pipe.fit(X_train, y_train)
                pred = pipe.predict(X_test)
                proba = pipe.predict_proba(X_test)[:, 1]

                row = {
                    "issue": issue_name,
                    "track": track_name,
                    "model": model_name,
                    "n_features": len(feats),
                    "accuracy": accuracy_score(y_test, pred),
                    "precision": precision_score(y_test, pred, zero_division=0),
                    "recall": recall_score(y_test, pred, zero_division=0),
                    "f1": f1_score(y_test, pred, zero_division=0),
                    "roc_auc": roc_auc_score(y_test, proba),
                    "positive_rate": float(y_issue.mean()),
                }
                issue_model_rows.append(row)

                score = (row["f1"], row["roc_auc"])
                if score > best_score:
                    best_score = score
                    best_name = model_name
                    best_pipe = pipe
                    best_row = row

            if track_name == "cause_core":
                issue_best_models[issue_name] = best_pipe

            # overwrite best row marker for this issue/track by adding explicit marker field
            best_row = dict(best_row)
            best_row["is_best_for_issue_track"] = True
            best_row["best_model"] = best_name

    issue_results_df = pd.DataFrame(issue_model_rows)
    issue_best_df = (
        issue_results_df.sort_values(["issue", "track", "f1", "roc_auc"], ascending=[True, True, False, False])
        .groupby(["issue", "track"], as_index=False)
        .first()
    )

    issue_best_df["reliability_flag"] = np.where(
        issue_best_df["roc_auc"] >= ISSUE_RELIABILITY_ROC_THRESHOLD,
        "reliable",
        "weak",
    )

    return issue_best_models, issue_feature_sets, issue_results_df, issue_best_df


def main() -> None:
    data_path = find_data_path()
    raw_df = pd.read_csv(data_path)
    df = clean_data(raw_df)

    df, issue_targets, issue_target_specs, feature_taxonomy, cause_group_map = add_targets_and_taxonomy(df)

    best_name, best_pipe, best_metrics, perm_df = train_overall(df, feature_taxonomy["feature_cols"])

    issue_models, issue_feature_sets, issue_results_df, issue_best_df = train_issue_models(
        df,
        issue_targets,
        issue_target_specs,
        feature_taxonomy,
    )

    bundle = {
        "overall_model": best_pipe,
        "issue_models": issue_models,
        "issue_feature_sets": {k: v["cause_core"] for k, v in issue_feature_sets.items()},
        "feature_taxonomy": feature_taxonomy,
        "cause_group_map": cause_group_map,
    }

    ARTIFACT_DIR.mkdir(parents=True, exist_ok=True)
    with ARTIFACT_MODEL.open("wb") as f:
        pickle.dump(bundle, f)

    metrics_payload = {
        "data_path": str(data_path),
        "rows": int(len(df)),
        "best_overall_model": best_name,
        "best_overall_metrics": {k: float(v) for k, v in best_metrics.items() if k != "model"},
        "top_overall_features": perm_df.head(5).to_dict(orient="records"),
        "issue_best_models": issue_best_df[["issue", "track", "model", "f1", "roc_auc", "reliability_flag"]].to_dict(
            orient="records"
        ),
    }

    with ARTIFACT_METRICS.open("w", encoding="utf-8") as f:
        json.dump(metrics_payload, f, indent=2)

    print("Saved model bundle:", ARTIFACT_MODEL)
    print("Saved metrics:", ARTIFACT_METRICS)
    print("Best overall model:", best_name)
    print("Overall metrics:", {k: round(v, 4) for k, v in metrics_payload["best_overall_metrics"].items()})


if __name__ == "__main__":
    main()
