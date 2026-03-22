import json
import pickle
from pathlib import Path

import joblib
import matplotlib.pyplot as plt
import pandas as pd
from sklearn.base import clone
from sklearn.compose import ColumnTransformer
from sklearn.ensemble import RandomForestClassifier
from sklearn.impute import SimpleImputer
from sklearn.metrics import (
    accuracy_score,
    classification_report,
    confusion_matrix,
    f1_score,
)
from sklearn.model_selection import train_test_split
from sklearn.pipeline import Pipeline
from sklearn.preprocessing import (
    LabelEncoder,
    OneHotEncoder,
    OrdinalEncoder,
    StandardScaler,
)
from xgboost import XGBClassifier

DATA_PATH = Path("data/Gaming and Mental Health.csv")
TARGET = "mood_group"
OUTPUT_PATH = Path("model.joblib")
OUTPUT_PATH_PKL = Path("model.pkl")
XGB_OUTPUT_PATH = Path("model_xgb.joblib")
XGB_OUTPUT_PATH_PKL = Path("model_xgb.pkl")
PLOTS_DIR = Path("plots")
TEST_SIZE = 0.2
RANDOM_STATE = 42

NOMINAL_CATEGORICAL_FEATURES = [
    "gender",
    "game_genre",
    "gaming_platform",
]

ORDINAL_OR_BINARY_CATEGORICAL_FEATURES = [
    "withdrawal_symptoms",
    "loss_of_other_interests",
    "continued_despite_problems",
    "eye_strain",
    "back_neck_pain",
    "sleep_quality",
    "sleep_disruption_frequency",
    "academic_work_performance",
    "mood_swing_frequency",
]

ORDINAL_CATEGORY_MAP = {
    "sleep_quality": ["Very Poor", "Poor", "Fair", "Good", "Insomnia"],
    "sleep_disruption_frequency": ["Never", "Rarely", "Sometimes", "Often", "Always"],
    "academic_work_performance": [
        "Failing",
        "Poor",
        "Below Average",
        "Average",
        "Good",
        "Excellent",
    ],
    "mood_swing_frequency": ["Never", "Rarely", "Sometimes", "Often", "Daily"],
}

MOOD_GROUP_MAP = {
    "Anxious": "Anxious",
    "Restless": "Anxious",
    "Depressed": "Negative",
    "Angry": "Negative",
    "Withdrawn": "Negative",
    "Irritable": "Negative",
    "Normal": "Neutral",
    "Excited": "Positive",
    "Euphoric": "Positive",
}


def clean_data(df: pd.DataFrame) -> pd.DataFrame:
    cleaned = df.copy()
    drop_cols = [
        col
        for col in [
            "record_id",
            "primary_game",
            "gaming_addiction_risk_level",
            "gender",
            "gaming_platform",
            "eye_strain",
            "back_neck_pain",
            "mood_swing_frequency",
            "monthly_game_spending_usd",
            "social_isolation_score",
        ]
        if col in cleaned.columns
    ]
    if drop_cols:
        cleaned = cleaned.drop(columns=drop_cols)
    return cleaned


def engineer_features(df: pd.DataFrame) -> pd.DataFrame:
    featured = df.copy()
    if "mood_state" not in featured.columns:
        raise ValueError("Source column not found for grouping: mood_state")

    featured[TARGET] = featured["mood_state"].map(MOOD_GROUP_MAP)
    unknown = featured[featured[TARGET].isna()]["mood_state"].dropna().unique().tolist()
    if unknown:
        raise ValueError(f"Unmapped mood_state values found: {unknown}")

    return featured


def build_preprocessor(
    numeric_features: list[str],
    nominal_categorical_features: list[str],
    ordinal_features: list[str],
) -> ColumnTransformer:
    numeric_transformer = Pipeline(
        steps=[
            ("imputer", SimpleImputer(strategy="median")),
            ("scaler", StandardScaler()),
        ]
    )
    nominal_categorical_transformer = Pipeline(
        steps=[
            ("imputer", SimpleImputer(strategy="most_frequent")),
            ("onehot", OneHotEncoder(handle_unknown="ignore")),
        ]
    )
    ordinal_categories = [ORDINAL_CATEGORY_MAP[col] for col in ordinal_features]
    ordinal_transformer = Pipeline(
        steps=[
            ("imputer", SimpleImputer(strategy="most_frequent")),
            (
                "ordinal",
                OrdinalEncoder(
                    categories=ordinal_categories,
                    handle_unknown="use_encoded_value",
                    unknown_value=-1,
                ),
            ),
        ]
    )
    return ColumnTransformer(
        transformers=[
            ("num", numeric_transformer, numeric_features),
            (
                "nominal_cat",
                nominal_categorical_transformer,
                nominal_categorical_features,
            ),
            ("ordinal_cat", ordinal_transformer, ordinal_features),
        ]
    )


def evaluate(
    name: str, model: Pipeline, X_test: pd.DataFrame, y_test: pd.Series
) -> dict:
    preds = model.predict(X_test)
    metrics = {
        "model": name,
        "accuracy": accuracy_score(y_test, preds),
        "macro_f1": f1_score(y_test, preds, average="macro"),
        "confusion_matrix": confusion_matrix(y_test, preds).tolist(),
        "classification_report": classification_report(y_test, preds, output_dict=True),
    }
    return metrics


def evaluate_preds(name: str, y_true: pd.Series, preds) -> dict:
    metrics = {
        "model": name,
        "accuracy": accuracy_score(y_true, preds),
        "macro_f1": f1_score(y_true, preds, average="macro"),
        "confusion_matrix": confusion_matrix(y_true, preds).tolist(),
        "classification_report": classification_report(y_true, preds, output_dict=True),
    }
    return metrics


def save_plots(
    model: Pipeline, X_test: pd.DataFrame, y_test: pd.Series, keep_open: bool = True
) -> None:
    PLOTS_DIR.mkdir(exist_ok=True)
    preds = model.predict(X_test)

    # 1) Mood state distribution in test set
    fig, ax = plt.subplots(figsize=(8, 6))
    y_test.value_counts().sort_values(ascending=True).plot(kind="barh", ax=ax)
    ax.set_title("Mood State Distribution (Test Set)")
    ax.set_xlabel("Count")
    ax.set_ylabel("Mood State")
    fig.tight_layout()
    fig.savefig(PLOTS_DIR / "mood_state_distribution.png", dpi=150)

    # 2) Confusion matrix heatmap
    labels = sorted(y_test.unique().tolist())
    cm = confusion_matrix(y_test, preds, labels=labels)
    fig, ax = plt.subplots(figsize=(9, 7))
    image = ax.imshow(cm, cmap="Blues")
    ax.set_xticks(range(len(labels)))
    ax.set_yticks(range(len(labels)))
    ax.set_xticklabels(labels, rotation=45, ha="right")
    ax.set_yticklabels(labels)
    ax.set_xlabel("Predicted label")
    ax.set_ylabel("True label")
    ax.set_title("Confusion Matrix")
    plt.colorbar(image, ax=ax, label="Count")
    fig.tight_layout()
    fig.savefig(PLOTS_DIR / "confusion_matrix.png", dpi=150)

    # 3) Top feature importances
    preprocessor = model.named_steps["preprocessor"]
    estimator = model.named_steps["model"]
    feature_names = preprocessor.get_feature_names_out()
    importances = pd.Series(estimator.feature_importances_, index=feature_names)
    top_importances = importances.sort_values(ascending=False).head(20).sort_values()
    fig, ax = plt.subplots(figsize=(10, 8))
    ax.barh(top_importances.index, top_importances.values)
    ax.set_title("Top 20 Feature Importances")
    ax.set_xlabel("Importance")
    fig.tight_layout()
    fig.savefig(PLOTS_DIR / "feature_importance_top20.png", dpi=150)

    if keep_open:
        plt.show(block=True)
    else:
        plt.close("all")


def main() -> None:
    if not DATA_PATH.exists():
        raise FileNotFoundError(f"Dataset not found: {DATA_PATH}")

    print(f"Loading: {DATA_PATH}")
    df = pd.read_csv(DATA_PATH)
    df = clean_data(df)
    df = engineer_features(df)

    if TARGET not in df.columns:
        raise ValueError(f"Target column not found: {TARGET}")

    y = df[TARGET]
    X = df.drop(columns=[TARGET, "mood_state"])

    X_train, X_test, y_train, y_test = train_test_split(
        X, y, test_size=TEST_SIZE, random_state=RANDOM_STATE, stratify=y
    )

    nominal_features = [c for c in NOMINAL_CATEGORICAL_FEATURES if c in X.columns]
    ordinal_features = [c for c in ORDINAL_CATEGORY_MAP.keys() if c in X.columns]
    boolean_features = [
        c
        for c in ORDINAL_OR_BINARY_CATEGORICAL_FEATURES
        if c in X.columns and c not in ordinal_features
    ]
    X_train[boolean_features] = X_train[boolean_features].astype(int)
    X_test[boolean_features] = X_test[boolean_features].astype(int)
    categorical_features = nominal_features + ordinal_features
    numerical_features = [
        c for c in X.columns if c not in (categorical_features + boolean_features)
    ] + boolean_features
    print(
        f"NOMINAL CAT : {nominal_features} ORDINAL CAT : {ordinal_features} NUM : {numerical_features}"
    )

    preprocessor = build_preprocessor(
        numerical_features, nominal_features, ordinal_features
    )
    rf_clf = RandomForestClassifier(
        n_estimators=500, random_state=RANDOM_STATE, n_jobs=-1, class_weight="balanced"
    )
    rf_pipeline = Pipeline(steps=[("preprocessor", preprocessor), ("model", rf_clf)])
    rf_pipeline.fit(X_train, y_train)

    xgb_clf = XGBClassifier(
        n_estimators=500,
        max_depth=6,
        learning_rate=0.05,
        subsample=0.8,
        colsample_bytree=0.8,
        # objective="multi:softprob",
        # eval_metric="mlogloss",
        random_state=RANDOM_STATE,
    )
    xgb_pipeline = Pipeline(
        steps=[("preprocessor", clone(preprocessor)), ("model", xgb_clf)]
    )
    label_encoder = LabelEncoder()
    y_train_encoded = label_encoder.fit_transform(y_train)
    xgb_pipeline.fit(X_train, y_train_encoded)
    xgb_preds_encoded = xgb_pipeline.predict(X_test)
    xgb_preds = label_encoder.inverse_transform(xgb_preds_encoded.astype(int))

    rf_metrics = evaluate("random forest classifier", rf_pipeline, X_test, y_test)
    xgb_metrics = evaluate_preds("xgboost classifier", y_test, xgb_preds)
    save_plots(rf_pipeline, X_test, y_test, keep_open=True)

    joblib.dump(rf_pipeline, OUTPUT_PATH)
    with OUTPUT_PATH_PKL.open("wb") as f:
        pickle.dump(rf_pipeline, f)
    joblib.dump(xgb_pipeline, XGB_OUTPUT_PATH)
    with XGB_OUTPUT_PATH_PKL.open("wb") as f:
        pickle.dump(xgb_pipeline, f)

    print(json.dumps({"random_forest": rf_metrics, "xgboost": xgb_metrics}, indent=2))
    print(f"Saved model: {OUTPUT_PATH.resolve()}")
    print(f"Saved model: {OUTPUT_PATH_PKL.resolve()}")
    print(f"Saved model: {XGB_OUTPUT_PATH.resolve()}")
    print(f"Saved model: {XGB_OUTPUT_PATH_PKL.resolve()}")
    print(f"Saved plots: {(PLOTS_DIR / 'mood_state_distribution.png').resolve()}")
    print(f"Saved plots: {(PLOTS_DIR / 'confusion_matrix.png').resolve()}")
    print(f"Saved plots: {(PLOTS_DIR / 'feature_importance_top20.png').resolve()}")


if __name__ == "__main__":
    main()
