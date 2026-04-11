"""Scalar feature extractor for cursor traces.

Reimplements (in numpy) the same mathematical signals the server's scoring
code computes in TypeScript, plus a few more. Returns a fixed-size feature
vector so sklearn models can train on it.
"""
from __future__ import annotations

import math
import numpy as np
from .schema import Trace


FEATURE_NAMES: list[str] = [
    # Kinematics
    "duration_ms",
    "point_count",
    "speed_mean",
    "speed_std",
    "speed_max",
    "speed_cv",
    "accel_mean",
    "accel_std",
    "accel_max",
    "jerk_std",
    "jerk_zero_ratio",
    # Geometry
    "power_law_beta",
    "power_law_r2",
    "path_length",
    "bbox_w",
    "bbox_h",
    "bbox_diag",
    # Spectral
    "dft_peak_ratio",
    "timing_cv",
    "timing_dup_frac",
    # Submovements
    "submvmt_per_sec",
    "submvmt_cv",
    # Drift
    "skew_x",
    "skew_y",
    "bias_sym",
    # Ball tracking (from signals block if present)
    "avg_distance",
    "distance_std",
    "tracking_coverage",
    "frame_within_tight",
    "estimated_lag",
    "lag_consistency",
    # Reaction time
    "rt_count",
    "rt_mean",
    "rt_std",
    "rt_cv",
    "rt_skew",
    # FrameAck derived
    "ack_coverage",
    "ack_lat_mean",
    "ack_lat_std",
    "ack_far_ratio",
    # Environment
    "env_webdriver",
    "env_plugin_count",
    "env_language_count",
    "env_touch",
    "env_outer_zero",
    "env_headless_ua",
]


def _mean(a: np.ndarray) -> float:
    return float(a.mean()) if a.size > 0 else 0.0


def _std(a: np.ndarray) -> float:
    return float(a.std(ddof=1)) if a.size > 1 else 0.0


def _skew(a: np.ndarray) -> float:
    if a.size < 3:
        return 0.0
    m = a.mean()
    s = a.std()
    if s < 1e-10:
        return 0.0
    return float(((a - m) ** 3).mean() / (s ** 3))


def _kinematics(points: list[dict]) -> dict[str, float]:
    if len(points) < 2:
        return {
            "duration_ms": 0, "point_count": len(points),
            "speed_mean": 0, "speed_std": 0, "speed_max": 0, "speed_cv": 0,
            "accel_mean": 0, "accel_std": 0, "accel_max": 0,
            "jerk_std": 0, "jerk_zero_ratio": 1,
            "path_length": 0,
        }
    x = np.array([p["x"] for p in points])
    y = np.array([p["y"] for p in points])
    t = np.array([p["t"] for p in points])
    dx = np.diff(x)
    dy = np.diff(y)
    dt = np.diff(t)
    dt_safe = np.where(dt > 0, dt, 1)
    dist = np.sqrt(dx ** 2 + dy ** 2)
    speed = dist / dt_safe * 1000  # px/s
    speed_mean = _mean(speed)
    speed_std = _std(speed)
    if speed.size > 1:
        accel = np.diff(speed) / dt_safe[1:] * 1000
    else:
        accel = np.array([])
    if accel.size > 1:
        jerk = np.diff(accel) / dt_safe[2:] * 1000
    else:
        jerk = np.array([])
    jerk_zero_ratio = float((np.abs(jerk) < 50).mean()) if jerk.size > 0 else 1.0

    return {
        "duration_ms": float(t[-1] - t[0]),
        "point_count": float(len(points)),
        "speed_mean": speed_mean,
        "speed_std": speed_std,
        "speed_max": float(speed.max()) if speed.size else 0,
        "speed_cv": speed_std / speed_mean if speed_mean > 0 else 0,
        "accel_mean": _mean(accel),
        "accel_std": _std(accel),
        "accel_max": float(np.abs(accel).max()) if accel.size else 0,
        "jerk_std": _std(jerk),
        "jerk_zero_ratio": jerk_zero_ratio,
        "path_length": float(dist.sum()),
    }


def _power_law(points: list[dict]) -> tuple[float, float]:
    if len(points) < 20:
        return 0.0, 0.0
    log_v: list[float] = []
    log_r: list[float] = []
    for i in range(1, len(points) - 1):
        prev, curr, nxt = points[i - 1], points[i], points[i + 1]
        dt = nxt["t"] - prev["t"]
        if dt <= 0:
            continue
        dx = nxt["x"] - prev["x"]
        dy = nxt["y"] - prev["y"]
        v = math.sqrt(dx * dx + dy * dy) / dt * 1000
        ax = curr["x"] - prev["x"]
        ay = curr["y"] - prev["y"]
        bx = nxt["x"] - curr["x"]
        by = nxt["y"] - curr["y"]
        cross = abs(ax * by - ay * bx)
        da = math.sqrt(ax * ax + ay * ay)
        db = math.sqrt(bx * bx + by * by)
        dc = math.sqrt(dx * dx + dy * dy)
        if da < 0.5 or db < 0.5 or dc < 0.5:
            continue
        curvature = 2 * cross / (da * db * dc)
        if curvature < 1e-6 or v < 1:
            continue
        r = 1 / curvature
        log_v.append(math.log(v))
        log_r.append(math.log(r))
    if len(log_v) < 15:
        return 0.0, 0.0
    lv = np.array(log_v)
    lr = np.array(log_r)
    n = lv.size
    sum_x = lr.sum()
    sum_y = lv.sum()
    sum_xy = (lr * lv).sum()
    sum_x2 = (lr * lr).sum()
    denom = n * sum_x2 - sum_x * sum_x
    if abs(denom) < 1e-10:
        return 0.0, 0.0
    beta = (n * sum_xy - sum_x * sum_y) / denom
    intercept = (sum_y - beta * sum_x) / n
    predicted = intercept + beta * lr
    ss_res = ((lv - predicted) ** 2).sum()
    ss_tot = ((lv - lv.mean()) ** 2).sum()
    r2 = max(0.0, 1 - ss_res / ss_tot) if ss_tot > 0 else 0.0
    return float(beta), float(r2)


def _spectral(points: list[dict]) -> tuple[float, float, float]:
    """Returns (peak_ratio, timing_cv, duplicate_fraction)."""
    if len(points) < 20:
        return 0.0, 0.0, 0.0
    intervals = np.array([points[i]["t"] - points[i - 1]["t"] for i in range(1, len(points))])
    intervals = intervals[intervals > 0]
    if intervals.size < 15:
        return 0.0, 0.0, 0.0
    mean_iv = float(intervals.mean())
    std_iv = float(intervals.std())
    timing_cv = std_iv / mean_iv if mean_iv > 0 else 0
    # Duplicate fraction — round to 0.1ms buckets
    rounded = np.round(intervals * 10)
    _, counts = np.unique(rounded, return_counts=True)
    dup_frac = float(counts.max() / intervals.size)
    # DFT peak/mean ratio
    centered = intervals - mean_iv
    fft = np.fft.fft(centered)
    mags = np.abs(fft[1 : len(fft) // 2 + 1]) / len(fft)
    mean_mag = float(mags.mean()) if mags.size else 0
    max_mag = float(mags.max()) if mags.size else 0
    peak_ratio = max_mag / mean_mag if mean_mag > 0 else 0
    return peak_ratio, timing_cv, dup_frac


def _submovements(points: list[dict]) -> tuple[float, float]:
    if len(points) < 20:
        return 0.0, 0.0
    t = np.array([p["t"] for p in points])
    duration = float(t[-1] - t[0])
    if duration < 500:
        return 0.0, 0.0
    x = np.array([p["x"] for p in points])
    y = np.array([p["y"] for p in points])
    dx = np.diff(x)
    dy = np.diff(y)
    dt = np.diff(t)
    dt_safe = np.where(dt > 0, dt, 1)
    speeds = np.sqrt(dx ** 2 + dy ** 2) / dt_safe * 1000
    if speeds.size < 15:
        return 0.0, 0.0
    # Smooth with window 5
    win = max(1, min(5, speeds.size // 4))
    kernel = np.ones(2 * win + 1) / (2 * win + 1)
    padded = np.pad(speeds, (win, win), mode="edge")
    smoothed = np.convolve(padded, kernel, mode="valid")
    mean_speed = float(smoothed.mean())
    noise_floor = mean_speed * 0.3
    peaks: list[int] = []
    for i in range(1, len(smoothed) - 1):
        if smoothed[i] > smoothed[i - 1] and smoothed[i] > smoothed[i + 1] and smoothed[i] > noise_floor:
            peaks.append(i)
    peak_count = len(peaks)
    per_sec = peak_count / (duration / 1000)
    if len(peaks) < 2:
        return per_sec, 0.0
    speed_times = t[1:]
    intervals = np.array([speed_times[peaks[i]] - speed_times[peaks[i - 1]] for i in range(1, len(peaks))])
    mean_iv = float(intervals.mean())
    std_iv = float(intervals.std())
    cv = std_iv / mean_iv if mean_iv > 0 else 0
    return per_sec, cv


def _drift(points: list[dict]) -> tuple[float, float, float]:
    if len(points) < 20:
        return 0.0, 0.0, 0.0
    x = np.array([p["x"] for p in points])
    y = np.array([p["y"] for p in points])
    dx = np.diff(x)
    dy = np.diff(y)
    sx = _skew(dx)
    sy = _skew(dy)
    bias_sym = abs(abs(sx) - abs(sy))
    return sx, sy, bias_sym


def _bbox(points: list[dict]) -> tuple[float, float, float]:
    if not points:
        return 0.0, 0.0, 0.0
    xs = np.array([p["x"] for p in points])
    ys = np.array([p["y"] for p in points])
    w = float(xs.max() - xs.min())
    h = float(ys.max() - ys.min())
    diag = math.sqrt(w * w + h * h)
    return w, h, diag


def _ball_tracking(trace: Trace) -> dict[str, float]:
    """Extract ball-tracking metrics from the signals block, or compute from raw."""
    signals = trace.get("signals", {})
    ball = signals.get("ballMetrics") if isinstance(signals, dict) else None
    if isinstance(ball, dict):
        return {
            "avg_distance": float(ball.get("averageDistance", 0) or 0),
            "distance_std": float(ball.get("distanceStdDev", 0) or 0),
            "tracking_coverage": float(ball.get("trackingCoverage", 0) or 0),
            "frame_within_tight": float(ball.get("frameWithinTight", 0) or 0),
            "estimated_lag": float(ball.get("estimatedLag", 0) or 0),
            "lag_consistency": float(ball.get("lagConsistency", 0) or 0),
        }
    # Fall back: compute from raw points + ballFrames
    points = trace.get("points", [])
    frames = trace.get("ballFrames", [])
    if not points or not frames:
        return {
            "avg_distance": 0, "distance_std": 0,
            "tracking_coverage": 0, "frame_within_tight": 0,
            "estimated_lag": 0, "lag_consistency": 0,
        }
    # Simple compute: match each point to nearest frame by time
    frame_ts = np.array([f["t"] for f in frames])
    frame_xs = np.array([f["x"] for f in frames])
    frame_ys = np.array([f["y"] for f in frames])
    start_t = points[0]["t"]
    distances: list[float] = []
    for p in points:
        offset = p["t"] - start_t
        idx = int(np.clip(np.searchsorted(frame_ts, offset), 0, len(frames) - 1))
        dx = p["x"] - frame_xs[idx]
        dy = p["y"] - frame_ys[idx]
        distances.append(math.sqrt(dx * dx + dy * dy))
    arr = np.array(distances)
    return {
        "avg_distance": float(arr.mean()),
        "distance_std": float(arr.std()),
        "tracking_coverage": float((arr < 150).mean()),
        "frame_within_tight": float((arr < 80).mean()),
        "estimated_lag": 0.0,  # not computed in fallback
        "lag_consistency": 0.0,
    }


def _reaction_time(trace: Trace) -> dict[str, float]:
    signals = trace.get("signals", {})
    rt = signals.get("reactionTime") if isinstance(signals, dict) else None
    if not isinstance(rt, dict):
        return {"rt_count": 0, "rt_mean": 0, "rt_std": 0, "rt_cv": 0, "rt_skew": 0}
    return {
        "rt_count": float(rt.get("sampleCount", 0) or 0),
        "rt_mean": float(rt.get("meanRT", 0) or 0),
        "rt_std": float(rt.get("rtStdDev", 0) or 0),
        "rt_cv": float(rt.get("rtCV", 0) or 0),
        "rt_skew": float(rt.get("rtSkewness", 0) or 0),
    }


def _frame_acks(trace: Trace) -> dict[str, float]:
    acks = trace.get("frameAcks", []) or []
    frames = trace.get("ballFrames", []) or []
    if not acks or not frames:
        return {"ack_coverage": 0, "ack_lat_mean": 0, "ack_lat_std": 0, "ack_far_ratio": 1}
    ack_coverage = len(acks) / max(1, len(frames))
    frame_ts = {f["i"]: f["t"] for f in frames}
    frame_pos = {f["i"]: (f["x"], f["y"]) for f in frames}
    latencies: list[float] = []
    far_count = 0
    for a in acks:
        if a["i"] in frame_ts:
            latencies.append(a["t"] - frame_ts[a["i"]])
        if a["i"] in frame_pos:
            fx, fy = frame_pos[a["i"]]
            if math.sqrt((a["x"] - fx) ** 2 + (a["y"] - fy) ** 2) > 90:
                far_count += 1
    lat_arr = np.array(latencies) if latencies else np.array([0.0])
    # De-mean to get jitter-only stddev
    demean_std = float((lat_arr - lat_arr.mean()).std())
    return {
        "ack_coverage": ack_coverage,
        "ack_lat_mean": float(lat_arr.mean()),
        "ack_lat_std": demean_std,
        "ack_far_ratio": far_count / max(1, len(acks)),
    }


def _env(trace: Trace) -> dict[str, float]:
    env = trace.get("clientEnv", {}) or {}
    meta = trace.get("requestMeta", {}) or {}
    ua = (meta.get("userAgent") or "").lower() if isinstance(meta, dict) else ""
    headless_ua = 1.0 if ("headless" in ua or "phantomjs" in ua or "puppeteer" in ua or "playwright" in ua) else 0.0
    return {
        "env_webdriver": 1.0 if env.get("webdriver") else 0.0,
        "env_plugin_count": float(env.get("pluginCount", 0) or 0),
        "env_language_count": float(env.get("languageCount", 0) or 0),
        "env_touch": 1.0 if env.get("touchSupport") else 0.0,
        "env_outer_zero": 1.0 if (env.get("outerWidth") == 0 and env.get("outerHeight") == 0) else 0.0,
        "env_headless_ua": headless_ua,
    }


def extract_features(trace: Trace) -> tuple[np.ndarray, list[str]]:
    points = trace.get("points", [])
    kin = _kinematics(points)
    beta, r2 = _power_law(points)
    peak_ratio, timing_cv, dup_frac = _spectral(points)
    submvmt_per_sec, submvmt_cv = _submovements(points)
    skew_x, skew_y, bias_sym = _drift(points)
    bbox_w, bbox_h, bbox_diag = _bbox(points)
    bt = _ball_tracking(trace)
    rt = _reaction_time(trace)
    fa = _frame_acks(trace)
    env = _env(trace)

    values: dict[str, float] = {
        **kin,
        "power_law_beta": beta,
        "power_law_r2": r2,
        "bbox_w": bbox_w,
        "bbox_h": bbox_h,
        "bbox_diag": bbox_diag,
        "dft_peak_ratio": peak_ratio,
        "timing_cv": timing_cv,
        "timing_dup_frac": dup_frac,
        "submvmt_per_sec": submvmt_per_sec,
        "submvmt_cv": submvmt_cv,
        "skew_x": skew_x,
        "skew_y": skew_y,
        "bias_sym": bias_sym,
        **bt,
        **rt,
        **fa,
        **env,
    }

    vec = np.array([values.get(name, 0.0) for name in FEATURE_NAMES], dtype=np.float64)
    return vec, FEATURE_NAMES
