# Ball-Only Hardening and Training Framework — Design

**Date:** 2026-04-11
**Status:** Approved (pending written-spec review)
**Scope:** Breaking 2.0 release of `@007captcha/{server,client,react}`

## Motivation

AI agents are passing the current 007captcha ball challenge. A security audit of
the scoring code (see conversation transcript) identified four specific holes:

1. Ball tracking is measured only as an aggregate average — there is no
   per-frame tolerance check. A bot can be "roughly in the neighborhood" of the
   ball and still score 1.0 on tracking.
2. The reaction-time scorer falls back to a neutral 0.5 when no RT samples are
   captured, giving bots that ignore direction changes a free pass.
3. The distance band is too loose (`avgDistance` up to 140px on a 480×400
   canvas) and has no hard flag for unnaturally precise tracking.
4. `cursorStartT` is a single client-controlled anchor. A pre-computed cursor
   trace can be replayed across sessions by adjusting this one value. There is
   no per-frame commitment tying the client's cursor to the server's streamed
   ball positions.

In addition, the statistical signals the scoring relies on (velocity-curvature
power law, spectral DFT, jerk, submovements, drift) are all learnable from a
corpus of real human mouse traces. A rule-based layer alone will not stay ahead
of motivated attackers. A second-stage ML classifier trained on labeled traces
is needed — but can only be built if a labeled corpus exists. No such corpus
exists today.

This design addresses both problems in one delivery, and simultaneously drops
the shape and maze challenges, which the maintainer no longer wants to support.

## Goals

- Close the four audit holes on the ball challenge with minimum viable
  rule-based changes.
- Delete shape and maze challenges cleanly. Ball is the only supported method.
- Add opt-in server-side trace logging that produces a labeled JSONL corpus
  suitable for ML training.
- Ship a self-contained Python training pipeline (sklearn) that ingests the
  corpus, extracts features, trains a binary classifier, and reports metrics.
- Preserve the `@007captcha/server` zero-runtime-dependency guarantee.

## Non-goals

- Wiring the trained model back into the live server. This is an offline
  pipeline only. A runtime model hookup is a future delivery.
- Training an actual model and reporting real-world accuracy. The pipeline
  must run end-to-end on a synthetic fixture, but the maintainer will collect
  real data after this delivery.
- Touching DFT thresholds, spectral checks, drift scoring, ball rendering
  opacity, proof-of-work, or replay protection. Those remain future work.
- Deprecation shims for shape/maze. They are hard-deleted in 2.0.

## High-level architecture

Two parallel workstreams:

**Workstream 1 — Ball-only hardening.** Scoring fixes, API cleanup, deletion
of shape/maze. All TypeScript. Touches `packages/server`, `packages/client`,
`packages/react`, `examples/`, `README.md`. Breaking change, shipped as 2.0.

**Workstream 2 — Training framework.** Server-side trace logger (TS, inside
`packages/server`) plus a Python training pipeline in a new top-level
`training/` directory, outside the pnpm workspace. Server logger is opt-in and
has zero cost when disabled.

The two workstreams touch mostly disjoint files and can be implemented in
either order. Workstream 1 must finish first if we want Workstream 2 to log
post-hardening traces (which we do, so the trained model learns on the new
rule-based baseline).

## Workstream 1: Ball-only hardening

### 1A. Delete shape and maze

Hard-delete the following:

- `packages/server/src/shape/` (entire directory)
- `packages/server/src/maze/` (entire directory)
- Any shape/maze rendering in `packages/client/src/`
- Any shape/maze references in `packages/react/src/`
- Shape/maze tests in `packages/server/src/__tests__/`
- Shape/maze method pickers and imports in `examples/express-server/`,
  `examples/react-app/`, `examples/vanilla-html/`
- Shape/maze sections and the "three challenge methods" tagline in `README.md`

Remove exports from `packages/server/src/index.ts`:
- `ShapeChallengeManager`
- `MazeChallengeManager`

Remove from `packages/server/src/types.ts` any `ShapeSession`, `MazeSession`,
`ShapeVerifyArgs`, `MazeVerifyArgs`, and related types.

### 1B. Simplify client API

Remove the `method` parameter from both the vanilla client and the React
component. Ball is the implicit only choice.

Before:
```ts
OOSevenCaptcha.render({
  siteKey, container, method: 'ball' | 'shape' | 'maze' | 'random', serverUrl, ...
});
```

After:
```ts
OOSevenCaptcha.render({
  siteKey, container, serverUrl, ...
});
```

The `method` field is removed entirely, not narrowed to `'ball'`. Callers who
passed `method: 'ball'` will get a TypeScript error on upgrade; the fix is to
delete that field. This is acceptable for a major version bump.

### 1C. Scoring fix 1 — Frame-level ball-tracking enforcement

**Problem:** `packages/server/src/ball/analyze.ts` computes per-frame distance
in the tracking loop (around line 124) but only aggregates into `avgDistance`
and `coverage`. There is no per-frame threshold.

**Change:** Extend `trackingMetrics` with a new field:

```ts
frameWithinTight: number  // fraction of cursor samples whose nearest-in-time
                          // ball frame is within R_tight = 80px
```

In `packages/server/src/ball/scoring.ts`, apply the following rules in the
hard-flag phase:

- `frameWithinTight < 0.55` → hard flag (`verdict: 'bot'`, reason
  `'not_tracking'`).
- `frameWithinTight > 0.95 && avgDistance < 12` → hard flag (reason
  `'inhuman_precision'`).

In the soft-score phase:
- Fold `frameWithinTight` into the ball score at approximately 20% weight.
- Demote `avgDistance` from its current 1.0 max contribution to 0.6 max. It
  remains useful as a tiebreaker but is no longer the dominant tracking
  signal.

`R_tight = 80px` was chosen to accommodate normal tracking slack (finger
tremor, saccadic lag, human reaction time) while still rejecting cursors that
are clearly elsewhere on the canvas. It can be tuned later based on collected
human data.

### 1D. Scoring fix 2 — Zero reaction-time hard flag

**Problem:** `scoreReactionTime` in `scoring.ts` (around line 672) returns 0.5
(neutral) when `sampleCount < 3`. A bot that ignores direction changes produces
zero RT samples and is scored neutrally.

**Change:** In the ball analyzer, count direction changes in the ball
trajectory (the physics module already has this information at tick time;
expose the count on the analysis result). Then in `scoreReactionTime`:

- If the ball underwent ≥3 direction changes during the challenge AND
  `sampleCount === 0` → hard flag (reason `'no_reaction'`).
- If direction changes occurred AND `sampleCount ∈ [1, 2]` → score 0.1, not
  0.5. Two samples is insufficient to be human-plausible.
- If the ball never turned (no direction changes) → keep the 0.5 neutral
  fallback. Some legitimate trajectories are nearly straight.

### 1E. Scoring fix 3 — Tighten distance band

**Problem:** `scoring.ts` around line 703 scores `avgDistance ∈ [15, 140]` as
1.0. The upper bound is far too permissive.

**Change:**

- Shrink the scoring band upper end from 140 to 80. `avgDistance > 100` now
  scores 0. Band becomes: [0,10)→0.1 (already penalized elsewhere), [10,80]→
  1.0, [80,100]→linear interp, >100→0.
- Add hard flag: `avgDistance < 10 && stddev(distance) < 3` → hard bot
  (reason `'too_tight'`). Real humans cannot track this precisely due to
  finger tremor and saccadic lag.
- Coverage: `coverage > 0.9 && avgDistance < 20` → hard flag. Currently only
  `coverage > 0.97` penalizes at all.

### 1F. Scoring fix 4 — Per-frame client commitment (frameAcks)

This is the largest change in workstream 1. It closes the single biggest hole:
cursor-to-ball temporal binding.

**Current flow:**
1. `POST /captcha/ball/start` → `sessionId`
2. `GET /captcha/ball/:id/stream` (SSE) → server streams PNG frames
3. `POST /captcha/ball/:id/verify` with `{ points, cursorStartT, origin, clientEnv }`

The server verifies by aligning the entire `points` array to the stored ball
frames using `cursorStartT` as a single timing anchor. This anchor is client-
controlled; a pre-computed cursor trace can be aligned to any session by
adjusting it.

**New flow:**
1. `POST /captcha/ball/start` → `sessionId`
2. `GET /captcha/ball/:id/stream` (SSE) — server records `serverSentT[k]` per
   dispatched frame, stored on the session
3. For each frame the client receives over SSE, it records
   `{ i: frameIndex, t: clientReceivedT, x: cursorX, y: cursorY }` into a
   local buffer (reading `performance.now()` and the current cursor position)
4. `POST /captcha/ball/:id/verify` with
   `{ points, cursorStartT, origin, clientEnv, frameAcks }` where
   `frameAcks: Array<{ i, t, x, y }>`

**Server-side validation** (all hard flags):

1. **Coverage:** `frameAcks.length >= 0.9 * frames.length`. A bot that skipped
   rendering frames (headless without full rendering) will fail this.
2. **Monotonic indices:** `frameAcks[k].i` strictly increasing. No duplicates,
   no out-of-order.
3. **Latency sanity:** Compute `lat[k] = frameAcks[k].t - serverSentT[frameAcks[k].i]`
   after clock alignment via the median offset. Require:
   - `mean(lat)` ∈ [1ms, 500ms]
   - `stddev(lat) > 0.5ms` — network jitter is always nonzero; zero variance
     is a replay signature
   - No negative latencies after alignment (clock skew tolerated)
4. **Cursor↔ball tight check:** For each ack, compute
   `dist((x,y), ball_position_at_frame_i) < 90px`. If more than 20% of acks
   fail this check, hard flag.
5. **Integrity cross-check:** The committed `(x,y)` at `frameAcks[k].t` must
   match (within 5px) the interpolated cursor position from the `points`
   array at that same timestamp. This prevents an attacker from forging
   `frameAcks` independently of a pre-computed `points` trace.

**Clock alignment note:** the client and server clocks are not synchronized.
The server computes a single offset per session as
`median(frameAcks[k].t - serverSentT[frameAcks[k].i])` and subtracts it before
computing per-frame latencies. This absorbs whatever absolute clock skew
exists between client and server, while preserving the variance-based checks
that matter.

### 1G. Files touched in Workstream 1

**Deletions:**
- `packages/server/src/shape/` (whole dir)
- `packages/server/src/maze/` (whole dir)
- Shape/maze entries in `packages/server/src/__tests__/`
- Any shape/maze files in `packages/client/src/` and `packages/react/src/`
- Shape/maze blocks in `examples/express-server/`, `examples/react-app/`,
  `examples/vanilla-html/`
- Shape/maze sections in `README.md`

**Edits:**
- `packages/server/src/ball/scoring.ts` — fixes 1C, 1D, 1E, and frameAck
  validation from 1F
- `packages/server/src/ball/analyze.ts` — new `frameWithinTight` metric,
  direction-change count exposure, frameAck processing
- `packages/server/src/ball/session.ts` — record `serverSentT` per frame in
  the SSE dispatch loop, accept `frameAcks` in `verify()`
- `packages/server/src/ball/physics.ts` — expose direction-change count on
  the tick generator result
- `packages/server/src/types.ts` — new `FrameAck` type, updated
  `BallVerifyArgs`
- `packages/server/src/index.ts` — remove shape/maze exports
- `packages/client/src/...` — capture `frameAcks` during SSE stream, send in
  verify call, remove `method` parameter
- `packages/react/src/...` — remove `method` prop
- `packages/server/src/ball/__tests__/` — fixture updates for new fields,
  new tests for each hard flag
- `package.json` files — version bump to 2.0.0 across server, client, react
- `README.md` — ball-only rewrite

## Workstream 2: Training framework

### 2A. Server-side trace logger

**New file:** `packages/server/src/logger.ts` exporting a single function:

```ts
export function logTrace(trace: TraceRecord): void;
```

**Activation:** No-op unless `process.env.LOG_TRACES === '1'`. When enabled,
requires `process.env.LABEL` to be set to `'bot'` or `'human'`. If
`LOG_TRACES=1` is set without `LABEL`, the server throws at startup (not at
first trace) to prevent silent unlabeled data collection. `LOG_DIR` defaults
to `./traces`, created on first write.

**Format:** One JSONL file per day per label:
`${LOG_DIR}/${YYYY-MM-DD}_${LABEL}.jsonl`. Writes are append-only. Each write
is a full JSON object followed by `\n`, flushed synchronously per trace. No
batching — the write throughput is trivial (one trace per completed captcha
session).

**Call site:** `ball/session.ts` `verify()` method, immediately after scoring
completes and before returning the result. Passes the full submission plus
the computed signals and verdict.

**Schema:**

```jsonc
{
  "v": 1,
  "sessionId": "...",
  "ts": 1712000000000,
  "label": "bot" | "human",
  "points": [{"x": 123, "y": 234, "t": 100}, ...],
  "ballFrames": [{"i": 0, "x": 240, "y": 200, "t": 0}, ...],
  "frameAcks":  [{"i": 0, "t": 102, "x": 240, "y": 201}, ...],
  "clientEnv":  { ... as submitted ... },
  "requestMeta":{ "userAgent": "...", "acceptLanguage": "..." },
  "verdictAtCapture": "human" | "bot" | "uncertain",
  "scoreAtCapture": 0.73,
  "signals": { /* every sub-score the scoring engine produced */ }
}
```

The `signals` field is deliberately comprehensive — it duplicates what the
scoring engine already computes, at no extra cost, and lets Python training
analyze which hand-crafted signals correlate with model predictions. This is
how you tell which rules are carrying weight and which are dead freight.

**Zero-dependency guarantee:** `logger.ts` uses only `node:fs` and `node:path`.
No new runtime dependencies in `@007captcha/server`.

### 2B. Python training pipeline

**Location:** `training/` at repo root, outside the pnpm workspace.

**Layout:**

```
training/
├── README.md                       # how to install & run
├── requirements.txt                # numpy, scikit-learn, pytest
├── pyproject.toml                  # ruff config only
├── .gitignore                      # ignores data/, models/, __pycache__/
├── data/                           # gitignored
├── models/                         # gitignored
├── ooseven_training/
│   ├── __init__.py
│   ├── schema.py                   # TypedDict matching the JSONL schema
│   ├── loader.py                   # load_traces(dir) -> list[Trace]
│   ├── features.py                 # extract_features(trace) -> (np.ndarray, list[str])
│   ├── model.py                    # train()/predict() — sklearn wrapper
│   └── metrics.py                  # report(y_true, y_pred) -> dict
├── scripts/
│   ├── train.py                    # python -m scripts.train --data ... --out ...
│   ├── eval.py                     # python -m scripts.eval --model ... --data ...
│   └── gen_fixture.py              # synthesizes test data for smoke tests
└── tests/
    └── test_pipeline.py            # pytest smoke: gen → train → eval → assert
```

**Dependencies (`requirements.txt`):**
```
numpy>=1.24
scikit-learn>=1.3
pytest>=7.0
```

Nothing else. No scipy (skew computed manually), no pandas (numpy suffices),
no torch (sklearn is the right tool for this scale).

**Loader** (`loader.py`): reads all `*.jsonl` files from a directory, returns
a list of validated trace dicts. Drops records with missing required fields
and logs a warning count. No pandas — plain list of dicts.

**Feature extractor** (`features.py`): reimplements ~40 scalar features from
the TS scoring logic in numpy. The duplication is accepted: ~200 lines of
numpy is simpler than any FFI bridge. Feature categories:

- **Kinematics:** duration, point count, speed (mean/std/max/CV),
  acceleration (mean/std/max), jerk (mean/std)
- **Geometry:** velocity-curvature power law β and R², total path length,
  bounding box ratio
- **Spectral:** DFT peak/mean ratio on inter-event intervals (numpy.fft),
  timing CV, duplicate-interval fraction
- **Submovements:** peaks per second, peak regularity CV
- **Drift:** skew_x, skew_y, axis asymmetry
- **Ball tracking:** avgDistance, coverage, frameWithinTight, lag mean,
  lag stddev
- **Reaction time:** count, mean, median, CV, skew
- **FrameAck-derived:** ack coverage (present acks / expected frames), latency
  mean, latency stddev, integrity mismatch count
- **Environment:** webdriver flag, plugin count, language count, touch
  support, headless/puppeteer/playwright UA markers
- **Hard-flag indicators:** monotonic timestamps OK, β in sane range — as 0/1
  features. The model can learn when these misalign with other signals.

Returns `(np.ndarray of shape (n_features,), list[str] of feature names)`.

**Model** (`model.py`): `sklearn.ensemble.GradientBoostingClassifier` with
default hyperparameters as the v1 baseline. Wrapped in a thin class exposing
`fit(X, y)`, `predict(X)`, `predict_proba(X)`, `feature_importances_()`, and
joblib-based save/load. Architecture is intentionally isolated behind this
wrapper: swapping to PyTorch later is a single-file change with no impact on
loader, features, or metrics code.

**Metrics** (`metrics.py`): computes accuracy, precision, recall, F1,
confusion matrix, and top-20 feature importances. Returns a dict. Prints a
human-readable table when called from scripts.

**train.py CLI:**
```
python -m scripts.train --data training/data --out training/models/v1.joblib
```
Steps: load → extract features → stratified train/test split (80/20) → fit →
report → save.

**eval.py CLI:**
```
python -m scripts.eval --model training/models/v1.joblib --data training/data/holdout
```
Steps: load model → load data → predict → report. For evaluating a trained
model on a separate holdout set.

**gen_fixture.py:** Generates ~20 synthetic "human" traces (Bezier curves with
Gaussian timing jitter) and ~20 synthetic "bot" traces (straight lines with
uniform intervals and perfect tracking). Writes them as JSONL matching the
real schema. Used by the smoke test.

**tests/test_pipeline.py:** pytest smoke test. Runs `gen_fixture.py` into a
temp directory, runs `train.py` on it, asserts accuracy > 0.9 on the held-out
split. Proves the plumbing is correct; says nothing about real-world quality.

### 2C. Files created in Workstream 2

**TypeScript (in `packages/server`):**
- `packages/server/src/logger.ts` — new, ~80 lines
- Edits to `packages/server/src/ball/session.ts` to call `logTrace()` from
  `verify()`
- `packages/server/src/__tests__/logger.test.ts` — new, unit tests for the
  logger

**Python (in `training/`):** the full layout above, all new.

**Other:**
- Root `.gitignore` updated to exclude `training/data/`, `training/models/`,
  `training/__pycache__/`

## Testing strategy

**TypeScript:**
- Existing ball tests under `packages/server/src/ball/__tests__/` get
  fixture updates to include `frameAcks`. Any that still pass must continue
  to pass.
- New tests: one per hard-flag path (`not_tracking`, `inhuman_precision`,
  `no_reaction`, `too_tight`, each frameAck validation rule).
- Logger test: (a) no writes when `LOG_TRACES` unset, (b) startup throws
  when `LOG_TRACES=1` and `LABEL` unset, (c) writes valid JSONL to the
  expected path when both are set.

**Python:** smoke test only. The real test is whether a model trained on real
data generalizes, which is out of scope for this delivery.

## Version plan

- `@007captcha/server` 1.x → 2.0.0
- `@007captcha/client` 1.x → 2.0.0
- `@007captcha/react`  1.x → 2.0.0

Breaking changes:
- Shape and maze challenges removed.
- `method` parameter removed from client/react.
- `@007captcha/client` `verify` flow now produces `frameAcks`; a 1.x client
  talking to a 2.x server will fail ball verification.

Migration notes for the changelog:
- Users must remove `method: 'ball'` (or `'shape'` / `'maze'` / `'random'`)
  from their client init.
- Users on shape or maze must switch to ball.
- Users must upgrade client and server together.

## Risks and open questions

- **R_tight = 80px may be too strict for some legitimate users.** Mitigation:
  adjustable via a config parameter later, once we have real tracking data.
  For v2.0 we ship the conservative default and revisit after corpus
  collection.
- **Clock-alignment math in the frameAck latency check can misbehave on
  clients with significant `performance.now()` drift.** Mitigation: the
  median-offset alignment absorbs constant skew; variance-based checks don't
  care about absolute clock offset. Tested against synthetic traces in
  Workstream 1 tests.
- **The Python feature extractor duplicates ~200 lines of TS scoring math.**
  Accepted cost. FFI or WASM would be more complex than the duplication.
- **Without real data, the Python pipeline can only be validated on synthetic
  fixtures.** Accepted. The smoke test proves plumbing; real quality
  measurement is a follow-up.

## Out of scope (explicit future work)

- Model runtime integration into the server.
- DFT threshold tightening and timing-CV checks.
- Proof-of-work on session start.
- Replay protection via per-submission nonces.
- Ball-frame rendering obfuscation (blur, hue shift, decoy blobs).
- Relabel CLI for retroactive dataset curation.
- PyTorch sequence model (drops into `model.py` when GBM plateaus).
- Active learning / hard-negative mining loop.

## Rollout

Single branch, single 2.0 release. No feature flag (hard cutover is simpler
than a compatibility matrix for a major-version breaking change). Maintainer
updates examples and README in the same PR. Demo server (`pnpm demo`) must
continue to work end-to-end before the PR merges.
