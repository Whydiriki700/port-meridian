// Vehicles for Port Meridian: original models, stealable parked cars, lane
// traffic that cruises the grid and turns at junctions, and the driving model
// the player uses once behind the wheel.

import { clamp, distance, angleDiff, makeRng, pick, range } from './util.js';
import { V_ROADS, H_ROADS, ROAD_W, WORLD_W, WORLD_H, collideWithBuildings } from './city.js';

export const VEHICLE_MODELS = {
  kestrel: { name: 'Kestrel Sedan', length: 46, width: 22, accel: 210, maxSpeed: 330, reverse: 110, grip: 3.4, colors: ['#c94f42', '#4a7fb5', '#d9d4c5', '#5d8a66', '#8067a8', '#c7a23a'] },
  bantam: { name: 'Bantam Hatch', length: 40, width: 21, accel: 185, maxSpeed: 285, reverse: 100, grip: 3.8, colors: ['#e07b39', '#7fb069', '#e6e6e6', '#5885af', '#d1607d'] },
  solstice: { name: 'Solstice GT', length: 48, width: 22, accel: 300, maxSpeed: 430, reverse: 120, grip: 3.1, colors: ['#f2b705', '#e33e2b'] },
  dockmaster: { name: 'Dockmaster Van', length: 54, width: 25, accel: 160, maxSpeed: 260, reverse: 95, grip: 3.9, colors: ['#d8d8d8', '#7a8b99', '#4f772d'] },
  pickup: { name: 'Harbor Pickup', length: 50, width: 23, accel: 195, maxSpeed: 300, reverse: 105, grip: 3.6, colors: ['#99582a', '#4361ee', '#6c757d', '#bc4749'] },
  taxi: { name: 'Caballo Taxi', length: 46, width: 22, accel: 205, maxSpeed: 315, reverse: 110, grip: 3.5, colors: ['#f7c548'] },
  interceptor: { name: 'MPP Interceptor', length: 47, width: 22, accel: 265, maxSpeed: 395, reverse: 120, grip: 3.2, colors: ['#eef1f4'] },
};

let nextVehicleId = 1;

export class Vehicle {
  constructor(modelKey, x, y, angle, color) {
    const model = VEHICLE_MODELS[modelKey];
    this.id = nextVehicleId++;
    this.modelKey = modelKey;
    this.model = model;
    this.name = model.name;
    this.x = x;
    this.y = y;
    this.angle = angle;
    this.speed = 0;
    this.color = color || model.colors[0];
    this.r = model.length * 0.42;
    this.health = 100;
    this.mode = 'parked'; // parked | traffic | player | police | fleeing | abandoned
    this.steer = 0;
    this.honkTimer = 0;
    this.dead = false;
    // Traffic lane state.
    this.axis = 'v';
    this.dir = 1;
    this.road = 0;
    this.cruise = 150;
    this.turnCooldown = 0;
  }

  get moving() {
    return Math.abs(this.speed) > 4;
  }

  frontX() {
    return this.x + Math.cos(this.angle) * this.model.length * 0.5;
  }

  frontY() {
    return this.y + Math.sin(this.angle) * this.model.length * 0.5;
  }
}

function lanePoint(vehicle) {
  // Right-hand traffic: offset to the right of the direction of travel.
  if (vehicle.axis === 'v') {
    return { x: vehicle.road + vehicle.dir * 22, y: vehicle.y };
  }
  return { x: vehicle.x, y: vehicle.road + vehicle.dir * 22 };
}

export function makeTrafficVehicle(rng, city) {
  const axis = rng() < 0.5 ? 'v' : 'h';
  const road = axis === 'v' ? pick(rng, V_ROADS) : pick(rng, H_ROADS);
  const dir = rng() < 0.5 ? 1 : -1;
  const along = range(rng, 140, (axis === 'v' ? WORLD_H : WORLD_W) - 140);
  const keys = ['kestrel', 'bantam', 'dockmaster', 'pickup', 'taxi', 'bantam', 'kestrel'];
  const key = pick(rng, keys);
  const v = new Vehicle(key, 0, 0, 0, pick(rng, VEHICLE_MODELS[key].colors));
  v.mode = 'traffic';
  v.axis = axis;
  v.dir = dir;
  v.road = road;
  v.cruise = range(rng, 120, 185);
  if (axis === 'v') {
    v.x = road + dir * 22;
    v.y = along;
    v.angle = dir > 0 ? Math.PI / 2 : -Math.PI / 2;
  } else {
    v.x = along;
    v.y = road + dir * 22;
    v.angle = dir > 0 ? 0 : Math.PI;
  }
  return v;
}

export function spawnTraffic(count) {
  const rng = makeRng(777);
  const list = [];
  for (let i = 0; i < count; i++) list.push(makeTrafficVehicle(rng));
  return list;
}

export function spawnParkedCars() {
  const rng = makeRng(4242);
  const list = [];
  const keys = ['kestrel', 'bantam', 'pickup', 'dockmaster', 'bantam', 'kestrel'];
  for (let i = 0; i < 22; i++) {
    const vertical = rng() < 0.6;
    const road = vertical ? pick(rng, V_ROADS) : pick(rng, H_ROADS);
    const side = rng() < 0.5 ? -1 : 1;
    let along = range(rng, 160, (vertical ? WORLD_H : WORLD_W) - 160);
    // Keep clear of junctions.
    const cross = vertical ? H_ROADS : V_ROADS;
    for (const c of cross) if (Math.abs(along - c) < 96) along += 150;
    const key = pick(rng, keys);
    let x;
    let y;
    let angle;
    if (vertical) {
      x = road + side * (ROAD_W / 2 + 17);
      y = along;
      angle = side > 0 ? Math.PI / 2 : -Math.PI / 2;
    } else {
      x = along;
      y = road + side * (ROAD_W / 2 + 17);
      angle = side > 0 ? 0 : Math.PI;
    }
    if (x > 3030) continue;
    list.push(new Vehicle(key, x, y, angle, pick(rng, VEHICLE_MODELS[key].colors)));
  }
  // The Solstice GT the story needs, parked at the Heights Villa.
  const gt = new Vehicle('solstice', 1286, 402, Math.PI / 2, '#f2b705');
  gt.isStoryCar = true;
  list.push(gt);
  // A Dockmaster van waits at Harbor Warehouse 9 for the cargo run.
  const van = new Vehicle('dockmaster', 880, 2210, 0, '#7a8b99');
  van.isCargoVan = true;
  list.push(van);
  return list;
}

function trafficThink(v, dt, world) {
  v.turnCooldown -= dt;
  const target = lanePoint(v);
  const desired = Math.atan2(target.y - v.y, target.x - v.x);
  // Follow the lane: steer toward the lane line ahead.
  const lookX = v.x + Math.cos(v.angle) * 60;
  const lookY = v.y + Math.sin(v.angle) * 60;
  const laneAhead = v.axis === 'v' ? { x: v.road + v.dir * 22, y: lookY } : { x: lookX, y: v.road + v.dir * 22 };
  const steerTo = Math.atan2(laneAhead.y - v.y, laneAhead.x - v.x);
  v.angle += clamp(angleDiff(v.angle, steerTo), -1.6 * dt, 1.6 * dt);

  // Slow for anything ahead: another car, the player, a pedestrian in the road.
  let targetSpeed = v.cruise;
  for (const other of world.vehicles) {
    if (other === v || other.dead) continue;
    const d = distance(v.frontX(), v.frontY(), other.x, other.y);
    if (d < 74 && Math.abs(angleDiff(v.angle, Math.atan2(other.y - v.y, other.x - v.x))) < 0.6) {
      targetSpeed = Math.min(targetSpeed, Math.max(0, other.speed * 0.8 - 6));
    }
  }
  const p = world.player;
  const pBody = p.inVehicle ? p.vehicle : p;
  const dp = distance(v.frontX(), v.frontY(), pBody.x, pBody.y);
  if (dp < 66 && Math.abs(angleDiff(v.angle, Math.atan2(pBody.y - v.y, pBody.x - v.x))) < 0.7) {
    targetSpeed = 0;
    v.honkTimer -= dt;
    if (v.honkTimer <= 0) {
      v.honkTimer = 2.4;
      world.events.push({ type: 'honk', x: v.x, y: v.y });
    }
  }
  if (v.speed < targetSpeed) v.speed = Math.min(targetSpeed, v.speed + v.model.accel * 0.55 * dt);
  else v.speed = Math.max(targetSpeed, v.speed - 320 * dt);

  v.x += Math.cos(v.angle) * v.speed * dt;
  v.y += Math.sin(v.angle) * v.speed * dt;

  // Turn at junctions sometimes, like a driver with somewhere to be.
  if (v.turnCooldown <= 0) {
    const cross = v.axis === 'v' ? H_ROADS : V_ROADS;
    for (const c of cross) {
      const along = v.axis === 'v' ? v.y : v.x;
      if (Math.abs(along - c) < 10 && Math.random() < 0.4) {
        const newDir = Math.random() < 0.5 ? 1 : -1;
        const oldRoad = v.road;
        v.axis = v.axis === 'v' ? 'h' : 'v';
        v.road = c;
        v.dir = newDir;
        if (v.axis === 'h') { v.y = c + newDir * 22; v.x = oldRoad + (v.dir > 0 ? 0 : 0); }
        else { v.x = c + newDir * 22; }
        v.turnCooldown = 3;
        break;
      }
    }
  }
  // Wrap around the city edge instead of leaving the world.
  if (v.x < 40) { v.x = 40; v.dir = Math.abs(v.dir); if (v.axis === 'h') v.dir = 1; }
  if (v.y < 40) { v.y = 40; if (v.axis === 'v') v.dir = 1; }
  if (v.x > WORLD_W - 60) { v.x = WORLD_W - 60; if (v.axis === 'h') v.dir = -1; }
  if (v.y > WORLD_H - 40) { v.y = WORLD_H - 40; if (v.axis === 'v') v.dir = -1; }
}

export function updateVehicle(v, dt, world) {
  if (v.dead) return;
  if (v.mode === 'traffic') {
    trafficThink(v, dt, world);
    collideWithBuildings(v, world.city);
  } else if (v.mode === 'fleeing') {
    // A frightened driver floors it straight ahead and steers away from the player.
    const away = Math.atan2(v.y - world.player.y, v.x - world.player.x);
    v.angle += clamp(angleDiff(v.angle, away), -2 * dt, 2 * dt);
    v.speed = Math.min(v.model.maxSpeed * 0.8, v.speed + v.model.accel * dt);
    v.x += Math.cos(v.angle) * v.speed * dt;
    v.y += Math.sin(v.angle) * v.speed * dt;
    collideWithBuildings(v, world.city);
    if (distance(v.x, v.y, world.player.x, world.player.y) > 620) v.mode = 'traffic';
  } else if (v.mode !== 'player' && v.mode !== 'police') {
    // Parked or abandoned: roll to a stop.
    v.speed *= Math.max(0, 1 - 3 * dt);
    v.x += Math.cos(v.angle) * v.speed * dt;
    v.y += Math.sin(v.angle) * v.speed * dt;
  }
}

// Player driving: arcade physics with drift, handbrake and building crashes.
export function drivePlayerVehicle(v, input, dt, world) {
  const model = v.model;
  const forward = input.down('KeyW', 'ArrowUp');
  const back = input.down('KeyS', 'ArrowDown');
  const left = input.down('KeyA', 'ArrowLeft');
  const right = input.down('KeyD', 'ArrowRight');
  const handbrake = input.down('ShiftLeft', 'ShiftRight', 'Space');

  if (forward) v.speed += model.accel * dt * (v.speed < 0 ? 2.2 : 1);
  if (back) v.speed -= (v.speed > 4 ? 340 : model.accel * 0.7) * dt;
  if (!forward && !back) {
    v.speed -= v.speed * 0.55 * dt;
    if (Math.abs(v.speed) < 3) v.speed = 0;
  }
  if (handbrake) v.speed -= v.speed * 2.4 * dt;
  v.speed = clamp(v.speed, -model.reverse, model.maxSpeed * (v.health < 30 ? 0.55 : 1));

  const steerInput = (left ? -1 : 0) + (right ? 1 : 0);
  v.steer += clamp(steerInput - v.steer, -6 * dt, 6 * dt);
  const speedRatio = clamp(Math.abs(v.speed) / model.maxSpeed, 0, 1);
  const turnRate = v.steer * (1.15 + speedRatio * 0.75) * (handbrake ? 1.5 : 1);
  if (Math.abs(v.speed) > 2) v.angle += turnRate * dt * Math.sign(v.speed);

  const beforeX = v.x;
  const beforeY = v.y;
  v.x += Math.cos(v.angle) * v.speed * dt;
  v.y += Math.sin(v.angle) * v.speed * dt;
  const hit = collideWithBuildings(v, world.city);
  if (hit && Math.abs(v.speed) > 130) {
    const impact = Math.abs(v.speed);
    v.health -= impact * 0.045;
    v.speed *= -0.25;
    world.events.push({ type: 'crash', x: v.x, y: v.y, power: impact / 400, byPlayer: true });
  } else if (hit) {
    v.speed *= 0.4;
    v.x = beforeX + (v.x - beforeX) * 0.4;
    v.y = beforeY + (v.y - beforeY) * 0.4;
  }
  // Tyre smoke and skids when sliding hard.
  const sliding = Math.abs(v.steer) > 0.6 && speedRatio > 0.45;
  return { sliding, speedRatio, handbrake };
}

// Soft vehicle-to-vehicle bumps with damage on hard hits.
export function collideVehicles(vehicles, world) {
  for (let i = 0; i < vehicles.length; i++) {
    const a = vehicles[i];
    if (a.dead) continue;
    for (let j = i + 1; j < vehicles.length; j++) {
      const b = vehicles[j];
      if (b.dead) continue;
      const d = distance(a.x, a.y, b.x, b.y);
      const min = (a.r + b.r) * 0.92;
      if (d <= 0.01 || d >= min) continue;
      const nx = (b.x - a.x) / d;
      const ny = (b.y - a.y) / d;
      const overlap = (min - d) / 2;
      const aFixed = a.mode === 'parked';
      const bFixed = b.mode === 'parked';
      if (!aFixed) { a.x -= nx * overlap; a.y -= ny * overlap; }
      if (!bFixed) { b.x += nx * overlap; b.y += ny * overlap; }
      const rel = Math.abs(a.speed - b.speed);
      if (rel > 120) {
        const dmg = rel * 0.05;
        a.health -= dmg;
        b.health -= dmg;
        const byPlayer = a.mode === 'player' || b.mode === 'player';
        world.events.push({ type: 'crash', x: (a.x + b.x) / 2, y: (a.y + b.y) / 2, power: rel / 380, byPlayer, otherIsPolice: a.modelKey === 'interceptor' || b.modelKey === 'interceptor' });
        a.speed *= 0.55;
        b.speed *= 0.55;
      } else {
        a.speed *= 0.85;
        b.speed *= 0.85;
      }
      if (a.health <= 0 && !a.dead) { a.dead = true; a.speed = 0; world.events.push({ type: 'vehicle-dead', vehicle: a }); }
      if (b.health <= 0 && !b.dead) { b.dead = true; b.speed = 0; world.events.push({ type: 'vehicle-dead', vehicle: b }); }
    }
  }
}

export function drawVehicle(ctx, v, night, timeSec) {
  const L = v.model.length;
  const W = v.model.width;
  ctx.save();
  ctx.translate(v.x, v.y);
  ctx.rotate(v.angle);
  // Shadow and body.
  ctx.fillStyle = 'rgba(15, 25, 35, 0.3)';
  ctx.fillRect(-L / 2 + 4, -W / 2 + 5, L, W);
  ctx.fillStyle = v.dead ? '#3a3f45' : v.color;
  roundRect(ctx, -L / 2, -W / 2, L, W, 6);
  ctx.fill();
  ctx.strokeStyle = 'rgba(20, 20, 20, 0.45)';
  ctx.lineWidth = 1.5;
  ctx.stroke();
  if (v.modelKey === 'interceptor') {
    ctx.fillStyle = '#274b8f';
    ctx.fillRect(-L / 2, -W / 2, L * 0.3, W);
    ctx.fillRect(L * 0.22, -W / 2, L * 0.28, W);
    const flash = Math.sin(timeSec * 10) > 0;
    ctx.fillStyle = flash ? '#ff4444' : '#4477ff';
    ctx.fillRect(-6, -W / 2 + 3, 12, 5);
    ctx.fillStyle = flash ? '#4477ff' : '#ff4444';
    ctx.fillRect(-6, W / 2 - 8, 12, 5);
  }
  if (v.modelKey === 'taxi') {
    ctx.fillStyle = '#14202b';
    ctx.fillRect(-5, -6, 11, 12);
    ctx.fillStyle = '#ffd94d';
    ctx.fillRect(-3, -4, 7, 8);
  }
  // Cabin, windshield and rear window.
  ctx.fillStyle = 'rgba(24, 38, 52, 0.9)';
  roundRect(ctx, -L * 0.16, -W / 2 + 3.5, L * 0.34, W - 7, 4);
  ctx.fill();
  ctx.fillStyle = 'rgba(140, 190, 220, 0.65)';
  ctx.fillRect(L * 0.13, -W / 2 + 4.5, 4, W - 9);
  ctx.fillRect(-L * 0.24, -W / 2 + 4.5, 3.4, W - 9);
  // Wheels.
  ctx.fillStyle = '#16181c';
  const wy = W / 2 - 1;
  ctx.fillRect(-L / 2 + 5, -wy - 2.4, 9, 4.6);
  ctx.fillRect(-L / 2 + 5, wy - 2.2, 9, 4.6);
  ctx.fillRect(L / 2 - 14, -wy - 2.4, 9, 4.6);
  ctx.fillRect(L / 2 - 14, wy - 2.2, 9, 4.6);
  // Headlights and tail lights.
  ctx.fillStyle = '#fff6c9';
  ctx.fillRect(L / 2 - 2, -W / 2 + 2.5, 3, 4.6);
  ctx.fillRect(L / 2 - 2, W / 2 - 7.1, 3, 4.6);
  ctx.fillStyle = '#d23b2e';
  ctx.fillRect(-L / 2 - 1, -W / 2 + 2.5, 3, 4.6);
  ctx.fillRect(-L / 2 - 1, W / 2 - 7.1, 3, 4.6);
  ctx.restore();

  // Headlight cones after dark.
  if (night > 0.35 && !v.dead) {
    ctx.save();
    ctx.translate(v.x, v.y);
    ctx.rotate(v.angle);
    const grad = ctx.createLinearGradient(L / 2, 0, L / 2 + 120, 0);
    grad.addColorStop(0, 'rgba(255, 240, 180, 0.20)');
    grad.addColorStop(1, 'rgba(255, 240, 180, 0)');
    ctx.fillStyle = grad;
    ctx.beginPath();
    ctx.moveTo(L / 2, -8);
    ctx.lineTo(L / 2 + 120, -30);
    ctx.lineTo(L / 2 + 120, 30);
    ctx.lineTo(L / 2, 8);
    ctx.closePath();
    ctx.fill();
    ctx.restore();
  }
  // A name tag for the story cars so players can spot them.
  if (v.isStoryCar || v.isCargoVan) {
    ctx.fillStyle = 'rgba(10, 20, 30, 0.7)';
    ctx.font = 'bold 11px system-ui, sans-serif';
    ctx.textAlign = 'center';
    const label = v.isStoryCar ? 'Solstice GT' : 'Cargo Van';
    const w = ctx.measureText(label).width + 12;
    ctx.fillRect(v.x - w / 2, v.y - 44, w, 17);
    ctx.fillStyle = '#ffd98a';
    ctx.fillText(label, v.x, v.y - 31);
    ctx.textAlign = 'left';
  }
}

export function roundRect(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.lineTo(x + w - r, y);
  ctx.arcTo(x + w, y, x + w, y + r, r);
  ctx.lineTo(x + w, y + h - r);
  ctx.arcTo(x + w, y + h, x + w - r, y + h, r);
  ctx.lineTo(x + r, y + h);
  ctx.arcTo(x, y + h, x, y + h - r, r);
  ctx.lineTo(x, y + r);
  ctx.arcTo(x, y, x + r, y, r);
  ctx.closePath();
}
