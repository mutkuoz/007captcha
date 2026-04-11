"""Load JSONL trace files written by @007captcha/server."""
import json
from pathlib import Path
from .schema import Trace


REQUIRED_FIELDS = {"label", "points"}


def load_traces(data_dir: str | Path) -> list[Trace]:
    """Read all *.jsonl files under data_dir and return a list of traces.

    Records missing required fields are dropped and counted.
    """
    data_dir = Path(data_dir)
    traces: list[Trace] = []
    dropped = 0
    for jsonl_path in sorted(data_dir.glob("*.jsonl")):
        with jsonl_path.open("r", encoding="utf-8") as f:
            for line in f:
                line = line.strip()
                if not line:
                    continue
                try:
                    trace = json.loads(line)
                except json.JSONDecodeError:
                    dropped += 1
                    continue
                if not REQUIRED_FIELDS.issubset(trace.keys()):
                    dropped += 1
                    continue
                if trace["label"] not in ("bot", "human"):
                    dropped += 1
                    continue
                traces.append(trace)
    if dropped:
        print(f"[loader] dropped {dropped} malformed records")
    return traces
