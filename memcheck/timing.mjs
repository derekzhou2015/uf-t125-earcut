// Timing check: the retention fix must not add per-call allocation churn. Compares steady-state
// wall time of repeated holey triangulations; run identically before/after the fix.
import earcut from '../src/earcut.js';

function holeyPolygon(holeVerts) {
    const vertices = [0, 0, 1000, 0, 1000, 1000, 0, 1000];
    const holes = [4];
    const cx = 500, cy = 500, rOuter = 400, rInner = 300;
    for (let i = 0; i < holeVerts; i++) {
        const r = i % 2 ? rInner : rOuter;
        const a = 2 * Math.PI * i / holeVerts;
        vertices.push(cx + r * Math.cos(a), cy + r * Math.sin(a));
    }
    return {vertices, holes};
}

const {vertices, holes} = holeyPolygon(50000);
for (let i = 0; i < 5; i++) earcut(vertices, holes, 2); // warm up JIT + grow scratch to steady state

const ITERS = 50;
const t0 = performance.now();
let sink = 0;
for (let i = 0; i < ITERS; i++) sink += earcut(vertices, holes, 2).length;
const dt = performance.now() - t0;
console.log(JSON.stringify({iters: ITERS, totalMs: +dt.toFixed(1), perCallMs: +(dt / ITERS).toFixed(3), sink}));
