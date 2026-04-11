"""CLI: train a bot classifier from JSONL traces."""
from __future__ import annotations

import argparse
import sys
from pathlib import Path

import numpy as np
from sklearn.model_selection import train_test_split

# Add parent directory to path so ooseven_training imports work
sys.path.insert(0, str(Path(__file__).parent.parent))

from ooseven_training.loader import load_traces  # noqa: E402
from ooseven_training.features import extract_features, FEATURE_NAMES  # noqa: E402
from ooseven_training.model import BotClassifier  # noqa: E402
from ooseven_training.metrics import report, print_report  # noqa: E402


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--data", required=True, help="Directory containing *.jsonl traces")
    parser.add_argument("--out", required=True, help="Output model path (.joblib)")
    parser.add_argument("--test-size", type=float, default=0.2)
    parser.add_argument("--seed", type=int, default=42)
    args = parser.parse_args()

    traces = load_traces(args.data)
    if not traces:
        print(f"[train] no traces found in {args.data}", file=sys.stderr)
        sys.exit(1)

    print(f"[train] loaded {len(traces)} traces")
    labels = [t["label"] for t in traces]
    n_human = labels.count("human")
    n_bot = labels.count("bot")
    print(f"[train]   {n_human} human, {n_bot} bot")

    if n_human < 5 or n_bot < 5:
        print("[train] need at least 5 of each class", file=sys.stderr)
        sys.exit(1)

    X = np.array([extract_features(t)[0] for t in traces])
    y = np.array([1 if t["label"] == "human" else 0 for t in traces])

    X_train, X_test, y_train, y_test = train_test_split(
        X, y, test_size=args.test_size, random_state=args.seed, stratify=y
    )

    model = BotClassifier(random_state=args.seed)
    model.fit(X_train, y_train, FEATURE_NAMES)

    y_pred = model.predict(X_test)
    r = report(y_test, y_pred, model.feature_importances())
    print("[train] held-out metrics:")
    print_report(r)

    model.save(args.out)
    print(f"[train] saved model to {args.out}")


if __name__ == "__main__":
    main()
