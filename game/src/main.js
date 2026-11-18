// Port Meridian: the game itself. A harbour city open world in one page —
// explore on foot and by car, steal vehicles, run Mara Voss's five-job story,
// fight the Salt Union, raise a wanted level and lose the Port Police.
// Keyboard and mouse, fully offline, saves to the browser.

import { clamp, distance, angleTo } from './util.js';
import { SoundEngine } from './audio.js';
import { Input } from './input.js';
import { buildCity, drawWorld, siteById, districtAt, WORLD_W, WORLD_H } from './city.js';
import { Player, Pedestrian, spawnPedestrians, updatePlayerOnFoot, drawPerson } from './actors.js';
import { spawnTraffic, spawnParkedCars, updateVehicle, drivePlayerVehicle, collideVehicles, drawVehicle } from './vehicles.js';
import { PoliceSystem } from './police.js';
import { fireBullet, meleeAttack, updateBullets, drawBullets, drawPickup, Pickup } from './combat.js';
import { MissionManager } from './missions.js';
import { Effects } from './effects.js';
import { drawHUD, drawObjectiveArrow } from './hud.js';
import { hasSave, writeSave, readSave, clearSave } from './save.js';
import { shotNameFromUrl, applyShotScene } from './screenshot-scenes.js';

const canvas = document.getElementById('game');
const ctx = canvas.getContext('2d');

export class Game {
  constructor() {
    this.canvas = canvas;
    this.ctx = ctx;
    this.input = new Input(canvas);
    this.sound = new SoundEngine();
    this.state = 'menu';
    this.timeSec = 0;
    this.timeOfDay = 9 * 60 + 20;
    this.camera = { x: 618, y: 970, zoom: 1 };
    this.banner = null;
    this.bannerTimer = 0;
    this.dialog = null;
    this.dialogTimer = 0;
    this.toast = null;
    this.toastTimer = 0;
    this.promptText = '';
    this.activeObjective = null;
    this.endTimer = 0;
    this.buildWorld();
    this.resize();
    window.addEventListener('resize', () => this.resize());
  }

  buildWorld() {
    this.city = buildCity();
    this.player = new Player(618, 972);
    this.vehicles = [...spawnTraffic(16), ...spawnParkedCars()];
    this.pedestrians = spawnPedestrians(26);
    this.thugs = [];
    this.bullets = [];
    this.pickups = [
      new Pickup('health', 1040, 590, 0),
      new Pickup('ammo', 2226, 1418, 24),
      new Pickup('health', 640, 900, 0),
    ];
    this.police = new PoliceSystem();
    this.missions = new MissionManager(this.city);
    this.effects = new Effects();
    this.stats = { missionsDone: 0, taxis: 0, crates: 0, dockRuns: 0, busted: 0, wasted: 0, carsStolen: 0 };
    this.timeOfDay = 9 * 60 + 20;
    this.camera.x = this.player.x;
    this.camera.y = this.player.y;
  }

  resize() {
    this.canvas.width = window.innerWidth;
    this.canvas.height = window.innerHeight;
  }

  // ---- flow ---------------------------------------------------------------

  startNewGame() {
    clearSave();
    this.buildWorld();
    this.state = 'playing';
    this.showDialog('Mara Voss', 'Jae Corin. You owe the Salt Union, and Friday is coming. Come to The Anchor Bar — I have work.');
    this.showBanner('PORT MERIDIAN', 'Meet Mara Voss at The Anchor Bar');
  }

  loadGame() {
    const data = readSave();
    if (!data) return false;
    this.buildWorld();
    const p = this.player;
    p.cash = data.cash;
    p.health = data.health;
    p.armour = data.armour;
    p.hasPistol = data.hasPistol;
    p.ammo = data.ammo;
    if (p.hasPistol) p.weapon = 'pistol';
    p.x = data.playerX;
    p.y = data.playerY;
    this.missions.index = data.missionIndex;
    this.missions.storyDone = data.storyDone;
    if (this.missions.index >= 5) this.missions.storyDone = true;
    this.missions.cratesFound = new Set(data.cratesFound || []);
    this.missions.crateBonusPaid = this.missions.cratesFound.size >= 16;
    this.timeOfDay = data.timeOfDay || 560;
    this.stats = Object.assign(this.stats, data.stats || {});
    this.state = 'playing';
    this.showToast('Game loaded — welcome back to Port Meridian');
    return true;
  }

  autosave() {
    if (this.state === 'playing') writeSave(this);
  }

  showBanner(title, sub) {
    this.banner = { title, sub };
    this.bannerTimer = 3.2;
  }

  showDialog(speaker, text) {
    this.dialog = { speaker, text };
    this.dialogTimer = 6.5;
  }

  showToast(text) {
    this.toast = text;
    this.toastTimer = 3.6;
  }

  reportCrime(type, x, y) {
    return this.police.reportCrime(this, type, x, y);
  }

  onThugDown(thug) {
    thug.removeAt = this.timeSec + 7;
    this.stats.thugsDown = (this.stats.thugsDown || 0) + 1;
    this.pickups.push(new Pickup('cash', thug.x, thug.y, 15 + Math.floor(Math.random() * 25)));
    this.missions.onThugDown(this, thug);
  }

  onVehicleDead(vehicle) {
    this.effects.burst(vehicle.x, vehicle.y, 'rgba(50,50,55,0.7)', 22, 130, 1.1, 9);
    this.effects.burst(vehicle.x, vehicle.y, '#ff8c42', 14, 170, 0.5, 5);
    this.effects.addShake(7);
    this.sound.crash(0.8);
  }

  // ---- vehicles -------------------------------------------------------------

  nearestVehicle(maxDist) {
    let best = null;
    let bestD = maxDist;
    for (const v of this.vehicles) {
      if (v.dead || v.mode === 'police') continue;
      const d = distance(this.player.x, this.player.y, v.x, v.y);
      if (d < bestD) { bestD = d; best = v; }
    }
    return best;
  }

  enterVehicle(vehicle) {
    const p = this.player;
    const wasParked = vehicle.mode === 'parked' || vehicle.mode === 'abandoned';
    const wasTraffic = vehicle.mode === 'traffic';
    vehicle.mode = 'player';
    vehicle.speed = 0;
    p.inVehicle = true;
    p.vehicle = vehicle;
    p.x = vehicle.x;
    p.y = vehicle.y;
    this.sound.doorSlam();
    if (wasParked && !vehicle.ownerDriven) {
      // Taking a car that is not yours is a crime when anyone sees it.
      vehicle.ownerDriven = true;
      this.stats.carsStolen += 1;
      const witnessed = this.reportCrime('steal', vehicle.x, vehicle.y);
      if (witnessed) {
        this.showToast('Car stolen — witnesses are calling the Port Police');
        this.sound.glassBreak();
      }
    }
    if (wasTraffic) {
      this.stats.carsStolen += 1;
      this.reportCrime('steal', vehicle.x, vehicle.y);
      const driver = new Pedestrian(Math.random, vehicle.x + 24, vehicle.y + 10);
      driver.scare(vehicle.x, vehicle.y);
      this.pedestrians.push(driver);
      this.showToast('Driver dragged out — the car is yours now');
    }
    this.missions.onPlayerEnterVehicle(this, vehicle);
  }

  exitVehicle(silent) {
    const p = this.player;
    if (!p.inVehicle) return;
    const v = p.vehicle;
    v.mode = 'abandoned';
    v.speed = 0;
    p.inVehicle = false;
    p.vehicle = null;
    p.x = v.x + Math.cos(v.angle + Math.PI / 2) * 26;
    p.y = v.y + Math.sin(v.angle + Math.PI / 2) * 26;
    if (!silent) this.sound.doorSlam();
  }

  // ---- interaction ------------------------------------------------------------

  computePrompt() {
    const p = this.player;
    if (this.state !== 'playing') { this.promptText = ''; return; }
    if (p.inVehicle) {
      const garage = siteById('garage');
      if (distance(p.vehicle.x, p.vehicle.y, garage.x, garage.y) < 110 && p.vehicle.health < 99) {
        this.promptText = 'R — repair at Tito\'s Garage · E — exit';
      } else {
        this.promptText = 'E — exit vehicle';
      }
      return;
    }
    const v = this.nearestVehicle(48);
    if (v) {
      this.promptText = 'E — ' + (v.mode === 'traffic' ? 'steal the ' : 'drive the ') + v.name;
      return;
    }
    const obj = this.activeObjective;
    if (obj && obj.x && distance(p.x, p.y, obj.x, obj.y) < 72) {
      this.promptText = 'E — ' + obj.title;
      return;
    }
    for (const id of ['clinic', 'supply', 'bar', 'garage']) {
      const s = siteById(id);
      if (distance(p.x, p.y, s.x, s.y) < 58) {
        this.promptText = 'E — ' + s.name;
        return;
      }
    }
    this.promptText = '';
  }

  handleInteract() {
    const p = this.player;
    if (p.inVehicle) {
      this.exitVehicle(false);
      return;
    }
    if (this.missions.handleInteract(this)) return;
    const v = this.nearestVehicle(48);
    if (v) { this.enterVehicle(v); return; }
    const clinic = siteById('clinic');
    if (distance(p.x, p.y, clinic.x, clinic.y) < 58) {
      if (p.health >= 100) this.showToast('The clinic says you are fine');
      else if (p.cash >= 25) {
        p.cash -= 25;
        p.heal(100);
        this.showToast('Patched up for $25');
        this.sound.pickup();
      } else this.showToast('Treatment costs $25 — you are short');
      return;
    }
    const supply = siteById('supply');
    if (distance(p.x, p.y, supply.x, supply.y) < 58) {
      if (!p.hasPistol && p.cash >= 200) {
        p.cash -= 200;
        p.hasPistol = true;
        p.weapon = 'pistol';
        p.ammo += 24;
        this.showToast('Pistol bought — aim with the mouse, click to fire');
        this.sound.cash();
      } else if (p.hasPistol && p.cash >= 40) {
        p.cash -= 40;
        p.ammo += 24;
        this.showToast('+24 rounds for $40');
        this.sound.cash();
      } else if (!p.hasPistol) this.showToast('A pistol costs $200 — you are short');
      else this.showToast('Ammo costs $40 — you are short');
      return;
    }
    const bar = siteById('bar');
    if (distance(p.x, p.y, bar.x, bar.y) < 58 && !this.missions.dockRun) {
      this.missions.startDockRun(this);
      return;
    }
    const garage = siteById('garage');
    if (distance(p.x, p.y, garage.x, garage.y) < 58) {
      this.showToast('Tito: bring a car in and press R, I will straighten it out');
    }
  }

  // ---- consequences ---------------------------------------------------------

  busted() {
    const p = this.player;
    this.stats.busted += 1;
    const fine = Math.min(200, Math.round(p.cash * 0.25));
    p.cash -= fine;
    if (p.inVehicle) this.exitVehicle(true);
    const station = siteById('station');
    p.x = station.x + 30;
    p.y = station.y + 44;
    p.health = Math.max(p.health, 55);
    this.police.clear();
    if (this.missions.stage > 0) this.missions.failMission(this, 'Arrested');
    this.showBanner('BUSTED', 'The Port Police take $' + fine + ' and your afternoon');
    this.sound.missionSting(false);
    this.autosave();
  }

  wasted() {
    const p = this.player;
    this.stats.wasted += 1;
    const fee = Math.min(150, Math.round(p.cash * 0.2));
    p.cash -= fee;
    if (p.inVehicle) this.exitVehicle(true);
    const clinic = siteById('clinic');
    p.x = clinic.x + 26;
    p.y = clinic.y + 40;
    p.health = 80;
    this.police.heat = Math.min(this.police.heat, 1);
    if (this.missions.stage > 0) this.missions.failMission(this, 'You woke up at the clinic');
    this.showBanner('WASTED', 'Meridian Clinic patches you up for $' + fee);
    this.sound.missionSting(false);
    this.autosave();
  }

  // ---- update -----------------------------------------------------------------

  processEvents() {
    const world = this.world;
    for (const e of world.events) {
      if (e.type === 'honk') {
        if (distance(e.x, e.y, this.player.x, this.player.y) < 300) this.sound.tone(340, 0.14, 'square', 0.06);
      } else if (e.type === 'crash') {
        this.sound.crash(e.power || 0.3);
        this.effects.sparks(e.x, e.y);
        if (e.byPlayer) {
          this.effects.addShake(3 + (e.power || 0) * 6);
          if (e.otherIsPolice) this.reportCrime('crash-police', e.x, e.y);
          else if ((e.power || 0) > 0.4) this.reportCrime('crash', e.x, e.y);
          for (const ped of this.pedestrians) {
            if (distance(ped.x, ped.y, e.x, e.y) < 130) ped.scare(e.x, e.y);
          }
        }
      } else if (e.type === 'vehicle-dead') {
        this.onVehicleDead(e.vehicle);
      }
    }
    world.events.length = 0;
  }

  update(dt) {
    this.timeSec += dt;
    this.bannerTimer = Math.max(0, this.bannerTimer - dt);
    this.dialogTimer = Math.max(0, this.dialogTimer - dt);
    this.toastTimer = Math.max(0, this.toastTimer - dt);
    if (this.state !== 'playing') return;

    this.timeOfDay = (this.timeOfDay + dt * 0.55) % (24 * 60);
    const p = this.player;
    const input = this.input;
    this.world = {
      player: p,
      vehicles: this.vehicles,
      city: this.city,
      events: this.world ? this.world.events : [],
      mouseAiming: !p.inVehicle,
    };
    const world = this.world;

    // Pause and utility keys.
    if (input.pressed('KeyM')) {
      this.sound.setMuted(!this.sound.muted);
      this.showToast(this.sound.muted ? 'Sound off' : 'Sound on');
    }
    if (input.pressed('KeyE')) this.handleInteract();

    // Player movement and combat.
    if (p.inVehicle) {
      const v = p.vehicle;
      const drive = drivePlayerVehicle(v, input, dt, world);
      p.x = v.x;
      p.y = v.y;
      p.angle = v.angle;
      if (drive.sliding) {
        this.effects.addSkid(v.x - Math.cos(v.angle) * 14, v.y - Math.sin(v.angle) * 14);
        if (Math.random() < 0.4) this.effects.smoke(v.x, v.y, false);
      }
      if (v.health < 32 && Math.random() < dt * 6) this.effects.smoke(v.frontX(), v.frontY(), true);
      this.sound.setEngine(drive.speedRatio, true);
      const garage = siteById('garage');
      if (input.pressed('KeyR') && distance(v.x, v.y, garage.x, garage.y) < 110 && v.health < 100) {
        const cost = Math.ceil((100 - v.health) * 0.9);
        if (p.cash >= cost) {
          p.cash -= cost;
          v.health = 100;
          this.showToast('Repaired for $' + cost);
          this.sound.cash();
        } else this.showToast('Repairs cost $' + cost + ' — you are short');
      }
    } else {
      this.sound.setEngine(0, false);
      const aim = angleTo(this.canvas.width / 2, this.canvas.height / 2, input.mouseX, input.mouseY);
      updatePlayerOnFoot(p, input, dt, world, aim);
      if (input.pressed('Digit1')) p.weapon = 'fists';
      if (input.pressed('Digit2') && p.hasPistol) p.weapon = 'pistol';
      const wantPunch = input.pressed('KeyF') || (input.mouseClicked && p.weapon === 'fists');
      if (wantPunch && p.punchCooldown <= 0) {
        p.punchCooldown = 0.34;
        const targets = [...this.pedestrians, ...this.thugs, ...this.police.officers];
        const hit = meleeAttack(this, p, targets);
        if (hit) this.reportCrime('assault', p.x, p.y);
      }
      if (input.mouseDown && p.weapon === 'pistol' && p.fireCooldown <= 0) {
        if (p.ammo > 0) {
          p.ammo -= 1;
          p.fireCooldown = 0.17;
          fireBullet(this, p, aim, 'player');
        } else {
          p.fireCooldown = 0.3;
          this.showToast('Out of ammo — Harbor Supply sells rounds');
        }
      }
    }

    // World simulation.
    for (const v of this.vehicles) updateVehicle(v, dt, world);
    collideVehicles(this.vehicles, world);
    this.processEvents();
    for (const ped of this.pedestrians) ped.update(dt, world);
    this.checkPedestrianHits();
    for (const thug of this.thugs) thug.update(dt, this);
    this.thugs = this.thugs.filter((t) => !t.dead || (t.removeAt && this.timeSec < t.removeAt));
    this.police.update(dt, this);
    updateBullets(this, dt);
    this.missions.update(this, dt);
    this.updatePickups();
    this.effects.update(dt);
    this.sound.updateMusic(dt);

    // Objectives: a taxi fare overrides the story marker.
    this.activeObjective = this.missions.taxiObjective() || this.missions.objective();
    this.computePrompt();

    // Camera: smooth follow with speed look-ahead and a wider view when driving.
    const body = p.inVehicle ? p.vehicle : p;
    const lookX = body.x + (p.inVehicle ? Math.cos(body.angle) * body.speed * 0.34 : 0);
    const lookY = body.y + (p.inVehicle ? Math.sin(body.angle) * body.speed * 0.34 : 0);
    this.camera.x += (lookX - this.camera.x) * Math.min(1, dt * 4.2);
    this.camera.y += (lookY - this.camera.y) * Math.min(1, dt * 4.2);
    const targetZoom = p.inVehicle ? 0.88 : 1;
    this.camera.zoom += (targetZoom - this.camera.zoom) * Math.min(1, dt * 2.4);

    if (this.police.busted) {
      this.police.busted = false;
      this.busted();
    }
    if (p.health <= 0) this.wasted();
  }

  checkPedestrianHits() {
    const p = this.player;
    for (const v of this.vehicles) {
      if (v.dead || Math.abs(v.speed) < 55) continue;
      for (const ped of this.pedestrians) {
        if (ped.state === 'down' || ped.state === 'passenger') continue;
        if (distance(v.x, v.y, ped.x, ped.y) < v.r * 0.72 + ped.r) {
          ped.state = 'down';
          ped.dead = true;
          this.effects.bloodPuff(ped.x, ped.y);
          this.sound.crash(0.4);
          v.speed *= 0.6;
          if (v.mode === 'player') {
            this.reportCrime('runover', ped.x, ped.y);
            this.showToast('You ran someone down — the city saw that');
          }
        }
      }
      // A car can also hurt the player on foot.
      if (!p.inVehicle && v.mode !== 'player' && distance(v.x, v.y, p.x, p.y) < v.r * 0.72 + p.r) {
        p.hurt(Math.abs(v.speed) * 0.06, this);
        p.x += Math.cos(Math.atan2(p.y - v.y, p.x - v.x)) * 18;
        p.y += Math.sin(Math.atan2(p.y - v.y, p.x - v.x)) * 18;
        v.speed *= 0.7;
      }
    }
  }

  updatePickups() {
    const p = this.player;
    for (const pk of this.pickups) {
      if (pk.taken) continue;
      const body = p.inVehicle ? p.vehicle : p;
      if (distance(body.x, body.y, pk.x, pk.y) < 24) {
        pk.taken = true;
        if (pk.kind === 'cash') {
          p.cash += pk.amount;
          this.effects.splashCash(pk.x, pk.y - 12, '+$' + pk.amount);
          this.sound.cash();
        } else if (pk.kind === 'health') {
          if (p.health >= 100 && !p.inVehicle) { pk.taken = false; continue; }
          p.heal(35);
          this.showToast('+35 health');
          this.sound.pickup();
        } else if (pk.kind === 'ammo') {
          p.ammo += pk.amount || 24;
          this.showToast('+' + (pk.amount || 24) + ' rounds');
          this.sound.pickup();
        } else if (pk.kind === 'ledger') {
          this.showToast('Ledger secured — take it to Mara');
          this.sound.pickup();
        } else {
          this.sound.pickup();
        }
      }
    }
    this.pickups = this.pickups.filter((pk) => !pk.taken);
  }

  nightFactor() {
    const t = this.timeOfDay;
    if (t >= 19 * 60 + 30 || t < 5 * 60 + 30) return 1;
    if (t > 17 * 60 + 30 && t < 19 * 60 + 30) return (t - (17 * 60 + 30)) / 120;
    if (t >= 5 * 60 + 30 && t < 7 * 60 + 30) return 1 - (t - (5 * 60 + 30)) / 120;
    return 0;
  }

  // ---- draw -------------------------------------------------------------------

  draw() {
    const { ctx, canvas } = this;
    const w = canvas.width;
    const h = canvas.height;
    const night = this.nightFactor();
    const shake = this.effects.shakeOffset();
    ctx.fillStyle = '#79a86b';
    ctx.fillRect(0, 0, w, h);
    ctx.save();
    ctx.translate(w / 2 + shake.x, h / 2 + shake.y);
    ctx.scale(this.camera.zoom, this.camera.zoom);
    ctx.translate(-this.camera.x, -this.camera.y);
    const view = { x: this.camera.x, y: this.camera.y, w: w / this.camera.zoom, h: h / this.camera.zoom };
    drawWorld(ctx, this.city, view, night, this.timeSec);

    // Unfound crates glow faintly on the ground.
    for (const spot of this.city.crateSpots) {
      if (this.missions.cratesFound.has(spot.id)) continue;
      ctx.fillStyle = 'rgba(255, 217, 77, ' + (0.5 + Math.sin(this.timeSec * 4 + spot.id) * 0.25) + ')';
      ctx.fillRect(spot.x - 8, spot.y - 8, 16, 16);
      ctx.strokeStyle = '#7a5a34';
      ctx.strokeRect(spot.x - 8, spot.y - 8, 16, 16);
    }
    for (const pk of this.pickups) drawPickup(ctx, pk, this.timeSec);
    this.effects.drawWorld(ctx);
    // Entities in y order reads as depth in a top-down city.
    const drawables = [];
    for (const v of this.vehicles) drawables.push({ y: v.y, draw: () => drawVehicle(ctx, v, night, this.timeSec) });
    for (const ped of this.pedestrians) {
      if (ped.state === 'passenger') continue;
      drawables.push({ y: ped.y, draw: () => drawPerson(ctx, ped, ped.state === 'hail' ? { label: 'TAXI?' } : undefined) });
    }
    for (const thug of this.thugs) drawables.push({ y: thug.y, draw: () => thug.draw(ctx) });
    drawables.push({ y: this.player.y + 1, draw: () => this.police.drawOfficers(ctx) });
    if (!this.player.inVehicle) {
      drawables.push({
        y: this.player.y + 2,
        draw: () => drawPerson(ctx, this.player, {
          shirt: '#b3541e',
          skin: '#c68863',
          weapon: this.player.weapon === 'pistol',
          label: this.player.name,
        }),
      });
    }
    drawables.sort((a, b) => a.y - b.y);
    for (const d of drawables) d.draw();
    drawBullets(ctx, this.bullets);
    drawObjectiveArrow(ctx, this);
    ctx.restore();

    // Light and weather of the hour.
    if (night > 0) {
      ctx.fillStyle = 'rgba(9, 14, 44,' + (night * 0.42).toFixed(3) + ')';
      ctx.fillRect(0, 0, w, h);
    } else if (this.timeOfDay > 16 * 60 + 30 && this.timeOfDay < 19 * 60) {
      ctx.fillStyle = 'rgba(255, 150, 60, 0.10)';
      ctx.fillRect(0, 0, w, h);
    }
    this.effects.drawScreenFlash(ctx, w, h);
    if (this.state !== 'menu') drawHUD(ctx, this, w, h);
    void districtAt;
    void WORLD_W;
    void WORLD_H;
  }
}

// ---- boot and menus -----------------------------------------------------------

const game = new Game();
const startScreen = document.getElementById('start-screen');
const pauseScreen = document.getElementById('pause-screen');
const continueBtn = document.getElementById('btn-continue');
const shot = shotNameFromUrl();

function refreshContinue() {
  continueBtn.disabled = !hasSave();
}
refreshContinue();

function hideStart() {
  startScreen.classList.add('hidden');
  game.sound.unlock();
}

document.getElementById('btn-new').addEventListener('click', () => { hideStart(); game.startNewGame(); refreshContinue(); });
continueBtn.addEventListener('click', () => { hideStart(); if (!game.loadGame()) game.startNewGame(); });
document.getElementById('btn-resume').addEventListener('click', () => togglePause(false));
document.getElementById('btn-save').addEventListener('click', () => {
  writeSave(game);
  game.showToast('Saved to this browser');
  refreshContinue();
});
document.getElementById('btn-load').addEventListener('click', () => { if (game.loadGame()) togglePause(false); });
document.getElementById('btn-restart').addEventListener('click', () => { togglePause(false); game.startNewGame(); });

function togglePause(force) {
  const show = force !== undefined ? force : game.state === 'playing';
  if (show && game.state === 'playing') {
    game.state = 'paused';
    document.getElementById('pause-stats').textContent =
      'Cash $' + Math.round(game.player.cash) + ' · Missions done ' + game.stats.missionsDone +
      ' · Crates ' + game.missions.cratesFound.size + '/16 · Wanted ' + game.police.wanted + ' stars';
    pauseScreen.classList.remove('hidden');
  } else if (!show && game.state === 'paused') {
    game.state = 'playing';
    pauseScreen.classList.add('hidden');
  }
}

window.addEventListener('keydown', (e) => {
  game.sound.unlock();
  if (e.code === 'Enter' && game.state === 'menu') {
    hideStart();
    if (hasSave() && game.loadGame()) return;
    game.startNewGame();
  }
  if ((e.code === 'KeyP' || e.code === 'Escape') && (game.state === 'playing' || game.state === 'paused')) {
    togglePause();
  }
});
canvas.addEventListener('mousedown', () => game.sound.unlock());

if (shot) {
  startScreen.classList.add('hidden');
  applyShotScene(game, shot);
  game.activeObjective = game.missions.objective();
}

window.__PM_GAME = game;
window.__PM_READY = true;

let lastTime = performance.now();
function frame(now) {
  const dt = Math.min(0.05, (now - lastTime) / 1000);
  lastTime = now;
  if (game.state === 'playing') game.update(dt);
  else if (game.state === 'menu') {
    game.timeSec += dt;
    // Keep the menu backdrop alive: traffic cruises behind the start screen.
    if (!game.world) {
      game.world = { player: game.player, vehicles: game.vehicles, city: game.city, events: [], mouseAiming: false };
    }
    for (const v of game.vehicles) {
      if (v.mode === 'traffic') updateVehicle(v, dt, game.world);
    }
    game.world.events.length = 0;
    for (const ped of game.pedestrians) ped.update(dt, game.world);
    game.camera.x = game.player.x + Math.cos(game.timeSec * 0.11) * 130;
    game.camera.y = game.player.y + Math.sin(game.timeSec * 0.09) * 90;
    game.effects.update(dt);
  }
  game.draw();
  game.input.endFrame();
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);
