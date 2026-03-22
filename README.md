# Dataquest 26 — Understanding Your Mind

A hackathon project that uses machine learning to analyze the relationship between gaming habits and mental wellbeing. Users fill out a short assessment about their gaming behavior and lifestyle; the system returns a personalized risk analysis across five wellbeing dimensions with explainable predictions.

---

## What It Does

- Predicts risk levels for five mental health outcomes based on a user's gaming profile:
  - Sleep problems
  - Productivity issues
  - Social isolation
  - Dysregulation
  - Emotional problems
- Shows which specific habits (hours played, genre, spending, exercise, etc.) are driving each risk
- Presents results in a retro arcade-themed web interface with charts and scenario analysis

---

## Project Structure

```
Dataquest26/
├── data/                          # Source dataset (1,000 records, 27 features)
├── mood/                          # Mood state classifier (Random Forest)
│   ├── train.py
│   ├── train_notebook.ipynb
│   └── model.joblib / model.pkl
├── train/                         # Multi-issue wellbeing models
│   ├── train_causal_grouped_model.py
│   ├── infer_grouped_model.py
│   ├── gamer_personas_kmeans.ipynb
│   ├── causal_detection_wellbeing*.ipynb
│   └── artifacts/                 # Trained model + metrics
├── analysis/                      # Causal pathway exploration
│   └── path_analysis.ipynb
└── frontend/                      # Next.js web application
    └── app/
        ├── page.tsx               # Landing page
        ├── assess/page.tsx        # User intake form
        ├── results/page.tsx       # Results + visualizations
        └── api/analyze/route.ts   # Inference API (calls Python)
```

---

## Tech Stack

| Layer | Technology |
|---|---|
| ML Models | scikit-learn (RandomForest, GradientBoosting, LogisticRegression) |
| Data | pandas, numpy |
| Notebooks | Jupyter |
| Frontend | Next.js 16, React 19, TypeScript |
| Styling | Tailwind CSS 4 |
| Charts | Recharts |

---

## Dataset

`data/Gaming and Mental Health.csv` — 1,000 rows covering:
- Demographics (age, gender, years gaming)
- Gaming habits (daily hours, spending, genre, platform)
- Physical health (sleep hours, exercise, eye strain)
- Mental health outcomes (mood state, social isolation, addiction risk level)

---

## Machine Learning Models (`train/`)

There are two scripts in the `train/` folder that together form the core ML pipeline.

### `train_causal_grouped_model.py` — Model Training

Trains a bundle of classifiers that predict five distinct wellbeing issues from a user's gaming and lifestyle inputs. The training pipeline works as follows:

1. **Feature taxonomy** — Input features are split into three groups:
   - *Actionable causes*: `daily_gaming_hours`, `monthly_game_spending_usd`, `exercise_hours_weekly`, `game_genre`, `primary_game`, `gaming_platform`
   - *Context confounders*: `age`, `gender`, `years_gaming`
   - *Mediators* (used in augmented track only): sleep, mood, social, and productivity metrics

2. **Target definitions** — Five binary classification targets are derived from the dataset:
   - `sleep_problem`: poor sleep quality or frequent sleep disruption
   - `productivity_problem`: poor academic/work performance or low productivity score
   - `social_isolation_problem`: high isolation score or low face-to-face social hours
   - `emotional_problem`: mood state is Depressed, Anxious, or Withdrawn
   - `dysregulation_problem`: frequent mood swings or continued gaming despite problems

3. **Leakage prevention** — For each issue, the features that directly define the target (e.g. `sleep_quality` for `sleep_problem`) are excluded from that model's input, preventing circular predictions.

4. **Model selection** — Three algorithms are trained and evaluated for each issue; the best by F1 + ROC-AUC is kept:
   - `RandomForestClassifier` (500 trees, balanced class weights)
   - `GradientBoostingClassifier`
   - `LogisticRegression` (balanced class weights)

5. **Overall model** — A separate top-level classifier (also best-of-three) predicts a composite `wellbeing_problem` flag (two or more issues present simultaneously).

6. **Preprocessing pipeline** — Numeric features are median-imputed and standard-scaled; categorical features are mode-imputed and one-hot encoded, all within a `ColumnTransformer` pipeline to prevent data leakage.

**Output**: `train/artifacts/grouped_wellbeing_model.pkl` — a pickle bundle containing all five issue models, the overall model, feature sets per issue, and the feature taxonomy.

| Issue | Best Model | F1 | ROC-AUC | Reliability |
|---|---|---|---|---|
| Sleep problem | GradientBoosting | 0.809 | 0.672 | Reliable |
| Social isolation | RandomForest | 0.794 | 0.927 | Reliable |
| Productivity problem | RandomForest | 0.646 | 0.716 | Reliable |
| Dysregulation | GradientBoosting | 0.550 | 0.626 | Weak |
| Emotional problem | LogisticRegression | 0.374 | 0.559 | Weak |
| **Overall wellbeing** | **RandomForest** | **0.667** | **0.898** | — |

---

### `infer_grouped_model.py` — Inference Engine

A command-line inference script that loads the trained model bundle and runs predictions for a single user profile. It is called by the Next.js API route at runtime.

**What it does:**

- Accepts a JSON payload (via `--payload` or `--payload-file`) containing the 9 required input fields
- Validates and range-clips all numeric inputs before prediction
- Runs the overall wellbeing model and all five issue-specific models
- Computes **local feature contributions** per issue using perturbation analysis: each feature is individually replaced with a neutral baseline value and the change in predicted probability is measured, giving an explainable breakdown of what is driving each risk
- Groups contributions into cause categories (`gaming_load`, `gaming_spend`, `health_habits`, `game_context`, `context`)
- Runs **intervention scenarios** on the overall risk model to show how specific behavioral changes (e.g. reduce gaming by 2h/day, add 2h exercise/week) would shift the predicted risk
- Outputs a single JSON object with overall risk, per-issue risks, top contributors, and scenario comparisons

**Usage:**

```bash
python train/infer_grouped_model.py \
  --artifact train/artifacts/grouped_wellbeing_model.pkl \
  --payload '{"age": 22, "daily_gaming_hours": 6, ...}'
```

---

## Model Performance

Overall accuracy: **79.6%**

| Issue | F1 Score |
|---|---|
| Sleep problems | 81.5% |
| Social isolation | 79.4% |
| Productivity problems | ~78% |
| Dysregulation | ~78% |
| Emotional problems | ~77% |

Models were trained without pretrained neural networks or external APIs — all classical ML on the provided dataset.

---

## Getting Started

### Python / Model Training

```bash
pip install -r requirements.txt

# Train the wellbeing models
python train/train_causal_grouped_model.py

# Train the mood classifier
python mood/train.py
```

### Web Application

```bash
cd frontend
npm install
npm run dev
```

Open [http://localhost:3000](http://localhost:3000) in your browser.

The app's `/api/analyze` route spawns a Python subprocess to run inference. Make sure Python dependencies are installed and the model artifacts exist in `train/artifacts/` before starting the frontend.

---

## How It Works

1. User fills out a 9-field form (age, gaming hours, spending, genre, platform, exercise, etc.)
2. The Next.js API route calls `infer_grouped_model.py` with the user's inputs
3. The model outputs risk levels and per-feature contribution scores for each wellbeing dimension
4. Results are displayed as pie charts, bar charts, and a scenario analysis breakdown

---

## Notebooks

| Notebook | Purpose |
|---|---|
| `train/causal_detection_wellbeing.executed.ipynb` | Core causal analysis and model training |
| `train/causal_detection_wellbeing.localcontributors.executed.ipynb` | Feature contribution analysis |
| `train/causal_detection_wellbeing.personalized.executed.ipynb` | Per-user prediction walkthrough |
| `train/gamer_personas_kmeans.ipynb` | K-means clustering of gamer archetypes |
| `mood/train_notebook.ipynb` | Mood state classifier training |
| `analysis/path_analysis.ipynb` | Causal pathway exploration |
