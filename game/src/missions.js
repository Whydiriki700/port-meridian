// The story of Port Meridian: five jobs for fixer Mara Voss that carry Jae
// Corin from dock debt to the Salt Union showdown, plus taxi fares, hidden
// harbour crates and repeatable dock runs once the story is done.

import { distance } from './util.js';
import { siteById, SITES } from './city.js';
import { Pickup, Thug } from './combat.js';

export const STORY = [
  { id: 'first-run', title: 'First Run', giver: 'Mara Voss' },
  { id: 'borrowed-wheels', title: 'Borrowed Wheels', giver: 'Mara Voss' },
  { id: 'courier-problem', title: 'Courier Problem', giver: 'Mara Voss' },
  { id: 'hot-cargo', title: 'Hot Cargo', giver: 'Mara Voss' },
  { id: 'showdown', title: 'Salt Union Showdown', giver: 'Mara Voss' },
];

export class MissionManager {
  constructor(city) {
    this.city = city;
    this.index = 0;
    this.stage = 0;
    this.storyDone = false;
    this.courier = null;
    this.wave = 0;
    this.waveKills = 0;
    this.cratesFound = new Set();
    this.crateBonusPaid = false;
    this.taxi = null;
    this.taxiSpawnTimer = 18;
    this.dockRun = null;
    this.packageCarried = false;
  }

  get current() {
    return this.storyDone ? null : STORY[this.index];
  }

  objective() {
    if (this.dockRun) {
      const s = siteById(this.dockRun.stage === 0 ? this.dockRun.from : this.dockRun.to);
      return {
        x: s.x, y: s.y,
        title: 'Dock Run',
        text: this.dockRun.stage === 0 ? 'Pick up the parcel at ' + s.name : 'Deliver the parcel to ' + s.name,
      };
    }
    if (this.storyDone) {
      return { x: 0, y: 0, title: 'Free Roam', text: 'Port Meridian is yours: taxi fares, crates and dock runs pay the rent.' };
    }
    const bar = siteById('bar');
    const warehouse = siteById('warehouse');
    const market = siteById('market');
    const garage = siteById('garage');
    const villa = siteById('heights-house');
    const beach = siteById('beachhouse');
    const pier = siteById('pier');
    switch (this.index) {
      case 0:
        if (this.stage === 0) return { x: bar.x, y: bar.y, title: 'First Run', text: 'Meet Mara Voss at The Anchor Bar (E)' };
        if (this.stage === 1) return { x: warehouse.x, y: warehouse.y, title: 'First Run', text: 'Drive to Harbor Warehouse 9' };
        if (this.stage === 2) return { x: warehouse.x, y: warehouse.y, title: 'First Run', text: 'Pick up the package (E)' };
        return { x: market.x, y: market.y, title: 'First Run', text: 'Deliver the package to Old Market Stall 12 (E)' };
      case 1:
        if (this.stage === 0) return { x: villa.x, y: villa.y, title: 'Borrowed Wheels', text: 'Go to the Heights Villa' };
        if (this.stage === 1) return { x: villa.x + 54, y: villa.y + 46, title: 'Borrowed Wheels', text: 'Steal the yellow Solstice GT (E)' };
        return { x: garage.x, y: garage.y, title: 'Borrowed Wheels', text: "Deliver the Solstice GT to Tito's Garage" };
      case 2:
        if (this.stage === 0) return { x: market.x, y: market.y, title: 'Courier Problem', text: 'Meet the informant at Old Market Stall 12 (E)' };
        if (this.stage === 1) {
          const c = this.courier;
          return { x: c ? c.x : market.x, y: c ? c.y : market.y, title: 'Courier Problem', text: 'Stop the courier and take the ledger' };
        }
        if (this.stage === 2) return { x: bar.x, y: bar.y, title: 'Courier Problem', text: 'Bring the ledger to Mara at The Anchor Bar (E)' };
        return { x: bar.x, y: bar.y, title: 'Courier Problem', text: 'Meet Mara at The Anchor Bar (E)' };
      case 3:
        if (this.stage === 0) return { x: warehouse.x, y: warehouse.y, title: 'Hot Cargo', text: 'Meet the dock crew at Harbor Warehouse 9 (E)' };
        if (this.stage === 1) return { x: warehouse.x + 52, y: warehouse.y - 54, title: 'Hot Cargo', text: 'Take the Cargo Van (E)' };
        return { x: beach.x, y: beach.y, title: 'Hot Cargo', text: 'Deliver the van to Solmar Beach House — the police know' };
      case 4:
        if (this.stage === 0) return { x: pier.x, y: pier.y, title: 'Showdown', text: 'Face the Salt Union at Meridian Pier (E)' };
        if (this.stage === 1) return { x: pier.x, y: pier.y, title: 'Showdown', text: 'Survive the Salt Union — wave ' + this.wave + ' of 2' };
        return { x: bar.x, y: bar.y, title: 'Showdown', text: 'Get back to Mara at The Anchor Bar' };
      default:
        return { x: bar.x, y: bar.y, title: 'Free Roam', text: 'Explore Port Meridian' };
    }
  }

  completeMission(game, reward, dialog) {
    const title = this.current ? this.current.title : 'Job';
    game.player.cash += reward;
    game.stats.missionsDone += 1;
    game.sound.missionSting(true);
    game.sound.cash();
    game.showBanner('MISSION COMPLETE', title + '  ·  +$' + reward);
    if (dialog) game.showDialog('Mara Voss', dialog);
    this.index += 1;
    this.stage = 0;
    this.packageCarried = false;
    if (this.index >= STORY.length) {
      this.storyDone = true;
      game.showDialog('Mara Voss', 'The docks are ours again, Jae. The city is yours now — keep earning.');
    }
    game.autosave();
  }

  failMission(game, reason) {
    game.sound.missionSting(false);
    game.showBanner('MISSION FAILED', reason + ' — the job restarts');
    this.stage = 0;
    this.packageCarried = false;
    this.courier = null;
    this.wave = 0;
  }

  // E-key interactions with the world, in story order. Returns true if used.
  handleInteract(game) {
    const p = game.player;
    if (p.inVehicle) return false;
    const near = (site, r) => distance(p.x, p.y, site.x, site.y) < (r || 56);
    const bar = siteById('bar');
    const warehouse = siteById('warehouse');
    const market = siteById('market');
    const pier = siteById('pier');

    if (this.dockRun) {
      const from = siteById(this.dockRun.from);
      const to = siteById(this.dockRun.to);
      if (this.dockRun.stage === 0 && near(from, 60)) {
        this.dockRun.stage = 1;
        this.packageCarried = true;
        game.showToast('Parcel collected — deliver it to ' + to.name);
        return true;
      }
      if (this.dockRun.stage === 1 && near(to, 60)) {
        const reward = this.dockRun.reward;
        game.player.cash += reward;
        game.stats.dockRuns += 1;
        game.sound.cash();
        game.showBanner('DOCK RUN COMPLETE', '+$' + reward);
        this.dockRun = null;
        this.packageCarried = false;
        game.autosave();
        return true;
      }
      return false;
    }
    if (this.storyDone) return false;

    if (this.index === 0) {
      if (this.stage === 0 && near(bar)) {
        game.showDialog('Mara Voss', 'Jae. The Salt Union wants its money Friday. Work for me and you eat. First: a package at Warehouse 9.');
        this.stage = 1;
        return true;
      }
      if (this.stage === 2 && near(warehouse, 64)) {
        this.packageCarried = true;
        this.stage = 3;
        game.showToast('Package collected');
        game.sound.pickup();
        return true;
      }
      if (this.stage === 3 && near(market, 64)) {
        this.completeMission(game, 350, 'Clean work. Next: a rich man in the Heights owns a Solstice GT he will not miss for long.');
        return true;
      }
    }
    if (this.index === 2) {
      if (this.stage === 0 && near(market, 64)) {
        game.showDialog('Informant', 'The courier runs the Downtown lanes in a grey coat. Stop him — gently or otherwise — and take the ledger.');
        this.spawnCourier(game);
        this.stage = 1;
        return true;
      }
      if (this.stage === 2 && near(bar)) {
        if (!game.player.hasPistol) {
          game.player.hasPistol = true;
          game.player.weapon = 'pistol';
          game.player.ammo += 48;
          game.showToast('Mara gives you a pistol — press 2, aim with the mouse, click to fire');
        }
        this.completeMission(game, 450, 'A pistol and a warning: the Union is moving cargo through my harbour tonight.');
        return true;
      }
    }
    if (this.index === 3 && this.stage === 0 && near(warehouse, 64)) {
      game.showDialog('Dock Crew', 'The van is loaded and hot. Beach House, fast. Every patrol in the port will be looking.');
      this.stage = 1;
      return true;
    }
    if (this.index === 4 && this.stage === 0 && near(pier, 70)) {
      game.showDialog('Salt Union', 'You should have paid, Corin. Boys — take the pier back.');
      this.wave = 1;
      this.waveKills = 0;
      this.spawnWave(game);
      this.stage = 1;
      return true;
    }
    return false;
  }

  spawnCourier(game) {
    const market = siteById('market');
    const courier = new Thug(market.x + 420, market.y - 130, 'Salt Union courier');
    courier.health = 42;
    courier.maxHealth = 42;
    courier.speed = 232;
    courier.shirt = '#6c757d';
    courier.isCourier = true;
    this.courier = courier;
    game.thugs.push(courier);
  }

  spawnWave(game) {
    const pier = siteById('pier');
    const spots = [
      { x: pier.x - 130, y: pier.y - 60 },
      { x: pier.x - 60, y: pier.y + 70 },
      { x: pier.x + 30, y: pier.y - 90 },
    ];
    for (const s of spots) {
      const thug = new Thug(s.x, s.y, 'Salt Union enforcer');
      game.thugs.push(thug);
    }
    game.showToast('Wave ' + this.wave + ' — three enforcers');
  }

  onThugDown(game, thug) {
    if (thug.isCourier && this.index === 2 && this.stage === 1) {
      game.pickups.push(new Pickup('ledger', thug.x + 14, thug.y, 0));
      game.showToast('The courier dropped the ledger — walk over it');
      this.courier = null;
      this.stage = 2;
      return;
    }
    if (this.index === 4 && this.stage === 1) {
      this.waveKills += 1;
      const alive = game.thugs.filter((t) => !t.dead).length;
      if (alive === 0) {
        if (this.wave === 1) {
          this.wave = 2;
          this.spawnWave(game);
        } else {
          game.police.setWanted(3);
          game.showDialog('Mara Voss (phone)', 'The pier is ours — but the port police heard everything. Get back to the bar, Jae.');
          this.stage = 2;
        }
      }
    }
  }

  onPlayerEnterVehicle(game, vehicle) {
    if (this.storyDone) return;
    if (this.index === 1 && this.stage === 1 && vehicle.isStoryCar) {
      game.police.setWanted(2);
      game.showBanner('VEHICLE STOLEN', 'The villa alarm is screaming — get to Tito\'s Garage');
      game.reportCrime('steal', vehicle.x, vehicle.y);
      this.stage = 2;
    }
    if (this.index === 3 && this.stage === 1 && vehicle.isCargoVan) {
      game.police.setWanted(3);
      game.showBanner('HOT CARGO', 'Every patrol in the port just heard your engine');
      this.stage = 2;
    }
  }

  startDockRun(game) {
    const pool = SITES.filter((s) => s.id !== 'pier' && s.id !== 'station');
    const from = pool[Math.floor(Math.random() * pool.length)];
    let to = pool[Math.floor(Math.random() * pool.length)];
    if (to.id === from.id) to = pool[(pool.indexOf(from) + 3) % pool.length];
    const reward = 120 + Math.round(distance(from.x, from.y, to.x, to.y) / 9);
    this.dockRun = { from: from.id, to: to.id, stage: 0, reward };
    game.showToast('Dock run: collect a parcel at ' + from.name);
  }

  update(game, dt) {
    const p = game.player;
    const obj = this.objective();

    // Radius-based story steps.
    if (!this.storyDone) {
      if (this.index === 0 && this.stage === 1 && p.inVehicle && distance(p.vehicle.x, p.vehicle.y, obj.x, obj.y) < 110) {
        this.stage = 2;
        game.showToast('Park up and take the package on foot (E)');
      }
      if (this.index === 1 && this.stage === 0 && distance(p.x, p.y, obj.x, obj.y) < 90) {
        this.stage = 1;
      }
      if (this.index === 1 && this.stage === 2 && p.inVehicle && p.vehicle.isStoryCar && distance(p.vehicle.x, p.vehicle.y, obj.x, obj.y) < 100) {
        p.vehicle.isStoryCar = false;
        game.exitVehicle(true);
        this.completeMission(game, 500, 'Tito will move that GT tonight. Now — a courier in the Old Market carries the Union ledger.');
      }
      if (this.index === 3 && this.stage === 2) {
        const van = game.vehicles.find((v) => v.isCargoVan);
        if (van && van.dead) {
          this.failMission(game, 'The cargo van was wrecked');
        } else if (p.inVehicle && p.vehicle.isCargoVan && distance(p.vehicle.x, p.vehicle.y, obj.x, obj.y) < 110) {
          p.vehicle.isCargoVan = false;
          game.exitVehicle(true);
          this.completeMission(game, 700, 'Cargo delivered. One last thing, Jae: the Union is coming to the pier tonight. End it.');
        }
      }
      if (this.index === 4 && this.stage === 2 && !p.inVehicle && distance(p.x, p.y, obj.x, obj.y) < 62) {
        this.completeMission(game, 1200, null);
      }
      // The courier runs from the player and never shoots.
      if (this.courier && !this.courier.dead) {
        const c = this.courier;
        c.fireCooldown = 99;
        const away = Math.atan2(c.y - p.y, c.x - p.x);
        c.angle = away;
        c.x += Math.cos(away) * c.speed * dt;
        c.y += Math.sin(away) * c.speed * dt;
        c.walkPhase += dt * 14;
        if (distance(c.x, c.y, p.x, p.y) > 900) {
          c.x = p.x + Math.cos(away) * 500;
          c.y = p.y + Math.sin(away) * 500;
        }
      }
    }

    this.updateCrates(game);
    this.updateTaxi(game, dt);
  }

  updateCrates(game) {
    const p = game.player;
    if (p.inVehicle) return;
    for (const spot of this.city.crateSpots) {
      if (this.cratesFound.has(spot.id)) continue;
      if (distance(p.x, p.y, spot.x, spot.y) < 24) {
        this.cratesFound.add(spot.id);
        p.cash += 25;
        game.stats.crates += 1;
        game.sound.cash();
        game.effects.splashCash(spot.x, spot.y - 14, '+$25 crate ' + this.cratesFound.size + '/16');
        if (this.cratesFound.size === 16 && !this.crateBonusPaid) {
          this.crateBonusPaid = true;
          p.cash += 300;
          game.showBanner('ALL CRATES FOUND', 'Harbour scavenger bonus +$300');
        }
        game.autosave();
      }
    }
  }

  updateTaxi(game, dt) {
    const p = game.player;
    // A passenger hails now and then while the player is driving.
    if (!this.taxi) {
      this.taxiSpawnTimer -= dt;
      if (this.taxiSpawnTimer <= 0) {
        this.taxiSpawnTimer = 26 + Math.random() * 20;
        if (p.inVehicle) {
          const ped = game.pedestrians.find((q) => q.state === 'walk' && distance(q.x, q.y, p.x, p.y) > 200 && distance(q.x, q.y, p.x, p.y) < 460);
          if (ped) {
            ped.state = 'hail';
            this.taxi = { ped, stage: 'pickup', dest: null, fare: 0 };
            game.showToast('A passenger is hailing you — stop beside them');
          }
        }
      }
      return;
    }
    const taxi = this.taxi;
    if (taxi.stage === 'pickup') {
      if (!p.inVehicle || distance(p.vehicle.x, p.vehicle.y, taxi.ped.x, taxi.ped.y) > 620) {
        taxi.ped.state = 'walk';
        this.taxi = null;
        return;
      }
      if (Math.abs(p.vehicle.speed) < 12 && distance(p.vehicle.x, p.vehicle.y, taxi.ped.x, taxi.ped.y) < 52) {
        taxi.ped.state = 'passenger';
        const dests = SITES.filter((s) => distance(s.x, s.y, taxi.ped.x, taxi.ped.y) > 500);
        taxi.dest = dests[Math.floor(Math.random() * dests.length)];
        taxi.fare = 40 + Math.round(distance(taxi.ped.x, taxi.ped.y, taxi.dest.x, taxi.dest.y) / 11);
        taxi.stage = 'dropoff';
        game.showDialog('Passenger', 'Take me to ' + taxi.dest.name + ', friend. Fare is $' + taxi.fare + '.');
        game.sound.doorSlam();
      }
    } else if (taxi.stage === 'dropoff') {
      if (!p.inVehicle) {
        game.showToast('Your passenger waits in the car');
        return;
      }
      if (distance(p.vehicle.x, p.vehicle.y, taxi.dest.x, taxi.dest.y) < 78 && Math.abs(p.vehicle.speed) < 14) {
        p.cash += taxi.fare;
        game.stats.taxis += 1;
        game.sound.cash();
        game.effects.splashCash(p.x, p.y - 20, '+$' + taxi.fare + ' fare');
        taxi.ped.x = taxi.dest.x + 18;
        taxi.ped.y = taxi.dest.y + 10;
        taxi.ped.state = 'walk';
        this.taxi = null;
        game.autosave();
      }
    }
  }

  taxiObjective() {
    if (!this.taxi) return null;
    if (this.taxi.stage === 'pickup') {
      return { x: this.taxi.ped.x, y: this.taxi.ped.y, title: 'Taxi', text: 'Pick up the passenger' };
    }
    return { x: this.taxi.dest.x, y: this.taxi.dest.y, title: 'Taxi · $' + this.taxi.fare, text: 'Drop off at ' + this.taxi.dest.name };
  }
}
