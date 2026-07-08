from __future__ import annotations

import math
from typing import Optional

import numpy as np
from sklearn.ensemble import RandomForestClassifier

try:
    import joblib
except Exception:  # pragma: no cover
    joblib = None


def _heuristic_anomaly(dwell: float, velocity: float) -> float:
    """
    Risk score when no model is available: deviation from typical desk typing + mouse use.
    Returns roughly 5–40 for normal ranges, rising for extreme hold times or very fast cursor motion.
    """
    bd, bv = 135.0, 680.0
    sd, sv = 110.0, 950.0
    z = ((float(dwell) - bd) / sd) ** 2 + ((float(velocity) - bv) / sv) ** 2
    return float(min(100.0, max(0.0, 18.0 * math.sqrt(z))))


def _fit_default_rf(random_state: int = 42) -> RandomForestClassifier:
    """
    Lightweight synthetic training so predict_proba is meaningful without a shipped .pkl.
    Class 0 = benign, class 1 = anomaly (sklearn sorts classes; we enforce labels 0 and 1).
    """
    rng = np.random.default_rng(random_state)
    n_ok = 500
    # Benign: mix of key-hold and inter-key intervals (browser sends keydown spacing), plus normal mouse speeds
    half = n_ok // 2
    dwell_hold = rng.normal(155.0, 42.0, half).clip(65.0, 340.0)
    dwell_flight = rng.normal(105.0, 38.0, n_ok - half).clip(35.0, 280.0)
    dwell_ok = np.concatenate([dwell_hold, dwell_flight])
    vel_ok = rng.gamma(shape=2.2, scale=320.0, size=n_ok).clip(0.0, 2400.0)

    n_bad = 280
    # Anomaly: very short/long holds, or sustained very high pointer speed
    dwell_fast = rng.uniform(18.0, 48.0, n_bad // 3)
    dwell_slow = rng.uniform(480.0, 900.0, n_bad // 3)
    vel_spike = rng.uniform(2800.0, 7500.0, n_bad - len(dwell_fast) - len(dwell_slow))
    dwell_weird = rng.uniform(20.0, 700.0, len(vel_spike))

    x_ok = np.column_stack([dwell_ok, vel_ok])
    x_bad = np.vstack(
        [
            np.column_stack([dwell_fast, rng.uniform(0.0, 4000.0, len(dwell_fast))]),
            np.column_stack([dwell_slow, rng.uniform(0.0, 4000.0, len(dwell_slow))]),
            np.column_stack([dwell_weird, vel_spike]),
        ]
    )
    x = np.vstack([x_ok, x_bad])
    y = np.array([0] * n_ok + [1] * n_bad)

    clf = RandomForestClassifier(
        n_estimators=120,
        max_depth=10,
        min_samples_leaf=4,
        random_state=random_state,
        class_weight="balanced",
    )
    clf.fit(x, y)
    return clf


class MLEngine:
    """Random Forest anomaly risk: higher score = more anomalous (0–100)."""

    def __init__(self, model_path: str = "biometric_rf_model.pkl"):
        self.model_path = model_path
        self.model: Optional[RandomForestClassifier] = None
        self._anomaly_class_index: int = 1

        if joblib is not None:
            try:
                loaded = joblib.load(self.model_path)
                if isinstance(loaded, RandomForestClassifier) and hasattr(loaded, "classes_"):
                    self.model = loaded
                    self._anomaly_class_index = self._resolve_anomaly_index(loaded)
            except Exception:
                self.model = None

        if self.model is None:
            self.model = _fit_default_rf()

    @staticmethod
    def _resolve_anomaly_index(model: RandomForestClassifier) -> int:
        classes = list(model.classes_)
        if len(classes) < 2:
            return 0
        # Prefer explicit label 1 = anomaly; else use highest class value as positive/risk.
        if 1 in classes:
            return classes.index(1)
        return int(np.argmax(classes))

    def predict_anomaly(self, dwell: float, velocity: float) -> float:
        try:
            probs = self.model.predict_proba([[float(dwell), float(velocity)]])[0]
            idx = min(self._anomaly_class_index, len(probs) - 1)
            raw = float(probs[idx]) * 100.0
            return float(min(100.0, max(0.0, raw)))
        except Exception:
            return _heuristic_anomaly(dwell, velocity)
