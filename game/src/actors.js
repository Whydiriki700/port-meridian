// People of Port Meridian: Jae Corin, the player, and the pedestrians who
// stroll the pavements, flee from trouble and remember what they witnessed.

import { clamp, distance, angleLerp, makeRng, pick, range } from './util.js';
import { V_ROADS, H_ROADS, ROAD_W, WORLD_W, WORLD_H, SAND_X, collideWithBuildings } from './city.js';

const SHIRT_COLORS = ['#e07b39', '#4a7fb5', '#7fb069', '#d1607d', '#e6e6e6', '#8067a8', '#c7a23a', '#5885af', '#bc4749', '#2a9d8f'];
const SKIN_COLORS = ['#f2c79b', '#c68863', '#8d5524', '#ffdbac', '#e0ac69'];

export class Player {
  constructor(x, y) {
    this.x = x;
    this.y = y;
    this.r = 11;
    this.angle = -Math.PI / 2;
    this.speed = 0;
    this.health = 100;
    this.armour = 0;
    this.cash = 120;
    this.weapon = 'fists';
    this.hasPistol = false;
    this.ammo = 0;
    this.inVehicle = false;
    this.vehicle = null;
    this.punchCooldown = 0;
    this.fireCooldown = 0;
    this.hurtTimer = 0;
    this.walkPhase = 0;
    this.name = 'Jae Corin';
  }

  get alive() {
    return this.health > 0;
  }

  hurt(amount, game) {
    if (this.hurtTimer > 0 && amount < 4) return;
    let remaining = amount;
    if (this.armour > 0) {
      const absorbed = Math.min(this.armour, remaining * 0.6);
      this.armour -= absorbed;
      remaining -= absorbed;
    }
    this.health -= remaining;
    this.hurtTimer = 0.15;
    if (game) {
      game.effects.damageFlash();
      game.effects.addShake(Math.min(6, amount * 0.25));
    }
    if (this.health < 0) this.health = 0;
  }

  heal(amount) {
    this.health = clamp(this.health + amount, 0, 100);
  }
}

export function updatePlayerOnFoot(player, input, dt, world, aimAngle) {
  const up = input.down('KeyW', 'ArrowUp');
  const down = input.down('KeyS', 'ArrowDown');
  const left = input.down('KeyA', 'ArrowLeft');
  const right = input.down('KeyD', 'ArrowRight');
  let mx = (right ? 1 : 0) - (left ? 1 : 0);
  let my = (down ? 1 : 0) - (up ? 1 : 0);
  const len = Math.sqrt(mx * mx + my * my);
  const sprint = input.down('ShiftLeft', 'ShiftRight');
  const speed = sprint ? 252 : 168;
  if (len > 0) {
    mx /= len;
    my /= len;
    player.x += mx * speed * dt;
    player.y += my * speed * dt;
    player.speed = speed;
    player.walkPhase += dt * (sprint ? 13 : 10);
    if (!world.mouseAiming) player.angle = angleLerp(player.angle, Math.atan2(my, mx), 0.35);
  } else {
    player.speed = 0;
  }
  if (world.mouseAiming && aimAngle !== null) player.angle = aimAngle;
  collideWithBuildings(player, world.city);
  player.punchCooldown = Math.max(0, player.punchCooldown - dt);
  player.fireCooldown = Math.max(0, player.fireCooldown - dt);
  player.hurtTimer = Math.max(0, player.hurtTimer - dt);
}

export class Pedestrian {
  constructor(rng, x, y) {
    this.x = x;
    this.y = y;
    this.r = 10;
    this.angle = range(rng, 0, Math.PI * 2);
    this.speed = range(rng, 42, 68);
    this.shirt = pick(rng, SHIRT_COLORS);
    this.skin = pick(rng, SKIN_COLORS);
    this.walkPhase = range(rng, 0, 6);
    this.state = 'walk'; // walk | flee | down | passenger
    this.fleeTimer = 0;
    this.fleeFrom = { x: 0, y: 0 };
    this.target = null;
    this.dead = false;
    this.witnessCooldown = 0;
    this.pickTarget(rng);
  }

  pickTarget(rng) {
    // Stroll along a pavement: beside a random road, toward a random point.
    const vertical = rng() < 0.5;
    if (vertical) {
      const road = pick(rng, V_ROADS);
      const side = rng() < 0.5 ? -1 : 1;
      this.target = {
        x: road + side * (ROAD_W / 2 + 13),
        y: range(rng, 80, WORLD_H - 80),
      };
    } else {
      const road = pick(rng, H_ROADS);
      const side = rng() < 0.5 ? -1 : 1;
      this.target = {
        x: range(rng, 80, Math.min(WORLD_W - 200, SAND_X - 40)),
        y: road + side * (ROAD_W / 2 + 13),
      };
    }
  }

  scare(fromX, fromY) {
    if (this.state === 'down') return;
    this.state = 'flee';
    this.fleeTimer = range(Math.random, 2, 3.6);
    this.fleeFrom = { x: fromX, y: fromY };
  }

  update(dt, world) {
    if (this.state === 'down' || this.state === 'passenger') return;
    this.witnessCooldown = Math.max(0, this.witnessCooldown - dt);
    let speed = this.speed;
    if (this.state === 'flee') {
      this.fleeTimer -= dt;
      this.angle = Math.atan2(this.y - this.fleeFrom.y, this.x - this.fleeFrom.x);
      speed = 215;
      if (this.fleeTimer <= 0) {
        this.state = 'walk';
        this.pickTarget(Math.random);
      }
    } else if (this.target) {
      const d = distance(this.x, this.y, this.target.x, this.target.y);
      if (d < 14) this.pickTarget(Math.random);
      else this.angle = angleLerp(this.angle, Math.atan2(this.target.y - this.y, this.target.x - this.x), 0.12);
    }
    this.x += Math.cos(this.angle) * speed * dt;
    this.y += Math.sin(this.angle) * speed * dt;
    this.walkPhase += dt * (this.state === 'flee' ? 15 : 8);
    collideWithBuildings(this, world.city);
    this.x = clamp(this.x, 20, SAND_X + 90);
    this.y = clamp(this.y, 20, WORLD_H - 20);
  }
}

export function spawnPedestrians(count) {
  const rng = makeRng(1357);
  const list = [];
  for (let i = 0; i < count; i++) {
    const vertical = rng() < 0.5;
    let x;
    let y;
    if (vertical) {
      const road = pick(rng, V_ROADS);
      x = road + (rng() < 0.5 ? -1 : 1) * (ROAD_W / 2 + 13);
      y = range(rng, 90, WORLD_H - 90);
    } else {
      const road = pick(rng, H_ROADS);
      x = range(rng, 90, SAND_X - 60);
      y = road + (rng() < 0.5 ? -1 : 1) * (ROAD_W / 2 + 13);
    }
    list.push(new Pedestrian(rng, x, y));
  }
  return list;
}

export function drawPerson(ctx, person, opts) {
  const options = opts || {};
  const shirt = options.shirt || person.shirt || '#e07b39';
  const skin = options.skin || person.skin || '#f2c79b';
  const down = person.state === 'down';
  ctx.save();
  ctx.translate(person.x, person.y);
  if (down) ctx.rotate(1.2);
  else ctx.rotate(person.angle);
  // Shadow.
  ctx.fillStyle = 'rgba(15, 25, 35, 0.28)';
  ctx.beginPath();
  ctx.ellipse(3, 4, 11, 8, 0, 0, Math.PI * 2);
  ctx.fill();
  if (!down && person.speed !== 0) {
    // Legs swinging with the walk cycle.
    const swing = Math.sin(person.walkPhase || 0) * 6;
    ctx.strokeStyle = '#2e3440';
    ctx.lineWidth = 4;
    ctx.beginPath();
    ctx.moveTo(0, 0);
    ctx.lineTo(-3 + swing * 0.4, 7);
    ctx.moveTo(0, 0);
    ctx.lineTo(-3 - swing * 0.4, -7);
    ctx.stroke();
  }
  // Body and head, seen from above: shoulders, then face.
  ctx.fillStyle = shirt;
  ctx.beginPath();
  ctx.arc(0, 0, 9.5, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = skin;
  ctx.beginPath();
  ctx.arc(2.5, 0, 5.6, 0, Math.PI * 2);
  ctx.fill();
  if (options.hat) {
    ctx.fillStyle = options.hat;
    ctx.beginPath();
    ctx.arc(2.5, 0, 6.2, 0, Math.PI * 2);
    ctx.fill();
  }
  if (options.weapon) {
    ctx.strokeStyle = '#22262b';
    ctx.lineWidth = 3.4;
    ctx.beginPath();
    ctx.moveTo(6, 3);
    ctx.lineTo(19, 4);
    ctx.stroke();
  }
  ctx.restore();
  if (options.label) {
    ctx.fillStyle = 'rgba(10, 20, 30, 0.7)';
    ctx.font = 'bold 11px system-ui, sans-serif';
    ctx.textAlign = 'center';
    const w = ctx.measureText(options.label).width + 12;
    ctx.fillRect(person.x - w / 2, person.y - 34, w, 17);
    ctx.fillStyle = '#ffffff';
    ctx.fillText(options.label, person.x, person.y - 21);
    ctx.textAlign = 'left';
  }
}
