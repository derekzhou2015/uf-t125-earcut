// Offline heap-retention probe (run with --expose-gc). Not part of the test suite.
import {writeHeapSnapshot} from 'node:v8';
import earcut, {deviation} from '../src/earcut.js';

function gcSync() {
    global.gc({type: 'major', execution: 'sync'});
    global.gc({type: 'major', execution: 'sync'});
}
const heapUsed = () => process.memoryUsage().heapUsed;

// square outer ring + one hole ring with `holeVerts` vertices (a star-ish polygon, all distinct)
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
    return {triangles, dev: deviation(vertices, holes, 2, triangles), n: vertices.length / 2};
}

function runSmall() {
    // a tiny holey polygon; after a big input, high-water slots must not hold the big graph
    const vertices = [0, 0, 10, 0, 10, 10, 0, 10, 3, 3, 7, 3, 7, 7, 3, 7];
    return earcut(vertices, [4], 2);
}

// warm up JIT and module-level scratch
for (let i = 0; i < 3; i++) runSmall();
gcSync();
const baseline = heapUsed();

const {triangles, dev, n} = runBig();
gcSync();
const afterBig = heapUsed();

// keep only primitive output; everything graph-shaped should now be unreachable
const out = triangles.slice();
const outDev = dev;
gcSync();
const afterBigDropped = heapUsed();

const small = runSmall();
gcSync();
const afterSmall = heapUsed();

const snap = writeHeapSnapshot();

console.log(JSON.stringify({
    inputVertices: n,
    triangles: out.length / 3,
    deviation: outDev,
    smallTriangles: small.length / 3,
    heap: {
        baseline,
        afterBig,
        afterBigDropped,
        retainedAfterDrop: afterBigDropped - baseline,
        afterSmall,
        retainedAfterShrink: afterSmall - baseline
    },
    snapshot: snap
}, null, 2));
