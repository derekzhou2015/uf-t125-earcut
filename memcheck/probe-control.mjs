// Control probe: is the post-GC heap delta just high-water *capacity* (slots), or retained objects?
import {writeHeapSnapshot} from 'node:v8';
import earcut, {deviation} from '../src/earcut.js';

function gcSync() {
    global.gc({type: 'major', execution: 'sync'});
    global.gc({type: 'major', execution: 'sync'});
}
const heapUsed = () => process.memoryUsage().heapUsed;

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

function runBig() {
    const {vertices, holes} = holeyPolygon(100000);
    const triangles = earcut(vertices, holes, 2);
    return {dev: deviation(vertices, holes, 2, triangles), count: triangles.length};
}
function runSmall() {
    const vertices = [0, 0, 10, 0, 10, 10, 0, 10, 3, 3, 7, 3, 7, 7, 3, 7];
    return earcut(vertices, [4], 2).length;
}

for (let i = 0; i < 3; i++) runSmall();
gcSync();
const base = heapUsed();

// control arm: only small calls, no big input ever
for (let i = 0; i < 5; i++) runSmall();
gcSync();
const controlOnly = heapUsed();

// experiment arm: big input then drop, repeated to prove no monotonic growth
const deltas = [];
const r1 = runBig(); gcSync(); deltas.push(heapUsed() - base);
const r2 = runBig(); gcSync(); deltas.push(heapUsed() - base);
runSmall(); gcSync();
const afterShrink = heapUsed() - base;

// re-snapshot on the current (fixed) build for the record
const snap = writeHeapSnapshot();
console.log(JSON.stringify({
    results: [r1, r2],
    controlArmSmallCallsDelta: controlOnly - base,
    afterEachBigDelta: deltas,
    afterShrinkDelta: afterShrink,
    monotonicGrowthAcrossBigCalls: deltas[1] > deltas[0] + 256 * 1024,
    snapshot: snap
}, null, 2));
