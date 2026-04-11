"""End-to-end smoke test for the training pipeline.

Generates synthetic human and bot traces, trains a classifier, and asserts
accuracy > 0.9 on a held-out split. Does not say anything about real-world
quality — it just validates that loader -> features -> model -> metrics
runs without errors.
"""
from __future__ import annotations

import sys
from pathlib import Path

import numpy as np
from sklearn.model_selection import train_test_split

sys.path.insert(0, str(Path(__file__).parent.parent))

from ooseven_training.loader import load_traces  # noqa: E402
from ooseven_training.features import extract_features, FEATURE_NAMES  # noqa: E402
from ooseven_training.model import BotClassifier  # noqa: E402
from scripts.gen_fixture import gen_human_trace, gen_bot_trace  # noqa: E402

import json
import random


def test_pipeline_smoke(tmp_path):
    random.seed(0)
    data_dir = tmp_path / "data"
    data_dir.mkdir()

    # Write synthetic fixture
    human_path = data_dir / "2026-04-11_human.jsonl"
    bot_path = data_dir / "2026-04-11_bot.jsonl"
    with human_path.open("w") as f:
        for i in range(40):
            f.write(json.dumps(gen_human_trace(f"h{i}")) + "\n")
    with bot_path.open("w") as f:
        for i in range(40):
            f.write(json.dumps(gen_bot_trace(f"b{i}")) + "\n")

    traces = load_traces(data_dir)
    assert len(traces) == 80

    X = np.array([extract_features(t)[0] for t in traces])
    y = np.array([1 if t["label"] == "human" else 0 for t in traces])
    assert X.shape == (80, len(FEATURE_NAMES))

    X_train, X_test, y_train, y_test = train_test_split(
        X, y, test_size=0.25, random_state=0, stratify=y
    )

    model = BotClassifier(random_state=0)
    model.fit(X_train, y_train, FEATURE_NAMES)
    y_pred = model.predict(X_test)
    acc = float((y_pred == y_test).mean())
    assert acc > 0.9, f"smoke test accuracy {acc:.3f} should be > 0.9"

    # Save + load round-trip
    model_path = tmp_path / "model.joblib"
    model.save(model_path)
    loaded = BotClassifier.load(model_path)
    y_pred2 = loaded.predict(X_test)
    assert (y_pred == y_pred2).all()
