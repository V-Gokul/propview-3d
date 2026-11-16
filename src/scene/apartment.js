// Apartment mode: turns a list of rooms (name, type, width, length in feet) into
// a furnished 3D floor plan, plus a tower view that highlights the flat's floor.
import * as THREE from 'three';
import { box, cyl, sphere, mat, makeLabel } from './core.js';
import { num, clamp, esc } from '../util.js';

export const ROOM_TYPES = {
  living_dining: 'Living & dining',
  living: 'Living room',
  dining: 'Dining',
  kitchen: 'Kitchen',
  bedroom: 'Bedroom',
  bathroom: 'Bathroom',
  balcony: 'Balcony',
  study: 'Study',
  utility: 'Utility',
  pooja: 'Pooja room',
  foyer: 'Foyer / entry',
  other: 'Other',
};

const WALL_H = 10;
const WALL_T = 0.45;
const FLOOR_T = 0.3;
const PASSAGE = 4; // ft-wide corridor between rows of rooms
const DOOR_TOP = 7.2;

const FLOOR_COLOR = {
  bathroom: '#c9d3d8',
  kitchen: '#e7e1d4',
  utility: '#d6d1c6',
  balcony: '#c4b29a',
  pooja: '#ead9b8',
  default: '#d8b48a',
};
const WALL_COLOR = '#f5f2eb';
const GLASS = { opacity: 0.35 };

/* ---------- layout engine ---------- */

/**
 * Packs rooms into rows (in the order given, balconies last) with a corridor between rows.
 * Row 0 doors open south onto the first corridor; every later row opens north.
 * Returns rooms with x/z (top-left corner, centred around the origin), door side and exterior sides.
 */
export function layoutRooms(rooms) {
  const items = rooms.map((r, idx) => ({ ...r, idx, w: num(r.width), l: num(r.length) }));
  const inside = items.filter((r) => r.type !== 'balcony');
  const balconies = items.filter((r) => r.type === 'balcony');
  const total = inside.reduce((s, r) => s + r.w * r.l, 0) || 1;
  const maxRow = Math.max(Math.sqrt(total) * 1.5, ...items.map((r) => r.w));

  const rows = [];
  let cur = [];
  let x = 0;
  for (const r of inside) {
    if (cur.length && x + r.w > maxRow + 0.01) {
      rows.push(cur);
      cur = [];
      x = 0;
    }
    r.x = x;
    x += r.w;
    cur.push(r);
  }
  if (cur.length) rows.push(cur);

  const width = Math.max(1, ...rows.map((row) => row.reduce((s, r) => s + r.w, 0)), balconies.reduce((s, r) => s + r.w, 0));
  const passages = [];
  let z = 0;
  rows.forEach((row, ri) => {
    const depth = Math.max(...row.map((r) => r.l));
    row.forEach((r, ci) => {
      r.z = ri === 0 ? z + depth - r.l : z; // align each room to the corridor it opens onto
      r.door = ri === 0 ? 'south' : 'north';
      r.ext = { north: ri === 0, south: ri === rows.length - 1, west: ci === 0, east: ci === row.length - 1 };
    });
    z += depth;
    if (ri < rows.length - 1) {
      passages.push({ x: 0, z, w: width, l: PASSAGE });
      z += PASSAGE;
    }
  });

  // Balconies hang off the north face of the front row, above the rooms they line up with.
  // Their open (south) side meets that room's north wall, which gets a glass door.
  let bx = 0;
  for (const b of balconies) {
    b.x = bx;
    bx += b.w;
    const host = rows[0]?.find((r) => r.x < b.x + b.w - 0.5 && r.x + r.w > b.x + 0.5) || rows[0]?.[0];
    const top = host ? host.z : 0;
    b.z = top - b.l;
    b.door = 'south';
    b.ext = { north: true, south: false, west: true, east: true };
    if (host) (host.balconies ||= []).push(b);
  }
  const minZ = Math.min(0, ...balconies.map((b) => b.z));
  const depth = z - minZ;
  const ox = -width / 2;
  const oz = -minZ - depth / 2;
  for (const r of items) {
    r.x += ox;
    r.z += oz;
    r.cx = r.x + r.w / 2;
    r.cz = r.z + r.l / 2;
  }
  for (const p of passages) {
    p.x += ox;
    p.z += oz;
  }
  return { rooms: items, passages, width, depth };
}

/* ---------- walls ---------- */

/** A straight wall along local +x from 0..len with rectangular openings {s, e, bottom, top, glass}. */
function wall(len, openings = []) {
  const g = new THREE.Group();
  const ops = openings.filter((o) => o.e > o.s).sort((a, b) => a.s - b.s);
  let x = 0;
  for (const o of ops) {
    const s = clamp(o.s, 0, len);
    const e = clamp(o.e, 0, len);
    if (s > x) g.add(box(s - x, WALL_H, WALL_T, WALL_COLOR, (x + s) / 2, 0, 0));
    if (o.bottom > 0) g.add(box(e - s, o.bottom, WALL_T, WALL_COLOR, (s + e) / 2, 0, 0));
    g.add(box(e - s, WALL_H - o.top, WALL_T, WALL_COLOR, (s + e) / 2, o.top, 0));
    if (o.glass) {
      g.add(box(e - s, o.top - o.bottom, 0.08, '#9fc6d8', (s + e) / 2, o.bottom, 0, GLASS));
      g.add(box(e - s + 0.2, 0.15, WALL_T + 0.25, '#e4e0d8', (s + e) / 2, o.bottom - 0.15, 0));
    } else {
      // door frame
      g.add(box(0.2, o.top, WALL_T + 0.1, '#b08968', s + 0.1, 0, 0));
      g.add(box(0.2, o.top, WALL_T + 0.1, '#b08968', e - 0.1, 0, 0));
    }
    x = Math.max(x, e);
  }
  if (x < len) g.add(box(len - x, WALL_H, WALL_T, WALL_COLOR, (x + len) / 2, 0, 0));
  return g;
}

function railing(len) {
  const g = new THREE.Group();
  g.add(box(len, 3.4, 0.12, '#9fc6d8', len / 2, 0.3, 0, GLASS));
  g.add(box(len, 0.25, 0.35, '#5c6670', len / 2, 3.6, 0));
  g.add(box(len, 0.3, WALL_T, '#d9d4ca', len / 2, 0, 0));
  return g;
}

/* ---------- furniture (local frame: back wall at z=-l/2, door at +z on the right) ---------- */

function chair(g, x, z, rot = 0) {
  const c = new THREE.Group();
  c.add(box(1.0, 1.5, 1.0, '#6d4c41', 0, 0, 0));
  c.add(box(1.4, 0.2, 1.4, '#c8a27a', 0, 1.5, 0));
  c.add(box(1.4, 1.8, 0.2, '#c8a27a', 0, 1.6, -0.6));
  c.position.set(x, 0, z);
  c.rotation.y = rot;
  g.add(c);
}

function plant(g, x, z, s = 1) {
  g.add(cyl(0.6 * s, 1.4 * s, '#c77d4a', x, 0, z));
  g.add(sphere(1.1 * s, '#5f8f5a', x, 2.3 * s, z));
}

const FURNISH = {
  bedroom(g, w, l) {
    const bw = w >= 12 ? 6 : w >= 9 ? 5 : 3.5;
    const bl = Math.min(6.6, l - 2.5);
    const bx = w >= 9 ? Math.min(1, w / 2 - bw / 2 - 0.6) : 0;
    const bz = -l / 2 + 0.5 + bl / 2;
    g.add(box(bw + 0.6, 3.6, 0.35, '#6d4c41', bx, 0, -l / 2 + 0.45));
    g.add(box(bw + 0.4, 1.3, bl, '#8d6e63', bx, 0, bz));
    g.add(box(bw, 0.6, bl - 0.4, '#f7f4ee', bx, 1.3, bz + 0.1));
    g.add(box(bw + 0.1, 0.25, bl * 0.5, '#e07a5f', bx, 1.85, bz + bl * 0.22));
    g.add(box(bw / 2 - 0.4, 0.5, 1.2, '#ffffff', bx - bw / 4, 1.9, bz - bl / 2 + 1));
    g.add(box(bw / 2 - 0.4, 0.5, 1.2, '#ffffff', bx + bw / 4, 1.9, bz - bl / 2 + 1));
    const tx = bx + bw / 2 + 1.2;
    if (tx + 0.8 < w / 2 - 0.3) {
      g.add(box(1.6, 1.8, 1.6, '#a1887f', tx, 0, -l / 2 + 1.3));
      g.add(sphere(0.45, '#ffe0a3', tx, 2.4, -l / 2 + 1.3, { emissive: '#ffcf70' }));
    }
    if (w >= 9 && l >= 9) {
      const ww = Math.min(l * 0.45, 7);
      g.add(box(2, 7, ww, '#bfa27f', -w / 2 + 1.25, 0, l / 2 - 1.2 - ww / 2));
      g.add(box(0.1, 6.6, 0.1, '#7b5e48', -w / 2 + 2.3, 0.2, l / 2 - 1.2 - ww / 2));
    }
    if (l - bl > 4.5) g.add(box(Math.min(bw + 2, w - 3), 0.05, 3, '#d8cbb3', bx, 0, bz + bl / 2 + 1.7));
  },

  living(g, w, l) {
    const sw = Math.max(3, Math.min(7.5, w - 3));
    const sz = -l / 2 + 0.4 + 1.5;
    g.add(box(Math.min(9, w - 2), 0.05, Math.min(6.5, l - 3.5), '#eadfca', 0, 0, sz + 2.8));
    g.add(box(sw, 1.4, 3, '#5f6f7e', 0, 0, sz));
    g.add(box(sw, 2.9, 0.8, '#5f6f7e', 0, 0, -l / 2 + 0.8));
    g.add(box(0.7, 2.1, 3, '#55636f', -sw / 2 + 0.35, 0, sz));
    g.add(box(0.7, 2.1, 3, '#55636f', sw / 2 - 0.35, 0, sz));
    g.add(box(1.5, 1.3, 0.4, '#e8743b', -sw / 4, 1.4, sz - 0.7));
    g.add(box(1.5, 1.3, 0.4, '#f2c14e', sw / 4, 1.4, sz - 0.7));
    if (l >= 8) g.add(box(Math.min(4, sw * 0.55), 1.2, 2, '#a1887f', 0, 0, sz + 3.3));
    g.add(box(Math.min(5, w * 0.35), 2.8, 0.12, '#d9a441', 0, 5, -l / 2 + 0.3));
    g.add(box(Math.min(2.5, w * 0.18), 2.8, 0.14, '#2f4858', Math.min(2.7, w * 0.19), 5, -l / 2 + 0.31));
    if (w >= 10 && l >= 9) {
      const lu = Math.min(6, l - 4.5);
      g.add(box(1.6, 1.8, lu, '#7b5e48', -w / 2 + 1.1, 0, sz + 3.3));
      g.add(box(0.25, 3, lu * 0.85, '#1f2327', -w / 2 + 0.8, 2.2, sz + 3.3));
    }
    if (w >= 10) plant(g, w / 2 - 1.2, -l / 2 + 1.2);
  },

  dining(g, w, l) {
    const tw = w >= 9 ? 5 : 3.5;
    g.add(box(tw - 0.8, 2.4, 1.4, '#6d4c41', 0, 0, 0));
    g.add(box(tw, 0.2, 3, '#b08968', 0, 2.4, 0));
    const n = tw >= 5 ? 3 : 2;
    for (let i = 0; i < n; i++) {
      const x = -tw / 2 + (tw / n) * (i + 0.5);
      chair(g, x, -2.3, 0);
      chair(g, x, 2.3, Math.PI);
    }
    g.add(cyl(0.04, 1.9, '#333', 0, 7.8, 0));
    g.add(cyl(0.9, 0.7, '#2b2b2b', 0, 7.1, 0));
    g.add(sphere(0.3, '#ffe0a3', 0, 7.1, 0, { emissive: '#ffcf70' }));
  },

  living_dining(g, w, l) {
    const back = new THREE.Group();
    back.position.z = -l * 0.22;
    FURNISH.living(back, w, l * 0.56);
    g.add(back);
    if (l >= 12) {
      const front = new THREE.Group();
      front.position.set(-Math.min(1.5, w * 0.08), 0, l * 0.27);
      FURNISH.dining(front, Math.min(w - 4, 9), l * 0.4);
      g.add(front);
    }
  },

  kitchen(g, w, l) {
    const bz = -l / 2 + 1.25;
    g.add(box(w - 0.6, 3, 2, '#8a9ba8', 0, 0, bz));
    g.add(box(w - 0.6, 0.15, 2.1, '#f3f3f1', 0, 3, bz));
    g.add(box(w - 0.6, 2.4, 1.1, '#d9dee2', 0, 5.6, -l / 2 + 0.8));
    g.add(box(Math.min(2, w * 0.25), 0.1, 1.4, '#222', w * 0.15, 3.15, bz));
    g.add(box(Math.min(1.8, w * 0.22), 0.12, 1.3, '#b0bec5', -w * 0.2, 3.1, bz));
    const len = Math.min(l - 6, l * 0.5);
    if (len > 2 && w >= 6) {
      g.add(box(2, 3, len, '#8a9ba8', -w / 2 + 1.25, 0, -l / 2 + 2.25 + len / 2));
      g.add(box(2.1, 0.15, len, '#f3f3f1', -w / 2 + 1.25, 3, -l / 2 + 2.25 + len / 2));
    }
    if (l >= 9 && w >= 7) g.add(box(2.4, 6, 2.3, '#e0e4e7', -w / 2 + 1.5, 0, l / 2 - 1.6));
  },

  bathroom(g, w, l) {
    g.add(box(1.3, 1.3, 1.9, '#ffffff', -w / 2 + 1.2, 0, -l / 2 + 1.5));
    g.add(box(1.5, 1.6, 0.6, '#f4f4f4', -w / 2 + 1.2, 0.9, -l / 2 + 0.6));
    g.add(box(1.8, 2.7, 1.6, '#b08968', w / 2 - 1.3, 0, -l / 2 + 1.1));
    g.add(box(1.4, 0.3, 1.1, '#ffffff', w / 2 - 1.3, 2.7, -l / 2 + 1.1));
    g.add(box(1.6, 2, 0.1, '#cfe3ea', w / 2 - 1.3, 4.2, -l / 2 + 0.3));
    if (l >= 6 && w >= 6) {
      g.add(box(3, 0.15, 2.6, '#eceff1', -w / 2 + 1.7, 0, l / 2 - 1.6));
      g.add(box(0.08, 6.5, 2.6, '#9fc6d8', -w / 2 + 3.25, 0, l / 2 - 1.6, GLASS));
    }
  },

  balcony(g, w, l) {
    plant(g, -w / 2 + 1, -l / 2 + 1);
    plant(g, w / 2 - 1, -l / 2 + 1, 0.8);
    if (w >= 8 && l >= 4) {
      chair(g, -1.2, 0, Math.PI / 2);
      g.add(cyl(0.9, 2.2, '#a1887f', 0.4, 0, 0));
    }
  },

  study(g, w, l) {
    const dw = Math.min(5, w - 2);
    g.add(box(dw, 0.2, 2.2, '#a1887f', 0, 2.4, -l / 2 + 1.4));
    g.add(box(0.3, 2.4, 2, '#6d4c41', -dw / 2 + 0.3, 0, -l / 2 + 1.4));
    g.add(box(0.3, 2.4, 2, '#6d4c41', dw / 2 - 0.3, 0, -l / 2 + 1.4));
    g.add(box(1.8, 1.2, 0.1, '#1f2327', 0, 2.6, -l / 2 + 0.7));
    chair(g, 0, -l / 2 + 3.2, Math.PI);
    if (w >= 7) g.add(box(1.2, 6, Math.min(5, l - 3), '#7b5e48', -w / 2 + 0.9, 0, 0.5));
  },

  utility(g, w, l) {
    g.add(box(2.2, 2.8, 2.2, '#eceff1', -w / 2 + 1.4, 0, -l / 2 + 1.4));
    g.add(cyl(0.65, 0.05, '#90a4ae', -w / 2 + 1.4, 1.6, -l / 2 + 0.29));
    if (w >= 5) g.add(box(1.4, 0.1, 2.6, '#cfd8dc', w / 2 - 1.1, 5, -l / 2 + 1.5));
  },

  pooja(g, w, l) {
    g.add(box(Math.min(3, w - 1), 2.5, 1.5, '#d4a373', 0, 0, -l / 2 + 1));
    g.add(box(Math.min(2.6, w - 1.4), 3, 0.3, '#f2d49b', 0, 2.5, -l / 2 + 0.5));
    g.add(sphere(0.25, '#ffb347', 0, 2.8, -l / 2 + 1.2, { emissive: '#ff9b2e' }));
  },

  foyer(g, w, l) {
    g.add(box(Math.min(4, w - 1.5), 2.6, 1.2, '#a1887f', -w / 2 + Math.min(4, w - 1.5) / 2 + 0.5, 0, -l / 2 + 0.9));
    g.add(box(Math.min(2.4, w - 2), 3.4, 0.1, '#cfe3ea', -w / 2 + 1.7, 3.2, -l / 2 + 0.3));
    plant(g, w / 2 - 1, -l / 2 + 1, 0.8);
  },

  other(g, w, l) {
    plant(g, -w / 2 + 1, -l / 2 + 1);
  },
};

/* ---------- room + building builders ---------- */

function buildRoom(r, onRoom) {
  const g = new THREE.Group();
  const floorMat = mat(FLOOR_COLOR[r.type] || FLOOR_COLOR.default, { unique: true, roughness: 0.7 });
  const floor = box(r.w, FLOOR_T, r.l, null, r.cx, 0, r.cz, { material: floorMat, shadow: false });
  floor.userData.pick = { kind: 'room', idx: r.idx };
  g.add(floor);

  // openings per side, measured from the west end (north/south) or north end (west/east)
  const ops = { north: [], south: [], west: [], east: [] };
  const dw = r.type === 'bathroom' ? 2.5 : 3;
  let door;
  if (r.w >= dw + 3.5) door = r.door === 'south' ? { s: r.w - 1.5 - dw, e: r.w - 1.5 } : { s: 1.5, e: 1.5 + dw };
  else door = { s: (r.w - dw) / 2, e: (r.w + dw) / 2 };
  ops[r.door].push({ ...door, bottom: 0, top: DOOR_TOP });

  const win = (len) => {
    const ww = r.type === 'bathroom' ? Math.min(2.5, len * 0.5) : Math.min(6, len * 0.5);
    return { s: (len - ww) / 2, e: (len + ww) / 2, bottom: r.type === 'bathroom' ? 5 : 2.8, top: DOOR_TOP, glass: true };
  };
  const opposite = r.door === 'south' ? 'north' : 'south';
  if (r.balconies?.length) {
    // full-height sliding glass door onto each balcony
    for (const b of r.balconies) {
      const s0 = Math.max(b.x, r.x) - r.x;
      const e0 = Math.min(b.x + b.w, r.x + r.w) - r.x;
      const gw = Math.min(6, e0 - s0 - 1);
      if (gw > 2) ops.north.push({ s: (s0 + e0 - gw) / 2, e: (s0 + e0 + gw) / 2, bottom: 0.3, top: DOOR_TOP, glass: true });
    }
    if (r.ext.west) ops.west.push(win(r.l));
    else if (r.ext.east) ops.east.push(win(r.l));
  } else if (r.ext[opposite]) ops[opposite].push(win(r.w));
  else if (r.ext.west) ops.west.push(win(r.l));
  else if (r.ext.east) ops.east.push(win(r.l));

  const sides = {
    north: [r.x, r.z + WALL_T / 2, 0, r.w],
    south: [r.x, r.z + r.l - WALL_T / 2, 0, r.w],
    west: [r.x + WALL_T / 2, r.z, -Math.PI / 2, r.l],
    east: [r.x + r.w - WALL_T / 2, r.z, -Math.PI / 2, r.l],
  };
  const walls = new THREE.Group();
  for (const [side, [px, pz, rot, len]] of Object.entries(sides)) {
    let piece;
    if (r.type === 'balcony') {
      if (side === r.door) continue;
      piece = railing(len);
    } else {
      piece = wall(len, ops[side]);
    }
    piece.position.set(px, 0, pz);
    piece.rotation.y = rot;
    walls.add(piece);
  }
  g.add(walls);

  const f = new THREE.Group();
  (FURNISH[r.type] || FURNISH.other)(f, r.w, r.l);
  f.position.set(r.cx, FLOOR_T, r.cz);
  if (r.door === 'north') f.rotation.y = Math.PI;
  g.add(f);

  const label = makeLabel(
    `<b>${esc(r.name || ROOM_TYPES[r.type] || 'Room')}</b><span>${r.w} × ${r.l} ft</span>`,
    'room-tag',
    () => onRoom?.(r.idx),
  );
  label.position.set(r.cx, WALL_H + 1.5, r.cz);
  g.add(label);

  return { group: g, floor, floorMat, label };
}

function windowTexture() {
  const c = document.createElement('canvas');
  c.width = c.height = 64;
  const x = c.getContext('2d');
  x.fillStyle = '#f2efe8';
  x.fillRect(0, 0, 64, 64);
  x.fillStyle = '#8ea7b5';
  x.fillRect(12, 14, 40, 34);
  x.fillStyle = '#e4e0d8';
  x.fillRect(30, 14, 4, 34);
  x.fillRect(10, 48, 44, 4);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  return t;
}

function buildTower(L, data, onEnter) {
  const g = new THREE.Group();
  const levels = Math.max(0, Math.round(num(data.totalFloors))) + 1; // ground + floors
  const mine = clamp(Math.round(num(data.floor)), 0, levels - 1);
  const FH = 10;
  const TW = L.width * 2 + 10;
  const TD = L.depth + 10;

  const tex = windowTexture();
  tex.repeat.set(Math.max(2, Math.round(TW / 9)), 1);
  const wallMat = new THREE.MeshStandardMaterial({ map: tex, roughness: 0.9 });
  const hlMat = new THREE.MeshStandardMaterial({ color: '#f08a4b', emissive: '#e8622c', emissiveIntensity: 0.35, roughness: 0.6 });

  g.add(box(TW + 30, 0.3, TD + 30, '#cfc9bc', 0, -0.3, 0));
  let hl = null;
  for (let i = 0; i < levels; i++) {
    const y = i * FH;
    const isMine = i === mine;
    const m = box(TW, FH - 0.5, TD, null, 0, y, 0, { material: isMine ? hlMat : wallMat });
    if (isMine) {
      m.userData.pick = { kind: 'floor' };
      hl = m;
    }
    g.add(m);
    g.add(box(TW + 1.2, 0.5, TD + 1.2, '#dcd7cc', 0, y + FH - 0.5, 0));
  }
  const top = levels * FH;
  g.add(cyl(2.4, 4, '#4b5560', -TW * 0.25, top, -TD * 0.15));
  g.add(cyl(2.4, 4, '#4b5560', TW * 0.2, top, TD * 0.1));
  g.add(box(8, 6, 8, '#dcd7cc', 0, top, 0));
  for (const [x, z] of [[-TW / 2 - 10, TD / 2 + 8], [TW / 2 + 10, TD / 2 + 6], [-TW / 2 - 9, -TD / 2 - 6], [TW / 2 + 8, -TD / 2 - 9]]) {
    g.add(cyl(0.6, 6, '#7a5a3c', x, 0, z));
    g.add(sphere(3.6, '#6aa56a', x, 8, z));
  }

  const label = makeLabel(
    `<b>${esc(data.unit || 'Your flat')}</b> · ${mine === 0 ? 'Ground floor' : `Floor ${mine}`}<small>Click to walk in →</small>`,
    'room-tag tag-hl',
    onEnter,
  );
  label.position.set(TW / 2, mine * FH + FH / 2, TD / 2);
  g.add(label);
  return { group: g, pickable: hl, height: top, TW, TD, mineY: mine * FH };
}

/* ---------- public API ---------- */

export function buildApartment(viewer, data, { onRoom, onEnter } = {}) {
  const L = layoutRooms(data.rooms);
  const root = new THREE.Group();
  viewer.content.add(root);

  const plan = new THREE.Group();
  root.add(plan);
  plan.add(box(L.width + 2, 0.3, L.depth + 2, '#cfc8bb', 0, -0.3, 0));
  for (const p of L.passages) plan.add(box(p.w, FLOOR_T * 0.8, p.l, '#e6e1d8', p.x + p.w / 2, 0, p.z + p.l / 2, { shadow: false }));

  const rooms = L.rooms.map((r) => {
    const built = buildRoom(r, onRoom);
    plan.add(built.group);
    viewer.addPickable(built.floor);
    return { ...r, ...built };
  });
  const labels = rooms.map((r) => r.label);

  const tower = buildTower(L, data, onEnter);
  root.add(tower.group);
  if (tower.pickable) viewer.addPickable(tower.pickable);

  const span = Math.max(L.width, L.depth);
  const V = (x, y, z) => new THREE.Vector3(x, y, z);

  function select(idx) {
    rooms.forEach((r) => {
      const on = r.idx === idx;
      r.floorMat.emissive.set(on ? '#e8622c' : '#000000');
      r.floorMat.emissiveIntensity = on ? 0.18 : 0;
      r.label.element.classList.toggle('active', on);
    });
  }

  function show(which) {
    plan.visible = which === 'plan';
    tower.group.visible = which === 'building';
  }

  return {
    rooms,
    layout: L,
    showPlan() {
      show('plan');
      select(null);
      labels.forEach((l) => (l.visible = true));
      viewer.frame(span * 1.6);
      viewer.flyTo(V(span * 0.55, span * 1.0, span * 0.95), V(0, 0, 0));
    },
    showTop() {
      show('plan');
      labels.forEach((l) => (l.visible = true));
      viewer.frame(span * 1.6);
      viewer.flyTo(V(0, span * 1.45, 0.01), V(0, 0, 0));
    },
    showBuilding() {
      show('building');
      select(null);
      const s = Math.max(tower.TW, tower.TD, tower.height);
      viewer.frame(s * 1.4, V(0, 0, 0));
      viewer.flyTo(V(s * 0.95, tower.height * 0.75 + s * 0.25, s * 1.05), V(0, tower.mineY * 0.9 + 5, 0));
    },
    focusRoom(idx) {
      const r = rooms.find((x) => x.idx === idx);
      if (!r) return;
      show('plan');
      select(idx);
      labels.forEach((l) => (l.visible = false));
      viewer.frame(span * 1.6);
      const s = r.door === 'south' ? 1 : -1; // +1: door is on the +z side
      // stand in the doorway (local front-right) and look toward the back-left corner
      const lx = r.w >= 6.5 ? r.w / 2 - 3 : 0;
      const px = r.cx + s * lx;
      const pz = r.cz + s * Math.max(0, r.l / 2 - 1.2);
      const tx = r.cx - s * r.w * 0.18;
      const tz = r.cz - s * r.l * 0.22;
      if (r.w * r.l < 80) {
        // small rooms (bathrooms, utility): dollhouse view from above the walls
        viewer.flyTo(V(r.cx + s * r.w * 0.2, WALL_H + 16, r.cz + s * (r.l / 2 + 3)), V(r.cx, 0, r.cz - s * 0.5), 1200, 50);
        return;
      }
      viewer.flyTo(V(px, 5.4, pz), V(tx, 2.8, tz), 1200, 72);
    },
  };
}
