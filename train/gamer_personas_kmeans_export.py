#!/usr/bin/env python3
"""Generate and export gamer personas K-Means model from notebook execution."""

import json
import pickle
import numpy as np
import pandas as pd
import warnings
warnings.filterwarnings('ignore')

from sklearn.impute import SimpleImputer
from sklearn.preprocessing import StandardScaler, OneHotEncoder
from sklearn.feature_selection import VarianceThreshold
from sklearn.decomposition import PCA
from sklearn.cluster import KMeans

# Load data
df = pd.read_csv('data/Gaming and Mental Health.csv')

# Define feature groups
numeric_cols = [
    'daily_gaming_hours', 'years_gaming', 'monthly_game_spending_usd',
    'sleep_hours', 'social_isolation_score', 'face_to_face_social_hours_weekly',
    'exercise_hours_weekly', 'work_productivity_score', 'grades_gpa'
]

ordinal_cols = {
    'sleep_quality': ['Insomnia', 'Poor', 'Fair', 'Good'],
    'sleep_disruption_frequency': ['Never', 'Rarely', 'Sometimes', 'Often', 'Always'],
    'academic_work_performance': ['Failing', 'Poor', 'Below Average', 'Average', 'Good', 'Excellent'],
    'mood_swing_frequency': ['Never', 'Rarely', 'Sometimes', 'Often', 'Daily']
}

boolean_cols = ['withdrawal_symptoms', 'loss_of_other_interests', 'continued_despite_problems']
nominal_cols = ['game_genre', 'gaming_platform']

# Prepare data
X = df[numeric_cols + list(ordinal_cols.keys()) + boolean_cols + nominal_cols].copy()

# Step 1: Impute numeric columns
imputer = SimpleImputer(strategy='median')
X[numeric_cols] = imputer.fit_transform(X[numeric_cols])

# Step 2: Ordinal encode
for col, categories in ordinal_cols.items():
    X[col] = pd.Categorical(X[col], categories=categories).codes

# Step 3: Convert booleans to int
X[boolean_cols] = X[boolean_cols].astype(int)

# Step 4: One-hot encode nominais
encoder = OneHotEncoder(sparse_output=False, handle_unknown='ignore')
X_ohe = encoder.fit_transform(X[nominal_cols])
ohe_cols = encoder.get_feature_names_out(nominal_cols)
X = pd.concat([X.drop(columns=nominal_cols), pd.DataFrame(X_ohe, columns=ohe_cols)], axis=1)

# Step 5: Variance threshold
vfilter = VarianceThreshold(threshold=0)
X_filtered = vfilter.fit_transform(X)

# Step 6: Scale
scaler = StandardScaler()
X_scaled = scaler.fit_transform(X_filtered)

# Step 7: PCA (keep 80% variance)
pca = PCA(n_components=14)
X_pca = pca.fit_transform(X_scaled)

print(f"PCA: {X_filtered.shape[1]} → {pca.n_components_} components")
print(f"Variance explained: {pca.explained_variance_ratio_.sum():.1%}")

# Step 8: K-Means with K=8
kmeans = KMeans(n_clusters=8, random_state=42, n_init=10)
clusters = kmeans.fit_predict(X_pca)

print(f"\nK-Means: K=8, Inertia={kmeans.inertia_:.1f}")
print(f"Cluster distribution: {dict(pd.Series(clusters).value_counts().sort_index())}")

# Save model bundle
bundle = {
    'kmeans': kmeans,
    'pca': pca,
    'scaler': scaler,
    'vfilter': vfilter,
    'imputer': imputer,
    'encoder': encoder,
    'numeric_cols': numeric_cols,
    'ordinal_cols': ordinal_cols,
    'boolean_cols': boolean_cols,
    'nominal_cols': nominal_cols,
    'ohe_feature_names': list(ohe_cols),
    'feature_cols': list(X.columns),
    'personas': {
        0: 'The Multi-Platform RPG Explorer',
        1: 'The Console Battle Royale Fan',
        2: 'The Mobile Shooter',
        3: 'The Crossover Mobile Gamer',
        4: 'The PC Strategist',
        5: 'The Addicted Escapist',
        6: 'The Mobile MMO Adventurer',
        7: 'The Mobile MOBA Grinder'
    },
    'cluster_sizes': dict(pd.Series(clusters).value_counts().sort_index()),
    'variance_explained': float(pca.explained_variance_ratio_.sum())
}

with open('train/artifacts/gamer_personas_kmeans.pkl', 'wb') as f:
    pickle.dump(bundle, f)

print(f"\n✓ Model saved to artifacts/gamer_personas_kmeans.pkl")
print(f"✓ Model size: {len(pickle.dumps(bundle)) / (1024**2):.2f} MB")
print(f"\nPersonas discovered:")
for k, v in bundle['personas'].items():
    print(f"  {k}: {v} (n={bundle['cluster_sizes'][k]})")
