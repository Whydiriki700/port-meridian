// The Meridian Port Police: a wanted system fed by witnessed crimes, patrol
// cars that hunt the player down, and officers who arrest at low heat and
// shoot at high heat. Lose sight of them and the heat slowly cools.

import { clamp, distance, angleLerp, angleDiff } from './util.js';
import { V_ROADS, H_ROADS, collideWithBuildings } from './city.js';
import { Vehicle } from './vehicles.js';
import { drawPerson } from './actors.js';
import { pointInBuilding, fireBullet } from './combat.js';

const CRIME_HEAT = {
  steal: 1,
  assault: 1.4,
  runover: 2.2,
  shot: 0.9,
  'shot-police': 2.6,
  'crash-police': 1.6,
  crash: 0.5,
  speeding: 0.4,
};

export class Officer {
  constructor(x, y) {
    this.x = x;
    this.y = y;
    this.r = 11;
    this.angle = 0;
    this.health = 55;
    this.shirt = '#274b8f';
    this.skin = '#e0ac69';
    this.speed = 196;
    this.fireCooldown = Math.random();
    this.dead = false;
    this.state = 'chase';
    this.walkPhase = 0;
  }

  hurt(amount, game) {
    this.health -= amount;
    game.effects.bloodPuff(this.x, this.y);
    if (this.health <= 0 && !this.dead) {
      this.dead = true;
      this.state = 'down';
      game.police.addHeat(1.2);
    }
  }
}

export class PoliceSystem {
  constructor() {
    this.heat = 0;
    this.cars = [];
    this.officers = [];
    this.seenTimer = 0;
    this.timeSinceSeen = 99;
    this.arrestProgress = 0;
    this.spawnTimer = 0;
    this.busted = false;
  }

  get wanted() {
    return clamp(Math.floor(this.heat + 0.0001), 0, 5);
  }

  addHeat(amount) {
    this.heat = clamp(this.heat + amount, 0, 5.6);
  }

  setWanted(stars) {
    this.heat = Math.max(this.heat, stars);
  }

  clear() {
    this.heat = 0;
    this.arrestProgress = 0;
    this.busted = false;
  }

  reportCrime(game, type, x, y) {
    const amount = CRIME_HEAT[type] || 0.5;
    // A crime only heats up when someone can report it: a pedestrian or an
    // officer within earshot, or a police unit already watching the player.
    let witnessed = this.timeSinceSeen < 2;
    if (!witnessed) {
      for (const ped of game.pedestrians) {
        if (ped.state !== 'down' && distance(ped.x, ped.y, x, y) < 250) { witnessed = true; break; }
      }
    }
    if (!witnessed) {
      for (const officer of this.officers) {
        if (!officer.dead && distance(officer.x, officer.y, x, y) < 320) { witnessed = true; break; }
      }
    }
    if (witnessed) {
      this.addHeat(amount);
      this.timeSinceSeen = 0;
    }
    return witnessed;
  }

  playerSpotted(game) {
    const p = game.player;
    const target = p.inVehicle ? p.vehicle : p;
    for (const car of this.cars) {
      if (!car.dead && distance(car.x, car.y, target.x, target.y) < 380) return true;
    }
    for (const officer of this.officers) {
      if (!officer.dead && distance(officer.x, officer.y, target.x, target.y) < 300) {
        const midBlocked = pointInBuilding((officer.x + target.x) / 2, (officer.y + target.y) / 2, game.city);
        if (!midBlocked) return true;
      }
    }
    return false;
  }

  spawnPoint(game) {
    // On a road, well out of sight but close enough to join the chase.
    const p = game.player;
    for (let tries = 0; tries < 12; tries++) {
      const vertical = Math.random() < 0.5;
      const road = vertical ? V_ROADS[Math.floor(Math.random() * V_ROADS.length)] : H_ROADS[Math.floor(Math.random() * H_ROADS.length)];
      const along = Math.random() * 2200 + 100;
      const x = vertical ? road : along;
      const y = vertical ? along : road;
      const d = distance(x, y, p.x, p.y);
      if (d > 480 && d < 860) return { x, y };
    }
    return { x: p.x + 560, y: p.y };
  }

  update(dt, game) {
    const wanted = this.wanted;
    const spotted = wanted > 0 && this.playerSpotted(game);
    if (spotted) this.timeSinceSeen = 0;
    else this.timeSinceSeen += dt;

    // Heat cools while nobody can see the player.
    if (wanted > 0 && this.timeSinceSeen > 6) {
      this.heat = Math.max(0, this.heat - dt * 0.055);
    }
    if (this.heat <= 0.001 && wanted === 0) {
      this.heat = 0;
    }

    // Reinforcements arrive in proportion to the wanted level.
    this.spawnTimer -= dt;
    const wantCars = wanted === 0 ? 0 : Math.min(1 + wanted, 5);
    const wantOfficers = wanted === 0 ? 0 : Math.min(wanted + 1, 6);
    if (this.spawnTimer <= 0) {
      this.spawnTimer = 1.4;
      if (this.cars.filter((c) => !c.dead).length < wantCars) {
        const s = this.spawnPoint(game);
        const car = new Vehicle('interceptor', s.x, s.y, 0, '#eef1f4');
        car.mode = 'police';
        car.health = 130;
        this.cars.push(car);
        game.vehicles.push(car);
      }
      if (this.officers.filter((o) => !o.dead).length < wantOfficers && wanted >= 1) {
        const s = this.spawnPoint(game);
        this.officers.push(new Officer(s.x + 20, s.y + 14));
      }
    }

    // Despawn distant units once the heat is gone.
    if (wanted === 0) {
      for (const car of this.cars) {
        if (distance(car.x, car.y, game.player.x, game.player.y) > 700) car.mode = 'abandoned';
      }
      this.cars = this.cars.filter((c) => c.mode === 'police');
      this.officers = this.officers.filter((o) => distance(o.x, o.y, game.player.x, game.player.y) < 640);
    }

    this.updateCars(dt, game);
    this.updateOfficers(dt, game);
    game.sound.setSiren(wanted > 0 && this.cars.some((c) => !c.dead && distance(c.x, c.y, game.player.x, game.player.y) < 520), game.timeSec);
  }

  updateCars(dt, game) {
    const p = game.player;
    const target = p.inVehicle ? p.vehicle : p;
    for (const car of this.cars) {
      if (car.dead || car.mode !== 'police') continue;
      const d = distance(car.x, car.y, target.x, target.y);
      // Predict where the target is heading and steer for it.
      const lead = clamp(d / 300, 0, 0.7);
      const tx = target.x + Math.cos(target.angle || 0) * (target.speed || 0) * lead;
      const ty = target.y + Math.sin(target.angle || 0) * (target.speed || 0) * lead;
      const desired = Math.atan2(ty - car.y, tx - car.x);
      const diff = angleDiff(car.angle, desired);
      car.angle += clamp(diff, -2.1 * dt, 2.1 * dt);
      const topSpeed = car.model.maxSpeed * (this.wanted >= 4 ? 1 : 0.92);
      if (d > 46) {
        car.speed = Math.min(topSpeed, car.speed + car.model.accel * dt);
      } else {
        // Alongside the player: match speed and nudge, or stop for an arrest.
        car.speed = Math.max(0, car.speed - 300 * dt);
      }
      if (Math.abs(diff) > 2.4 && d < 120) car.speed = Math.max(-90, car.speed - 200 * dt);
      car.x += Math.cos(car.angle) * car.speed * dt;
      car.y += Math.sin(car.angle) * car.speed * dt;
      const before = car.speed;
      collideWithBuildings(car, game.city);
      if (Math.abs(car.speed - before) > 1) car.speed *= 0.5;
    }
  }

  updateOfficers(dt, game) {
    const p = game.player;
    const target = p.inVehicle ? p.vehicle : p;
    let arresting = false;
    for (const officer of this.officers) {
      if (officer.dead) continue;
      const d = distance(officer.x, officer.y, target.x, target.y);
      officer.angle = angleLerp(officer.angle, Math.atan2(target.y - officer.y, target.x - officer.x), 0.25);
      if (d > 30) {
        const run = this.wanted >= 2 ? 226 : 200;
        officer.x += Math.cos(officer.angle) * run * dt;
        officer.y += Math.sin(officer.angle) * run * dt;
        officer.walkPhase += dt * 13;
      }
      collideWithBuildings(officer, game.city);
      // Shooting starts at three stars, or when the player is in a car.
      officer.fireCooldown -= dt;
      if (this.wanted >= 3 && d < 270 && d > 34 && officer.fireCooldown <= 0) {
        const spread = (Math.random() - 0.5) * 0.13;
        fireBullet(game, officer, officer.angle + spread, 'police');
        officer.fireCooldown = 0.55 + Math.random() * 0.5;
      }
      // Arrest: an officer holding the player at arm's reach fills the meter.
      if (!p.inVehicle && d < 30 && Math.abs(p.speed) < 60) arresting = true;
    }
    if (arresting && this.wanted > 0) {
      this.arrestProgress += dt / 1.7;
      if (this.arrestProgress >= 1) this.busted = true;
    } else {
      this.arrestProgress = Math.max(0, this.arrestProgress - dt * 1.4);
    }
  }

  drawOfficers(ctx) {
    for (const officer of this.officers) {
      drawPerson(ctx, officer, {
        shirt: officer.shirt,
        skin: officer.skin,
        hat: '#1d3560',
        weapon: !officer.dead && this.wanted >= 3,
      });
      if (officer.dead) continue;
    }
  }
}
