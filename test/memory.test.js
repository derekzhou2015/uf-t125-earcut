// Memory-retention regressions for the hole-bridge block index. The two module-level node-ref
// arrays (blockHead/blockStop) used to keep the previous call's whole node graph reachable — a
// single ref reaches the entire ring through prev/next — so the high-water mark grew with the
// largest holey input ever seen and never came back. Same class of leak for the steiners Set.
//
// These tests need an explicit GC to make "unreachable" observable, so they skip unless node is
// run with --expose-gc (see the "test:mem" npm script); plain `npm test` keeps running them as
// skips rather than failing. The probe asserts on heapUsed *growth*, which measures retained
// objects: the surviving high-water state after the fix is plain numeric/typed-array capacity,
// not node-graph references.
import test from 'node:test';
import assert from 'node:assert/strict';
import earcut, {deviation} from '../src/earcut.js';

const gcExposed = typeof globalThis.gc === 'function';

function gcSync() {
    globalThis.gc({type: 'major', execution: 'sync'});
    globalThis.gc({type: 'major', execution: 'sync'});
}
const heapUsed = () => process.memoryUsage().heapUsed;

// square outer ring plus one hole ring of `holeVerts` distinct vertices (alternating-radius star)
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

// triangulate inside a helper so only the primitive triangle indices survive the return;
// the coordinate array and every node graph object are unreachable once it returns
function triangulate(holeVerts) {
    const {vertices, holes} = holeyPolygon(holeVerts);
    const triangles = earcut(vertices, holes, 2);
    return {count: triangles.length, dev: deviation(vertices, holes, 2, triangles)};
}

function smallHoleyCall() {
    const vertices = [0, 0, 10, 0, 10, 10, 0, 10, 3, 3, 7, 3, 7, 7, 3, 7];
    return earcut(vertices, [4], 2).length / 3; // 4 outer + 4 hole verts -> 8 triangles
}

// The retained graph from a 100k-vertex hole ring is multi-megabyte (observed ~13 MB); surviving
// numeric/typed-array capacity after the fix is ~2 MB, so 5 MB separates the two with margin
// while tolerating heapUsed jitter. Re-measure after a second GC so a single lazy collection
// can't flake the test.
function assertRetainedUnderBaseline(baseline, limitBytes) {
    gcSync();
    let delta = heapUsed() - baseline;
    if (delta > limitBytes) {
        gcSync();
        delta = heapUsed() - baseline;
    }
    assert.ok(delta <= limitBytes,
        `node graph retained after call returned: ${(delta / 1048576).toFixed(2)} MB > ${(limitBytes / 1048576).toFixed(1)} MB limit`);
}

test('holey polygon node graph is collectable after the call returns', {skip: !gcExposed && 'run with --expose-gc'}, () => {
    // warm up JIT and grow module scratch to steady state so the measurement isn't allocation noise
    for (let i = 0; i < 3; i++) {
        const r = triangulate(2000);
        assert.ok(r.dev < 1e-9);
    }
    gcSync();
    const baseline = heapUsed();

    const big = triangulate(100000);
    assert.equal(big.count / 3, 100004);
    assert.ok(big.dev < 1e-9, 'triangulation stays correct');

    assertRetainedUnderBaseline(baseline, 5 * 1048576);
});

test('shrinking inputs release the previous high-water slots', {skip: !gcExposed && 'run with --expose-gc'}, () => {
    for (let i = 0; i < 3; i++) assert.equal(smallHoleyCall(), 8);
    gcSync();
    const baseline = heapUsed();

    // establish a large high-water mark, then drop to tiny inputs; the big graph must not be
    // pinned by stale blockHead/blockStop slots beyond the small call's own footprint
    const big = triangulate(100000);
    assert.ok(big.dev < 1e-9);
    for (let i = 0; i < 3; i++) assert.equal(smallHoleyCall(), 8);

    assertRetainedUnderBaseline(baseline, 5 * 1048576);

    // and a second large call must not pile another graph on top of the first (no monotonic drift)
    const beforeSecond = heapUsed();
    const again = triangulate(100000);
    assert.ok(again.dev < 1e-9);
    gcSync();
    const drift = heapUsed() - beforeSecond;
    assert.ok(drift <= 5 * 1048576,
        `heap grew by ${(drift / 1048576).toFixed(2)} MB on a repeated equal-size call`);
});
