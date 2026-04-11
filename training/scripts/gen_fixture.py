"""Generate synthetic human and bot traces for smoke-testing the pipeline.

These are deliberately simple — the smoke test just needs to verify that
the training loop runs end-to-end. Real data will come from the server's
opt-in logger.
"""
import argparse
import json
import math
import random
from pathlib import Path


def gen_human_trace(sid: str, n_points: int = 120) -> dict:
    """Smooth curvy path with timing jitter — passes basic human checks."""
    t = 0.0
    points = []
    ball_frames = []
    frame_acks = []
    for i in range(n_points):
        t += 8 + random.random() * 14  # 8-22ms jitter
        angle = i / 20
        bx = 240 + 80 * math.sin(angle)
        by = 200 + 60 * math.cos(angle)
        # Cursor lags by 30-80px with random jitter
        cx = bx + random.gauss(0, 20)
        cy = by + random.gauss(0, 20)
        points.append({"x": cx, "y": cy, "t": t})
        ball_frames.append({"i": i, "x": bx, "y": by, "t": i * 16.67})
        # Add network-like jitter to frame ack latency
        frame_acks.append({
            "i": i,
            "t": t - random.uniform(5, 40),
            "x": cx,
            "y": cy,
        })

    return {
        "v": 1,
        "sessionId": sid,
        "ts": 1712000000000,
        "label": "human",
        "points": points,
        "ballFrames": ball_frames,
        "frameAcks": frame_acks,
        "clientEnv": {
            "webdriver": False,
            "languageCount": 2,
            "screenWidth": 1920,
            "screenHeight": 1080,
            "outerWidth": 1920,
            "outerHeight": 1080,
            "pluginCount": 3,
            "touchSupport": False,
            "devicePixelRatio": 1,
            "colorDepth": 24,
        },
        "requestMeta": {
            "userAgent": "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit",
            "acceptLanguage": "en-US,en;q=0.9",
        },
        "verdictAtCapture": "human",
        "scoreAtCapture": 0.8,
        "signals": {},
    }


def gen_bot_trace(sid: str, n_points: int = 120) -> dict:
    """Straight line with perfectly uniform timing — should fail human checks."""
    points = []
    ball_frames = []
    frame_acks = []
    for i in range(n_points):
        t = i * 16.667
        bx = 240 + i * 2
        by = 200
        cx = bx  # perfect tracking
        cy = by
        points.append({"x": cx, "y": cy, "t": t})
        ball_frames.append({"i": i, "x": bx, "y": by, "t": t})
        # Constant latency — replay signature
        frame_acks.append({"i": i, "t": t - 50, "x": cx, "y": cy})
    return {
        "v": 1,
        "sessionId": sid,
        "ts": 1712000000000,
        "label": "bot",
        "points": points,
        "ballFrames": ball_frames,
        "frameAcks": frame_acks,
        "clientEnv": {
            "webdriver": True,
            "languageCount": 1,
            "screenWidth": 1280,
            "screenHeight": 720,
            "outerWidth": 0,
            "outerHeight": 0,
            "pluginCount": 0,
            "touchSupport": False,
            "devicePixelRatio": 1,
            "colorDepth": 24,
        },
        "requestMeta": {
            "userAgent": "HeadlessChrome/120",
            "acceptLanguage": "en-US",
        },
        "verdictAtCapture": "bot",
        "scoreAtCapture": 0.1,
        "signals": {},
    }


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--out", required=True, help="Output directory")
    parser.add_argument("--n-human", type=int, default=20)
    parser.add_argument("--n-bot", type=int, default=20)
    parser.add_argument("--seed", type=int, default=42)
    args = parser.parse_args()

    random.seed(args.seed)
    out_dir = Path(args.out)
    out_dir.mkdir(parents=True, exist_ok=True)

    human_path = out_dir / "2026-04-11_human.jsonl"
    bot_path = out_dir / "2026-04-11_bot.jsonl"

    with human_path.open("w", encoding="utf-8") as f:
        for i in range(args.n_human):
            f.write(json.dumps(gen_human_trace(f"human-{i}")) + "\n")

    with bot_path.open("w", encoding="utf-8") as f:
        for i in range(args.n_bot):
            f.write(json.dumps(gen_bot_trace(f"bot-{i}")) + "\n")

    print(f"[gen_fixture] wrote {args.n_human} human and {args.n_bot} bot traces to {out_dir}")


if __name__ == "__main__":
    main()
