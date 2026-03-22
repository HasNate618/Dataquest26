#!/usr/bin/env python3
"""Predict gamer persona cluster from raw profile fields using only k_cluster.pkl.

This script does not load training data or fit any preprocessing objects.
It converts raw frontend payload into a deterministic numeric feature vector
that matches the saved KMeans model dimensionality, then predicts cluster.
"""

from __future__ import annotations

import argparse
import json
import pickle
from pathlib import Path
from typing import Any

import numpy as np


DEFAULT_MODEL_PATH = Path("train/artifacts/gamer_personas_kmeans.pkl")

RAW_NUMERIC_FIELDS = {
    "age": (10.0, 80.0),
    "years_gaming": (0.0, 70.0),
    "daily_gaming_hours": (0.0, 24.0),
    "monthly_game_spending_usd": (0.0, 2000.0),
    "exercise_hours_weekly": (0.0, 40.0),
}
RAW_STRING_FIELDS = ["gender", "game_genre", "primary_game", "gaming_platform"]

PERSONA_BY_CLUSTER = {
    0: "The Multi-Platform RPG Explorer",
    1: "The Console Battle Royale Fan",
    2: "The Mobile Shooter",
    3: "The Crossover Mobile Gamer",
    4: "The PC Strategist",
    5: "The Addicted Escapist",
    6: "The Mobile MMO Adventurer",
    7: "The Mobile MOBA Grinder",
}


def _is_finite_number(value: Any) -> bool:
    return isinstance(value, (int, float)) and np.isfinite(float(value))


def _read_raw_payload(payload_arg: str | None, payload_path: str | None) -> dict[str, Any]:
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


def _validate_raw_payload(payload: dict[str, Any]) -> dict[str, Any]:
    missing_numeric = [field for field in RAW_NUMERIC_FIELDS if field not in payload]
    missing_string = [field for field in RAW_STRING_FIELDS if field not in payload]
    missing = missing_numeric + missing_string
    if missing:
        raise ValueError(f"Missing required fields: {missing}")

    out: dict[str, Any] = {}
    for field, (lower, upper) in RAW_NUMERIC_FIELDS.items():
        value = payload[field]
        if not _is_finite_number(value):
            raise ValueError(f'Field "{field}" must be a finite number.')
        num = float(value)
        if num < lower or num > upper:
            raise ValueError(f'Field "{field}" must be between {lower:g} and {upper:g}.')
        out[field] = num

    for field in RAW_STRING_FIELDS:
        value = payload[field]
        if not isinstance(value, str):
            raise ValueError(f'Field "{field}" must be a string.')
        normalized = value.strip()
        if not normalized:
            raise ValueError(f'Field "{field}" cannot be empty.')
        out[field] = normalized

    return out


def _hash01(text: str) -> float:
    return (sum(ord(c) for c in text) % 1000) / 1000.0


def _encode_feature_vector(payload: dict[str, Any], expected_features: int) -> np.ndarray:
    # Non-input features are zero-filled by default.
    vec = np.zeros(expected_features, dtype=float)

    gender_map = {"male": 1.0, "female": -1.0, "other": 0.0}
    genre_map = {
        "fps": 0.15,
        "moba": 0.30,
        "rpg": 0.45,
        "strategy": 0.60,
        "battle royale": 0.75,
        "mmo": 0.90,
        "mobile games": 1.0,
    }
    platform_map = {
        "pc": 0.25,
        "console": 0.5,
        "mobile": 0.75,
        "multi-platform": 1.0,
    }

    age = float(payload["age"])
    years = float(payload["years_gaming"])
    hrs = float(payload["daily_gaming_hours"])
    spend = float(payload["monthly_game_spending_usd"])
    ex = float(payload["exercise_hours_weekly"])
    gender = str(payload["gender"]).strip().lower()
    genre = str(payload["game_genre"]).strip().lower()
    game = str(payload["primary_game"]).strip().lower()
    platform = str(payload["gaming_platform"]).strip().lower()

    seeded = [
        hrs / 24.0,
        years / 70.0,
        spend / 2000.0,
        ex / 40.0,
        age / 80.0,
        gender_map.get(gender, 0.0),
        genre_map.get(genre, _hash01(genre)),
        platform_map.get(platform, _hash01(platform)),
        _hash01(game),
        (hrs / 24.0) * (spend / 2000.0),
        (hrs / 24.0) - (ex / 40.0),
        _hash01(f"{genre}|{platform}"),
        1.0,
        0.0,
    ]

    for idx, value in enumerate(seeded[:expected_features]):
        vec[idx] = float(value)

    return vec.reshape(1, -1)


def predict_cluster(model_path: Path, raw_payload: dict[str, Any]) -> dict[str, Any]:
    if not model_path.exists():
        raise FileNotFoundError(f"Model file not found: {model_path}")

    with model_path.open("rb") as f:
        bundle = pickle.load(f)
    
    # Extract components from bundle
    if isinstance(bundle, dict):
        # New bundle format (dictionary with models + metadata)
        kmeans = bundle.get('kmeans')
        pca = bundle.get('pca')
        scaler = bundle.get('scaler')
        vfilter = bundle.get('vfilter')
        imputer = bundle.get('imputer')
        encoder = bundle.get('encoder')
        numeric_cols = bundle.get('numeric_cols', [])
        ordinal_cols = bundle.get('ordinal_cols', {})
        boolean_cols = bundle.get('boolean_cols', [])
        nominal_cols = bundle.get('nominal_cols', [])
        
        if not all([kmeans, pca, scaler, vfilter]):
            raise ValueError("Model bundle missing required components")
        use_preprocessing = True
    else:
        # Old format (direct KMeans model)
        kmeans = bundle
        use_preprocessing = False

    validated_payload = _validate_raw_payload(raw_payload)
    expected = int(getattr(kmeans, "n_clusters", 8) or 8)
    
    # Use full preprocessing pipeline with the model's preprocessors
    if use_preprocessing:
        import pandas as pd
        
        # Create DataFrame with all expected columns, filling missing with defaults
        data = {}
        for col in numeric_cols:
            data[col] = validated_payload.get(col, 0.0)
        for col in ordinal_cols.keys():
            data[col] = validated_payload.get(col, ordinal_cols[col][0])  # use first category
        for col in boolean_cols:
            data[col] = validated_payload.get(col, False)
        for col in nominal_cols:
            data[col] = validated_payload.get(col, 'FPS')  # default game genre
        
        X = pd.DataFrame([data])
        
        # Apply imputation to numeric columns
        X[numeric_cols] = imputer.transform(X[numeric_cols])
        
        # Apply ordinal encoding to ordinal columns
        for col, categories in ordinal_cols.items():
            X[col] = pd.Categorical(X[col], categories=categories).codes
        
        # Convert boolean columns
        X[boolean_cols] = X[boolean_cols].astype(int)
        
        # Apply one-hot encoding to nominal columns
        X_ohe = encoder.transform(X[nominal_cols])
        ohe_cols = encoder.get_feature_names_out(nominal_cols)
        X = pd.concat([X.drop(columns=nominal_cols), pd.DataFrame(X_ohe, columns=ohe_cols)], axis=1)
        
        # Apply variance filter, scaler, PCA
        X_filtered = vfilter.transform(X)
        X_scaled = scaler.transform(X_filtered)
        X_pca = pca.transform(X_scaled)
        pred = kmeans.predict(X_pca)
    else:
        # Fallback to old simple encoding
        X = _encode_feature_vector(validated_payload, expected)
        pred = kmeans.predict(X)
    
    if len(pred) != 1:
        raise RuntimeError("Unexpected prediction shape from model.")

    cluster_id = int(pred[0])
    group_name = PERSONA_BY_CLUSTER.get(cluster_id, f"Cluster {cluster_id}")

    return {
        "cluster": cluster_id,
        "group_name": group_name,
        "available_groups": [
            {"cluster": cid, "group_name": name}
            for cid, name in sorted(PERSONA_BY_CLUSTER.items())
        ],
        "n_features": expected,
        "input_fields_used": sorted(list(validated_payload.keys())),
    }


def main() -> None:
    parser = argparse.ArgumentParser(
        description="Predict gamer cluster label from raw profile fields using model/k_cluster.pkl"
    )
    parser.add_argument(
        "--model",
        type=Path,
        default=DEFAULT_MODEL_PATH,
        help=f"Path to .pkl model (default: {DEFAULT_MODEL_PATH})",
    )
    parser.add_argument("--payload", type=str, default=None, help="JSON object for raw profile fields")
    parser.add_argument("--payload-file", type=str, default=None, help="Path to JSON payload file")
    args = parser.parse_args()

    raw_payload = _read_raw_payload(args.payload, args.payload_file)
    result = predict_cluster(args.model, raw_payload)
    print(json.dumps(result))


if __name__ == "__main__":
    main()
