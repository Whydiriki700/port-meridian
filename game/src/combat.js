// Combat for Port Meridian: fists, a pistol with mouse aim, bullets that
// respect walls, Salt Union thugs who shoot back, and street pickups.

import { clamp, distance, angleLerp } from './util.js';
import { collideWithBuildings } from './city.js';
import { drawPerson } from './actors.js';

export class Bullet {
  constructor(x, y, angle, from) {
    this.x = x;
    this.y = y;
    const speed = 860;
    this.vx = Math.cos(angle) * speed;
    this.vy = Math.sin(angle) * speed;
    this.life = 0.75;
    this.from = from; // player | enemy | police
    this.damage = from === 'player' ? 34 : 7;
    this.dead = false;
  }
}

export function pointInBuilding(x, y, city) {
  for (const b of city.buildings) {
    if (x >= b.x && x <= b.x + b.w && y >= b.y && y <= b.y + b.h) return true;
  }
  return false;
}

export function fireBullet(game, shooter, angle, from) {
  const bx = shooter.x + Math.cos(angle) * 16;
  const by = shooter.y + Math.sin(angle) * 16;
  game.bullets.push(new Bullet(bx, by, angle, from));
  game.effects.muzzle(bx, by, angle);
  game.sound.gunshot();
  // Gunfire panics everyone nearby, and witnesses remember it.
  for (const ped of game.pedestrians) {
    if (distance(ped.x, ped.y, shooter.x, shooter.y) < 190) ped.scare(shooter.x, shooter.y);
  }
  if (from === 'player') game.reportCrime('shot', shooter.x, shooter.y);
}

export function meleeAttack(game, attacker, targets) {
  const range = 30;
  let hitSomething = false;
  for (const t of targets) {
    if (t.state === 'down' || t.dead) continue;
    const d = distance(attacker.x, attacker.y, t.x, t.y);
    if (d > range) continue;
    hitSomething = true;
    if (typeof t.hurt === 'function') t.hurt(16, game);
    else {
      t.health = (t.health === undefined ? 50 : t.health) - 16;
      if (t.health <= 0) knockDown(game, t);
      else t.scare(attacker.x, attacker.y);
    }
    game.effects.burst(t.x, t.y, 'rgba(255,255,255,0.7)', 4, 90, 0.25, 2.6);
  }
  game.sound.punch();
  return hitSomething;
}

export function knockDown(game, ped) {
  ped.state = 'down';
  ped.dead = true;
  game.effects.bloodPuff(ped.x, ped.y);
  if (Math.random() < 0.6) {
    game.pickups.push(new Pickup('cash', ped.x + 12, ped.y + 6, 10 + Math.floor(Math.random() * 30)));
  }
}

export class Pickup {
  constructor(kind, x, y, amount) {
    this.kind = kind;
    this.x = x;
    this.y = y;
    this.amount = amount || 0;
    this.r = 12;
    this.taken = false;
    this.bob = Math.random() * 6;
  }
}

export function drawPickup(ctx, p, timeSec) {
  const bobY = Math.sin(timeSec * 3 + p.bob) * 3;
  ctx.save();
  ctx.translate(p.x, p.y + bobY);
  ctx.fillStyle = 'rgba(15, 25, 35, 0.25)';
  ctx.beginPath();
  ctx.ellipse(2, 8 - bobY, 10, 5, 0, 0, Math.PI * 2);
  ctx.fill();
  if (p.kind === 'cash') {
    ctx.fillStyle = '#3f9e4d';
    ctx.fillRect(-9, -6, 18, 11);
    ctx.fillStyle = '#c9f2c0';
    ctx.fillRect(-6, -3.4, 12, 5.4);
  } else if (p.kind === 'health') {
    ctx.fillStyle = '#f4f4f4';
    ctx.fillRect(-9, -9, 18, 18);
    ctx.fillStyle = '#d23b2e';
    ctx.fillRect(-2.6, -6.4, 5.2, 12.8);
    ctx.fillRect(-6.4, -2.6, 12.8, 5.2);
  } else if (p.kind === 'ammo' || p.kind === 'pistol') {
    ctx.fillStyle = '#2b2f36';
    ctx.fillRect(-10, -3, 17, 6);
    ctx.fillRect(4, -1, 6, 8);
    if (p.kind === 'ammo') {
      ctx.fillStyle = '#f2b705';
      ctx.fillRect(-12, -8, 4, 4);
      ctx.fillRect(-6, -8, 4, 4);
    }
  } else {
    // Package, ledger and other story items: a taped parcel.
    ctx.fillStyle = '#b98d5f';
    ctx.fillRect(-10, -8, 20, 16);
    ctx.strokeStyle = '#7a5a34';
    ctx.lineWidth = 2;
    ctx.strokeRect(-10, -8, 20, 16);
    ctx.beginPath();
    ctx.moveTo(-10, 0);
    ctx.lineTo(10, 0);
    ctx.stroke();
  }
  ctx.restore();
}

// A Salt Union thug: closes in, keeps a firing distance, shoots in bursts.
export class Thug {
  constructor(x, y, name) {
    this.x = x;
    this.y = y;
    this.r = 11;
    this.angle = 0;
    this.health = 65;
    this.maxHealth = 65;
    this.shirt = '#3a3f45';
    this.skin = '#c68863';
    this.speed = 148;
    this.fireCooldown = Math.random() * 0.8;
    this.burst = 0;
    this.state = 'fight';
    this.dead = false;
    this.name = name || 'Salt Union thug';
    this.walkPhase = 0;
  }

  hurt(amount, game) {
    this.health -= amount;
    game.effects.bloodPuff(this.x, this.y);
    if (this.health <= 0 && !this.dead) {
      this.dead = true;
      this.state = 'down';
      game.onThugDown(this);
    }
  }

  update(dt, game) {
    if (this.dead) return;
    const player = game.player;
    const target = player.inVehicle ? player.vehicle : player;
    const d = distance(this.x, this.y, target.x, target.y);
    this.angle = angleLerp(this.angle, Math.atan2(target.y - this.y, target.x - this.x), 0.2);
    if (d > 210) {
      this.x += Math.cos(this.angle) * this.speed * dt;
      this.y += Math.sin(this.angle) * this.speed * dt;
      this.walkPhase += dt * 11;
    } else if (d < 120) {
      this.x -= Math.cos(this.angle) * this.speed * 0.6 * dt;
      this.y -= Math.sin(this.angle) * this.speed * 0.6 * dt;
      this.walkPhase += dt * 8;
    }
    collideWithBuildings(this, game.city);
    this.fireCooldown -= dt;
    if (d < 300 && this.fireCooldown <= 0 && !pointInBuilding((this.x + target.x) / 2, (this.y + target.y) / 2, game.city)) {
      const spread = (Math.random() - 0.5) * 0.21;
      fireBullet(game, this, this.angle + spread, 'enemy');
      this.burst += 1;
      this.fireCooldown = this.burst >= 3 ? 1.25 + Math.random() * 0.6 : 0.26;
      if (this.burst >= 3) this.burst = 0;
    }
  }

  draw(ctx) {
    drawPerson(ctx, this, { shirt: this.shirt, skin: this.skin, weapon: !this.dead, hat: '#22262b' });
    if (!this.dead && this.health < this.maxHealth) {
      ctx.fillStyle = 'rgba(10, 16, 22, 0.65)';
      ctx.fillRect(this.x - 16, this.y - 26, 32, 5);
      ctx.fillStyle = '#e05252';
      ctx.fillRect(this.x - 15, this.y - 25, 30 * clamp(this.health / this.maxHealth, 0, 1), 3);
    }
  }
}

export function updateBullets(game, dt) {
  const player = game.player;
  for (const b of game.bullets) {
    b.x += b.vx * dt;
    b.y += b.vy * dt;
    b.life -= dt;
    if (b.life <= 0) { b.dead = true; continue; }
    if (pointInBuilding(b.x, b.y, game.city)) {
      game.effects.sparks(b.x, b.y);
      b.dead = true;
      continue;
    }
    if (b.from === 'player') {
      let consumed = false;
      for (const thug of game.thugs) {
        if (!thug.dead && distance(b.x, b.y, thug.x, thug.y) < thug.r + 3) {
          thug.hurt(b.damage, game);
          consumed = true;
          break;
        }
      }
      if (!consumed) {
        for (const officer of game.police.officers) {
          if (!officer.dead && distance(b.x, b.y, officer.x, officer.y) < officer.r + 3) {
            officer.hurt(b.damage, game);
            game.reportCrime('shot-police', b.x, b.y);
            consumed = true;
            break;
          }
        }
      }
      if (!consumed) {
        for (const ped of game.pedestrians) {
          if (ped.state !== 'down' && distance(b.x, b.y, ped.x, ped.y) < ped.r + 3) {
            knockDown(game, ped);
            game.reportCrime('assault', ped.x, ped.y);
            consumed = true;
            break;
          }
        }
      }
      if (!consumed) {
        for (const v of game.vehicles) {
          if (!v.dead && distance(b.x, b.y, v.x, v.y) < v.r) {
            v.health -= b.damage * 0.5;
            game.effects.sparks(b.x, b.y);
            if (v.mode === 'traffic') v.mode = 'fleeing';
            if (v.health <= 0) { v.dead = true; v.speed = 0; game.onVehicleDead(v); }
            consumed = true;
            break;
          }
        }
      }
      if (consumed) b.dead = true;
    } else {
      // Enemy and police fire can hit the player, on foot or through the car.
      const target = player.inVehicle ? player.vehicle : player;
      const rr = player.inVehicle ? target.r : player.r + 3;
      if (distance(b.x, b.y, target.x, target.y) < rr) {
        if (player.inVehicle) {
          player.vehicle.health -= b.damage * 0.4;
          game.effects.sparks(b.x, b.y);
          player.hurt(b.damage * 0.25, game);
        } else {
          player.hurt(b.damage, game);
        }
        b.dead = true;
      }
    }
  }
  game.bullets = game.bullets.filter((b) => !b.dead);
}

export function drawBullets(ctx, bullets) {
  ctx.fillStyle = '#ffe27f';
  for (const b of bullets) {
    ctx.beginPath();
    ctx.arc(b.x, b.y, 2.6, 0, Math.PI * 2);
    ctx.fill();
  }
}
