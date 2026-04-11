"""CLI: evaluate a trained bot classifier on a directory of traces."""
from __future__ import annotations

import argparse
import sys
from pathlib import Path

import numpy as np

sys.path.insert(0, str(Path(__file__).parent.parent))

from ooseven_training.loader import load_traces  # noqa: E402
from ooseven_training.features import extract_features  # noqa: E402
from ooseven_training.model import BotClassifier  # noqa: E402
from ooseven_training.metrics import report, print_report  # noqa: E402


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--model", required=True, help="Path to .joblib model file")
    parser.add_argument("--data", required=True, help="Directory of *.jsonl traces")
    args = parser.parse_args()

    model = BotClassifier.load(args.model)
    traces = load_traces(args.data)
    if not traces:
        print(f"[eval] no traces found in {args.data}", file=sys.stderr)
        sys.exit(1)

    X = np.array([extract_features(t)[0] for t in traces])
    y = np.array([1 if t["label"] == "human" else 0 for t in traces])
    y_pred = model.predict(X)

    r = report(y, y_pred, model.feature_importances())
    print(f"[eval] metrics on {len(traces)} traces:")
    print_report(r)


if __name__ == "__main__":
    main()
