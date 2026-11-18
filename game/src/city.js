// Port Meridian itself: a sun-soaked harbour city generated from a fixed seed.
// Five districts, a road grid with lanes and crosswalks, hundreds of buildings
// with pseudo-3D roofs, a beach and a working harbour along the east and south.

import { makeRng, pick, range, clamp } from './util.js';

export const WORLD_W = 3400;
export const WORLD_H = 2600;
export const ROAD_W = 88;
export const V_ROADS = [260, 700, 1140, 1580, 2020, 2460, 2900];
export const H_ROADS = [280, 640, 1000, 1360, 1720, 2080];
export const WATER_X = 3180;
export const SAND_X = 3050;

export function districtAt(x, y) {
  if (x >= SAND_X) return 'Solmar Beach';
  if (y >= 1880) return 'Harbor District';
  if (y <= 470) return 'Meridian Heights';
  if (x <= 640) return 'Old Market';
  return 'Downtown Meridian';
}

export function isWater(x, y) {
  return x > WATER_X;
}

export function isOnRoad(x, y) {
  for (const rx of V_ROADS) if (Math.abs(x - rx) < ROAD_W / 2) return true;
  for (const ry of H_ROADS) if (Math.abs(y - ry) < ROAD_W / 2) return true;
  return false;
}

// Named places the story and side jobs use. Every name is invented for this game.
export const SITES = [
  { id: 'bar', name: 'The Anchor Bar', x: 618, y: 928, color: '#f0b254' },
  { id: 'garage', name: "Tito's Garage", x: 1496, y: 1796, color: '#7fd4ff' },
  { id: 'clinic', name: 'Meridian Clinic', x: 1062, y: 556, color: '#ff8f8f' },
  { id: 'station', name: 'Port Police Station', x: 1962, y: 928, color: '#8fa8ff' },
  { id: 'warehouse', name: 'Harbor Warehouse 9', x: 828, y: 2264, color: '#ffd98a' },
  { id: 'market', name: 'Old Market Stall 12', x: 352, y: 1276, color: '#a8e07f' },
  { id: 'supply', name: 'Harbor Supply Store', x: 2196, y: 1452, color: '#e0a8ff' },
  { id: 'beachhouse', name: 'Solmar Beach House', x: 2968, y: 1976, color: '#7fffd4' },
  { id: 'heights-house', name: 'Heights Villa', x: 1232, y: 356, color: '#ffb27f' },
  { id: 'pier', name: 'Meridian Pier', x: 3110, y: 2240, color: '#ffe27f' },
];

export function siteById(id) {
  return SITES.find((s) => s.id === id);
}

function nearSite(x, y, r) {
  for (const s of SITES) {
    const dx = s.x - x;
    const dy = s.y - y;
    if (dx * dx + dy * dy < r * r) return true;
  }
  return false;
}

// Build every solid and prop in the city. Deterministic: same seed, same city.
export function buildCity() {
  const rng = makeRng(20261117);
  const buildings = [];
  const props = [];
  const roofPalette = ['#e8dcc4', '#d9c9a8', '#cfd6d4', '#e2b48c', '#b8c4c9', '#d98f6a', '#a8bfb0', '#e6e0d2', '#f2e3b3', '#9fb6c3'];
  const wallPalette = ['#b98d5f', '#a87f56', '#8f9aa0', '#c2a878', '#7f8b99', '#b3764d', '#93a892', '#c9b18c'];

  const blockEdgesX = [-40, ...V_ROADS, WORLD_W];
  const blockEdgesY = [-40, ...H_ROADS, WORLD_H];

  for (let bi = 0; bi < blockEdgesX.length - 1; bi++) {
    for (let bj = 0; bj < blockEdgesY.length - 1; bj++) {
      const bx0 = blockEdgesX[bi] + ROAD_W / 2 + 16;
      const bx1 = blockEdgesX[bi + 1] - ROAD_W / 2 - 16;
      const by0 = blockEdgesY[bj] + ROAD_W / 2 + 16;
      const by1 = blockEdgesY[bj + 1] - ROAD_W / 2 - 16;
      if (bx1 - bx0 < 60 || by1 - by0 < 60) continue;
      const cx = (bx0 + bx1) / 2;
      const cy = (by0 + by1) / 2;
      if (cx > SAND_X - 40) continue;
      const district = districtAt(cx, cy);
      let cols = 2;
      let rows = 2;
      let tall = 26;
      if (district === 'Downtown Meridian') { cols = 2; rows = 2; tall = 95; }
      if (district === 'Meridian Heights') { cols = 3; rows = 2; tall = 16; }
      if (district === 'Harbor District') { cols = 2; rows = 1; tall = 20; }
      if (district === 'Old Market') { cols = 2; rows = 2; tall = 34; }
      if (district === 'Solmar Beach') { cols = 2; rows = 2; tall = 40; }
      const lotW = (bx1 - bx0) / cols;
      const lotH = (by1 - by0) / rows;
      for (let i = 0; i < cols; i++) {
        for (let j = 0; j < rows; j++) {
          if (rng() < 0.1) continue;
          const pad = range(rng, 6, 14);
          const x = bx0 + i * lotW + pad;
          const y = by0 + j * lotH + pad;
          const w = lotW - pad * 2;
          const h = lotH - pad * 2;
          if (w < 34 || h < 30) continue;
          if (nearSite(x + w / 2, y + h / 2, 92)) continue;
          const heightRatio = district === 'Downtown Meridian' ? range(rng, 0.45, 1) : range(rng, 0.3, 0.8);
          buildings.push({
            x, y, w, h,
            h3d: Math.round(tall * heightRatio),
            roof: pick(rng, roofPalette),
            wall: pick(rng, ['#b98d5f', '#a87f56', '#8f9aa0', '#c2a878', '#7f8b99', '#b3764d', '#93a892', '#c9b18c']),
            kind: district === 'Harbor District' ? 'warehouse' : district === 'Meridian Heights' ? 'house' : 'block',
            seed: Math.floor(rng() * 100000),
          });
        }
      }
      // Trees and palms soften the blocks.
      const treeCount = district === 'Solmar Beach' || district === 'Meridian Heights' ? 3 : 1;
      for (let t = 0; t < treeCount; t++) {
        props.push({
          kind: district === 'Solmar Beach' ? 'palm' : 'tree',
          x: range(rng, bx0, bx1),
          y: range(rng, by0, by1),
          r: range(rng, 9, 15),
          seed: Math.floor(rng() * 1000),
        });
      }
    }
  }

  // Palms line the beach, lamps line the avenues, crates crowd the harbour.
  for (let y = 120; y < WORLD_H - 80; y += 130) {
    props.push({ kind: 'palm', x: SAND_X + 34 + (y % 260 === 0 ? 26 : 0), y, r: 14, seed: y });
  }
  for (const rx of V_ROADS) {
    for (let y = 90; y < WORLD_H - 60; y += 300) {
      props.push({ kind: 'lamp', x: rx - ROAD_W / 2 - 10, y, r: 4, seed: y + rx });
    }
  }
  const crateSpots = [];
  for (let i = 0; i < 42; i++) {
    props.push({
      kind: 'crate',
      x: range(rng, 120, 2900),
      y: range(rng, 1980, 2460),
      r: 11,
      seed: Math.floor(rng() * 1000),
    });
  }
  for (let i = 0; i < 16; i++) {
    crateSpots.push({
      id: i,
      x: range(rng, 200, 3000),
      y: i < 9 ? range(rng, 2000, 2440) : range(rng, 240, 2300),
    });
  }
  return { buildings, props, crateSpots };
}

export function collideWithBuildings(body, city) {
  let hit = false;
  for (const b of city.buildings) {
    const nearestX = clamp(body.x, b.x, b.x + b.w);
    const nearestY = clamp(body.y, b.y, b.y + b.h);
    const dx = body.x - nearestX;
    const dy = body.y - nearestY;
    const dSq = dx * dx + dy * dy;
    if (dSq >= body.r * body.r) continue;
    hit = true;
    if (dSq > 0.001) {
      const d = Math.sqrt(dSq);
      body.x = nearestX + (dx / d) * body.r;
      body.y = nearestY + (dy / d) * body.r;
    } else {
      const left = body.x - b.x;
      const right = b.x + b.w - body.x;
      const top = body.y - b.y;
      const bottom = b.y + b.h - body.y;
      const min = Math.min(left, right, top, bottom);
      if (min === left) body.x = b.x - body.r;
      else if (min === right) body.x = b.x + b.w + body.r;
      else if (min === top) body.y = b.y - body.r;
      else body.y = b.y + b.h + body.r;
    }
  }
  body.x = clamp(body.x, 16, WORLD_W - 16);
  body.y = clamp(body.y, 16, WORLD_H - 16);
  const onPier = body.x > 3000 && body.y > 2188 && body.y < 2294;
  if (!onPier && body.x > WATER_X - body.r) body.x = WATER_X - body.r;
  return hit;
}

// ---- Drawing ---------------------------------------------------------------

function drawBuilding(ctx, b, night) {
  const lift = b.h3d * 0.5;
  // Shadow, then the sunlit south wall, then the roof.
  ctx.fillStyle = 'rgba(20, 30, 40, 0.25)';
  ctx.fillRect(b.x + 7, b.y + 9, b.w, b.h);
  ctx.fillStyle = b.wall;
  ctx.beginPath();
  ctx.moveTo(b.x, b.y + b.h);
  ctx.lineTo(b.x + b.w, b.y + b.h);
  ctx.lineTo(b.x + b.w, b.y + b.h - lift);
  ctx.lineTo(b.x, b.y + b.h - lift);
  ctx.closePath();
  ctx.fill();
  // Windows on the south face; lit at night.
  const cols = Math.max(2, Math.floor(b.w / 17));
  const rowsWin = Math.max(1, Math.floor(lift / 15));
  ctx.fillStyle = night > 0.4 ? 'rgba(255, 214, 130, 0.9)' : 'rgba(38, 58, 74, 0.55)';
  for (let i = 0; i < cols; i++) {
    for (let j = 0; j < rowsWin; j++) {
      if ((b.seed + i * 7 + j * 13) % 3 === 0) continue;
      ctx.fillRect(b.x + 6 + i * 17, b.y + b.h - lift + 5 + j * 15, 8, 9);
    }
  }
  ctx.fillStyle = b.roof;
  ctx.fillRect(b.x, b.y - lift, b.w, b.h);
  ctx.strokeStyle = 'rgba(40, 40, 40, 0.35)';
  ctx.lineWidth = 2;
  ctx.strokeRect(b.x, b.y - lift, b.w, b.h);
  if (b.kind === 'warehouse') {
    ctx.fillStyle = 'rgba(70, 80, 88, 0.5)';
    for (let x = b.x + 14; x < b.x + b.w - 10; x += 30) ctx.fillRect(x, b.y - lift + 8, 16, b.h - 16);
  } else if (b.h3d > 55) {
    ctx.fillStyle = 'rgba(90, 100, 108, 0.6)';
    ctx.fillRect(b.x + b.w / 2 - 12, b.y - lift + b.h / 2 - 9, 24, 18);
  }
}

function drawProp(ctx, p, night) {
  if (p.kind === 'palm' || p.kind === 'tree') {
    ctx.fillStyle = 'rgba(20, 30, 40, 0.2)';
    ctx.beginPath();
    ctx.ellipse(p.x + 5, p.y + 6, p.r, p.r * 0.6, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = '#8a6b42';
    ctx.lineWidth = 4;
    ctx.beginPath();
    ctx.moveTo(p.x, p.y + 6);
    ctx.lineTo(p.x, p.y - 6);
    ctx.stroke();
    ctx.fillStyle = p.kind === 'palm' ? '#3f9e4d' : '#2e7d3a';
    for (let i = 0; i < 6; i++) {
      const a = (i / 6) * Math.PI * 2 + p.seed;
      ctx.beginPath();
      ctx.ellipse(p.x + Math.cos(a) * p.r * 0.55, p.y - 8 + Math.sin(a) * p.r * 0.4, p.r * 0.62, p.r * 0.3, a, 0, Math.PI * 2);
      ctx.fill();
    }
  } else if (p.kind === 'lamp') {
    ctx.fillStyle = '#3c4650';
    ctx.fillRect(p.x - 2, p.y - 2, 4, 4);
    if (night > 0.35) {
      const g = ctx.createRadialGradient(p.x, p.y, 2, p.x, p.y, 34);
      g.addColorStop(0, 'rgba(255, 220, 150, 0.35)');
      g.addColorStop(1, 'rgba(255, 220, 150, 0)');
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.arc(p.x, p.y, 34, 0, Math.PI * 2);
      ctx.fill();
    }
  } else if (p.kind === 'crate') {
    ctx.fillStyle = '#9c6b3f';
    ctx.fillRect(p.x - 10, p.y - 10, 20, 20);
    ctx.strokeStyle = '#6e4a26';
    ctx.lineWidth = 2;
    ctx.strokeRect(p.x - 10, p.y - 10, 20, 20);
    ctx.beginPath();
    ctx.moveTo(p.x - 10, p.y - 10);
    ctx.lineTo(p.x + 10, p.y + 10);
    ctx.moveTo(p.x + 10, p.y - 10);
    ctx.lineTo(p.x - 10, p.y + 10);
    ctx.stroke();
  }
}

export function drawWorld(ctx, city, view, night, timeSec) {
  const x0 = view.x - view.w / 2 - 80;
  const y0 = view.y - view.h / 2 - 80;
  const x1 = view.x + view.w / 2 + 80;
  const y1 = view.y + view.h / 2 + 120;

  // Land base by district band.
  ctx.fillStyle = '#79a86b';
  ctx.fillRect(x0, y0, x1 - x0, y1 - y0);
  ctx.fillStyle = '#c9b18c';
  ctx.fillRect(x0, 1880, x1 - x0, WORLD_H - 1880);
  ctx.fillStyle = '#8aa87e';
  ctx.fillRect(x0, y0, x1 - x0, 470 - y0);
  // Sand and animated water on the east shore.
  ctx.fillStyle = '#eed9a0';
  ctx.fillRect(SAND_X, y0, WATER_X - SAND_X, y1 - y0);
  ctx.fillStyle = '#2e7fa8';
  ctx.fillRect(WATER_X, y0, WORLD_W - WATER_X + 200, y1 - y0);
  ctx.strokeStyle = 'rgba(255, 255, 255, 0.35)';
  ctx.lineWidth = 2;
  for (let y = Math.floor(y0 / 46) * 46; y < y1; y += 46) {
    ctx.beginPath();
    for (let x = WATER_X + 8; x < x1; x += 26) {
      const yy = y + Math.sin(timeSec * 1.4 + x * 0.05 + y) * 3;
      if (x === WATER_X + 8) ctx.moveTo(x, yy);
      else ctx.lineTo(x, yy);
    }
    ctx.stroke();
  }
  // The pier reaching into the bay.
  ctx.fillStyle = '#8a6b42';
  ctx.fillRect(3020, 2196, 364, 90);
  ctx.fillStyle = '#6e5433';
  for (let px = 3040; px < 3370; px += 44) ctx.fillRect(px, 2196, 5, 90);

  // Block ground: pavements under the buildings.
  ctx.fillStyle = '#b7ab90';
  for (const b of city.buildings) {
    if (b.x + b.w < x0 || b.x > x1 || b.y + b.h < y0 || b.y > y1) continue;
    ctx.fillRect(b.x - 12, b.y - 12, b.w + 24, b.h + 24);
  }

  // Roads: asphalt, edge lines, dashed centre lines, crosswalks at junctions.
  ctx.fillStyle = '#41474e';
  for (const rx of V_ROADS) ctx.fillRect(rx - ROAD_W / 2, y0, ROAD_W, y1 - y0);
  for (const ry of H_ROADS) ctx.fillRect(x0, ry - ROAD_W / 2, x1 - x0, ROAD_W);
  ctx.strokeStyle = '#e8e4da';
  ctx.lineWidth = 3;
  for (const rx of V_ROADS) {
    ctx.beginPath(); ctx.moveTo(rx - ROAD_W / 2 + 3, y0); ctx.lineTo(rx - ROAD_W / 2 + 3, y1); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(rx + ROAD_W / 2 - 3, y0); ctx.lineTo(rx + ROAD_W / 2 - 3, y1); ctx.stroke();
  }
  for (const ry of H_ROADS) {
    ctx.beginPath(); ctx.moveTo(x0, ry - ROAD_W / 2 + 3); ctx.lineTo(x1, ry - ROAD_W / 2 + 3); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(x0, ry + ROAD_W / 2 - 3); ctx.lineTo(x1, ry + ROAD_W / 2 - 3); ctx.stroke();
  }
  ctx.strokeStyle = '#f5cf5e';
  ctx.lineWidth = 3;
  ctx.setLineDash([22, 18]);
  for (const rx of V_ROADS) { ctx.beginPath(); ctx.moveTo(rx, y0); ctx.lineTo(rx, y1); ctx.stroke(); }
  for (const ry of H_ROADS) { ctx.beginPath(); ctx.moveTo(x0, ry); ctx.lineTo(x1, ry); ctx.stroke(); }
  ctx.setLineDash([]);
  ctx.fillStyle = 'rgba(240, 240, 235, 0.75)';
  for (const rx of V_ROADS) {
    for (const ry of H_ROADS) {
      for (let i = -3; i <= 3; i++) {
        ctx.fillRect(rx + i * 12 - 4, ry - ROAD_W / 2 - 14, 8, 10);
        ctx.fillRect(rx + i * 12 - 4, ry + ROAD_W / 2 + 4, 8, 10);
      }
    }
  }

  for (const p of city.props) {
    if (p.x < x0 || p.x > x1 || p.y < y0 || p.y > y1) continue;
    drawProp(ctx, p, night);
  }
  for (const b of city.buildings) {
    if (b.x + b.w < x0 || b.x > x1 || b.y + b.h < y0 || b.y > y1 + 60) continue;
    drawBuilding(ctx, b, night);
  }

  // Site pads: painted markers with the place name when the player is near.
  ctx.font = 'bold 13px system-ui, sans-serif';
  ctx.textAlign = 'center';
  for (const s of SITES) {
    if (s.x < x0 || s.x > x1 || s.y < y0 || s.y > y1) continue;
    ctx.fillStyle = s.color;
    ctx.globalAlpha = 0.85;
    ctx.beginPath();
    ctx.arc(s.x, s.y, 17, 0, Math.PI * 2);
    ctx.fill();
    ctx.globalAlpha = 1;
    ctx.fillStyle = '#14202b';
    ctx.fillText(s.name.charAt(0), s.x, s.y + 5);
    const dx = s.x - view.x;
    const dy = s.y - view.y;
    if (dx * dx + dy * dy < 340 * 340) {
      ctx.fillStyle = 'rgba(10, 20, 30, 0.72)';
      const label = s.name;
      const w = ctx.measureText(label).width + 16;
      ctx.fillRect(s.x - w / 2, s.y - 44, w, 20);
      ctx.fillStyle = '#ffffff';
      ctx.fillText(label, s.x, s.y - 30);
    }
  }
  ctx.textAlign = 'left';
}
