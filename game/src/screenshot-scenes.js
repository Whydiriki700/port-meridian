// Deterministic scenes for the maker's own screenshots: each one starts the
// real game mid-action so a still frame shows several systems at once —
// traffic, the HUD and minimap, a mission objective, police, combat.
// Reached with a query string such as ?shot=cover when serving the game.

import { siteById } from './city.js';
import { Vehicle } from './vehicles.js';
import { Thug } from './combat.js';

export function shotNameFromUrl() {
  try {
    return new URLSearchParams(window.location.search).get('shot');
  } catch (err) {
    return null;
  }
}

function putPlayerInCar(game, modelKey, x, y, angle, speed, color) {
  const car = new Vehicle(modelKey, x, y, angle, color || undefined);
  car.mode = 'player';
  car.speed = speed;
  game.vehicles.push(car);
  game.player.inVehicle = true;
  game.player.vehicle = car;
  game.player.x = x;
  game.player.y = y;
  return car;
}

function addPoliceCar(game, x, y, angle, speed) {
  const car = new Vehicle('interceptor', x, y, angle, '#eef1f4');
  car.mode = 'police';
  car.health = 130;
  car.speed = speed;
  game.vehicles.push(car);
  game.police.cars.push(car);
  return car;
}

export function applyShotScene(game, name) {
  const p = game.player;
  if (name === 'cover') {
    // Golden-hour chase through Downtown, mid-mission, three stars.
    game.timeOfDay = 17 * 60 + 35;
    game.missions.index = 3;
    game.missions.stage = 2;
    const van = game.vehicles.find((v) => v.isCargoVan);
    if (van) {
      van.mode = 'player';
      van.x = 1580; van.y = 1000; van.angle = 0; van.speed = 250;
      p.inVehicle = true;
      p.vehicle = van;
      p.x = van.x; p.y = van.y;
    }
    game.police.heat = 3.2;
    addPoliceCar(game, 1430, 955, 0.12, 235);
    addPoliceCar(game, 1380, 1062, -0.1, 220);
    game.showBanner('HOT CARGO', 'Deliver the van to Solmar Beach House');
    game.bannerTimer = 999;
  } else if (name === 'foot') {
    // On foot in the Harbor District, package run in progress, morning light.
    game.timeOfDay = 9 * 60 + 40;
    game.missions.index = 0;
    game.missions.stage = 2;
    const wh = siteById('warehouse');
    p.x = wh.x - 60;
    p.y = wh.y + 26;
    p.angle = 0.4;
    p.cash = 285;
  } else if (name === 'combat') {
    // The pier showdown: pistol out, enforcers closing in, two stars.
    game.timeOfDay = 15 * 60 + 20;
    game.missions.index = 4;
    game.missions.stage = 1;
    game.missions.wave = 1;
    const pier = siteById('pier');
    p.x = pier.x - 40;
    p.y = pier.y + 6;
    p.angle = 0.2;
    p.hasPistol = true;
    p.weapon = 'pistol';
    p.ammo = 31;
    p.cash = 1740;
    p.armour = 55;
    game.thugs.push(new Thug(pier.x + 120, pier.y - 62, 'Salt Union enforcer'));
    game.thugs.push(new Thug(pier.x + 165, pier.y + 66, 'Salt Union enforcer'));
    game.thugs.push(new Thug(pier.x + 70, pier.y + 128, 'Salt Union enforcer'));
    game.police.heat = 2.1;
    addPoliceCar(game, pier.x - 260, pier.y - 120, 0.5, 60);
  } else if (name === 'night') {
    // Night run down the coastal avenue, headlights on, one star.
    game.timeOfDay = 21 * 60 + 25;
    putPlayerInCar(game, 'solstice', 2900, 1420, Math.PI / 2, 265, '#f2b705');
    game.missions.index = 1;
    game.missions.stage = 2;
    game.missions.storyDone = false;
    p.cash = 860;
    game.police.heat = 1.2;
    addPoliceCar(game, 2900, 1180, Math.PI / 2, 240);
    game.showToast('Deliver the Solstice GT to Tito\'s Garage');
    game.toastTimer = 999;
  }
  game.state = 'playing';
}
