"""TypedDict schema matching the JSONL format written by @007captcha/server."""
from typing import TypedDict, Literal, Any


class Point(TypedDict):
    x: float
    y: float
    t: float


class BallFrame(TypedDict):
    i: int
    x: float
    y: float
    t: float


class FrameAck(TypedDict):
    i: int
    t: float
    x: float
    y: float


class Trace(TypedDict, total=False):
    v: int
    sessionId: str
    ts: int
    label: Literal["bot", "human"]
    points: list[Point]
    ballFrames: list[BallFrame]
    frameAcks: list[FrameAck]
    clientEnv: dict[str, Any]
    requestMeta: dict[str, Any]
    verdictAtCapture: Literal["bot", "human", "uncertain"]
    scoreAtCapture: float
    signals: dict[str, Any]
