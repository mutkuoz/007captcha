"""Thin wrapper around sklearn's GradientBoostingClassifier.

Swapping to a different algorithm (PyTorch transformer, etc.) only requires
changing this one file — loader, features, and metrics stay identical.
"""
from __future__ import annotations

from pathlib import Path
import joblib
import numpy as np
from sklearn.ensemble import GradientBoostingClassifier


class BotClassifier:
    def __init__(self, **kwargs):
        self.clf = GradientBoostingClassifier(
            n_estimators=kwargs.get("n_estimators", 200),
            max_depth=kwargs.get("max_depth", 3),
            learning_rate=kwargs.get("learning_rate", 0.1),
            random_state=kwargs.get("random_state", 42),
        )
        self.feature_names: list[str] = []

    def fit(self, X: np.ndarray, y: np.ndarray, feature_names: list[str]) -> None:
        self.feature_names = feature_names
        self.clf.fit(X, y)

    def predict(self, X: np.ndarray) -> np.ndarray:
        return self.clf.predict(X)

    def predict_proba(self, X: np.ndarray) -> np.ndarray:
        return self.clf.predict_proba(X)

    def feature_importances(self) -> list[tuple[str, float]]:
        imps = self.clf.feature_importances_
        return sorted(zip(self.feature_names, imps), key=lambda p: p[1], reverse=True)

    def save(self, path: str | Path) -> None:
        path = Path(path)
        path.parent.mkdir(parents=True, exist_ok=True)
        joblib.dump({"clf": self.clf, "features": self.feature_names}, path)

    @classmethod
    def load(cls, path: str | Path) -> "BotClassifier":
        data = joblib.load(path)
        obj = cls()
        obj.clf = data["clf"]
        obj.feature_names = data["features"]
        return obj
