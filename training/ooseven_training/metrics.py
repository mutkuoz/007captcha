"""Evaluation metrics for the bot classifier."""
from __future__ import annotations

import numpy as np
from sklearn.metrics import (
    accuracy_score,
    precision_recall_fscore_support,
    confusion_matrix,
)


def report(y_true: np.ndarray, y_pred: np.ndarray, feature_importances: list[tuple[str, float]] | None = None) -> dict:
    acc = float(accuracy_score(y_true, y_pred))
    prec, rec, f1, _ = precision_recall_fscore_support(
        y_true, y_pred, average="binary", pos_label=1, zero_division=0
    )
    cm = confusion_matrix(y_true, y_pred, labels=[0, 1]).tolist()
    result = {
        "accuracy": acc,
        "precision": float(prec),
        "recall": float(rec),
        "f1": float(f1),
        "confusion_matrix": cm,  # rows = actual [bot, human], cols = predicted
    }
    if feature_importances:
        result["top_features"] = [(n, float(v)) for n, v in feature_importances[:20]]
    return result


def print_report(r: dict) -> None:
    print(f"  accuracy : {r['accuracy']:.4f}")
    print(f"  precision: {r['precision']:.4f}")
    print(f"  recall   : {r['recall']:.4f}")
    print(f"  f1       : {r['f1']:.4f}")
    print("  confusion matrix (rows=actual, cols=predicted; [0]=bot [1]=human):")
    for row in r["confusion_matrix"]:
        print(f"    {row}")
    if "top_features" in r:
        print("  top 20 feature importances:")
        for name, imp in r["top_features"]:
            print(f"    {name:30s} {imp:.4f}")
