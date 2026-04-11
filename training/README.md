# 007captcha training

Python pipeline for training a binary classifier (human vs bot) from JSONL
traces collected by the server's opt-in logger.

## Setup

```bash
cd training
python3 -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
```

## Collecting data

Run the server with:

```bash
LOG_TRACES=1 LABEL=human LOG_DIR=./training/data pnpm demo
```

and again with `LABEL=bot` for bot runs. The logger writes one JSONL per
day per label to `./training/data/`.

## Training

```bash
python -m scripts.train --data data --out models/v1.joblib
```

## Evaluating

```bash
python -m scripts.eval --model models/v1.joblib --data data/holdout
```

## Smoke test

```bash
pytest tests/
```

This generates synthetic human/bot traces, runs the full pipeline, and
asserts model accuracy > 0.9 on the held-out split.
