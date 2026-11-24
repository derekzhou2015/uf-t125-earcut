// Minimal offline heap-snapshot analyzer: find earcut Node objects kept alive by module arrays.
// Usage: node memcheck/analyze-snapshot.mjs <file.heapsnapshot>
import fs from 'node:fs';

const snap = JSON.parse(fs.readFileSync(process.argv[2], 'utf8'));
const {nodes, edges, strings} = snap;
const NF = 6; // type, name, id, self_size, edge_count, detachedness
const EF = 3; // type, name_or_index, to_node
const nodeCount = nodes.length / NF;
const edgeStart = new Uint32Array(nodeCount + 1);
{
    let off = 0;
    for (let i = 0; i < nodeCount; i++) {
        edgeStart[i] = off;
        off += nodes[i * NF + 4];
    }
    edgeStart[nodeCount] = edges.length / EF;
}
const NODE_TYPES = snap.snapshot.meta.node_types[0];
const EDGE_TYPES = snap.snapshot.meta.edge_types[0];
const typeName = i => NODE_TYPES[nodes[i * NF]];
const nodeName = i => strings[nodes[i * NF + 1]];
const selfSize = i => nodes[i * NF + 3];
const edgeName = (e) => {
    const t = EDGE_TYPES[edges[e * EF]];
    return t === 'property' || t === 'internal' ? strings[edges[e * EF + 1]] : `[${t}]`;
};

// count plain objects matching the earcut Node shape (i/x/y/z/prev/next/prevZ/nextZ)
let nodeObjs = 0, nodeBytes = 0;
const samples = [];
for (let i = 0; i < nodeCount; i++) {
    if (typeName(i) !== 'object' || nodeName(i) !== 'Object') continue;
    let hasPrev = false, hasNext = false, hasPrevZ = false, hasNextZ = false, propCount = 0;
    for (let e = edgeStart[i]; e < edgeStart[i + 1]; e++) {
        if (EDGE_TYPES[edges[e * EF]] !== 'property') continue;
        propCount++;
        const pn = strings[edges[e * EF + 1]];
        if (pn === 'prev') hasPrev = true;
        if (pn === 'next') hasNext = true;
        if (pn === 'prevZ') hasPrevZ = true;
        if (pn === 'nextZ') hasNextZ = true;
    }
    // numeric fields (i/x/y/z) are heap numbers / SMI, not property edges; the four links identify a Node
    if (hasPrev && hasNext && hasPrevZ && hasNextZ && propCount >= 4) {
        nodeObjs++;
        nodeBytes += selfSize(i);
        if (samples.length < 3) samples.push(i);
    }
}
console.log(`earcut-node-shaped objects: ${nodeObjs}, self bytes: ${nodeBytes}`);

// reverse adjacency for retainer-chain BFS up to a GC root (synthetic node)
const reverse = new Map();
for (let i = 0; i < nodeCount; i++) {
    for (let e = edgeStart[i]; e < edgeStart[i + 1]; e++) {
        const to = edges[e * EF + 2] / NF;
        if (!reverse.has(to)) reverse.set(to, []);
        reverse.get(to).push([i, edgeName(e)]);
    }
}

function shortestPath(target) {
    const prev = new Map([[target, null]]);
    const q = [target];
    while (q.length) {
        const cur = q.shift();
        for (const [src, en] of (reverse.get(cur) || [])) {
            if (prev.has(src)) continue;
            prev.set(src, [cur, en]);
            if (typeName(src) === 'synthetic') {
                const chain = [];
                let n2 = src;
                while (n2 !== target) {
                    const [nxt, edge] = prev.get(n2);
                    chain.push(`${typeName(n2)} "${nodeName(n2)}" --${edge}-->`);
                    n2 = nxt;
                }
                chain.push(`${typeName(target)} "${nodeName(target)}"`);
                return chain.join('\n  ');
            }
            q.push(src);
        }
    }
    return '(no root path)';
}

for (const m of samples) {
    console.log('\nRetainer chain to a retained node:');
    console.log(`  ${  shortestPath(m)}`);
}
