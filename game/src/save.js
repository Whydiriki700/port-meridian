// Save and load Port Meridian progress in the browser (localStorage).

const SAVE_KEY = 'port-meridian-save-v1';

export function hasSave() {
  try {
    return window.localStorage.getItem(SAVE_KEY) !== null;
  } catch (err) {
    return false;
  }
}

export function writeSave(game) {
  const data = {
    version: 1,
    cash: game.player.cash,
    health: game.player.health,
    armour: game.player.armour,
    hasPistol: game.player.hasPistol,
    ammo: game.player.ammo,
    playerX: game.player.x,
    playerY: game.player.y,
    missionIndex: game.missions.index,
    cratesFound: Array.from(game.missions.cratesFound),
    timeOfDay: game.timeOfDay,
    stats: game.stats,
    storyDone: game.missions.storyDone,
  };
  try {
    window.localStorage.setItem(SAVE_KEY, JSON.stringify(data));
    return true;
  } catch (err) {
    return false;
  }
}

export function readSave() {
  try {
    const raw = window.localStorage.getItem(SAVE_KEY);
    if (!raw) return null;
    const data = JSON.parse(raw);
    if (!data || data.version !== 1) return null;
    return data;
  } catch (err) {
    return null;
  }
}

export function clearSave() {
  try {
    window.localStorage.removeItem(SAVE_KEY);
  } catch (err) {
    // Storage unavailable: a fresh start is the fallback.
  }
}
