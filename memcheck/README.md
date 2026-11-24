# Offline memory-retention tooling

These scripts are **not** part of the test suite (the suite's GC-gated regressions live in
`test/memory.test.js`). They are the offline probes used to diagnose and re-verify the
hole-bridge block-index retention. All require manual GC, so always pass `--expose-gc`.

- `probe.mjs` — runs a 100k-vertex holey polygon, drops it, then a tiny one; prints
  `process.memoryUsage().heapUsed` deltas after forced major GCs and writes a heap snapshot.
- `probe-control.mjs` — separates retained *objects* from surviving numeric *capacity*: a
  control arm runs only small calls, the experiment arm runs big calls twice to prove the
  post-GC delta is flat (no monotonic growth) and shrinks after a small call.
- `analyze-snapshot.mjs <file.heapsnapshot>` — walks a V8 heap snapshot, counts retained
  earcut-node-shaped objects, and prints a retainer chain (module-context Array → node ring).
- `timing.mjs` — steady-state wall time per holey triangulation, to confirm the fix adds no
  per-call allocation/churn (run before/after with `git stash`).

Run from the repo root, e.g.:

```sh
node --expose-gc memcheck/probe-control.mjs
node --expose-gc memcheck/probe.mjs
node --max-old-space-size=4096 memcheck/analyze-snapshot.mjs Heap.<...>.heapsnapshot
node memcheck/timing.mjs
```

Generated `*.heapsnapshot` files are git-ignored.
