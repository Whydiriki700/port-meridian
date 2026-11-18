// The Port Meridian HUD: health and cash, wanted stars, the city clock, an
// objective banner, dialogue and toasts, and a live minimap with blips for
// the player, the police, passengers and the current objective.

import { clamp, formatCash, formatClock } from './util.js';
import { WORLD_W, WORLD_H, V_ROADS, H_ROADS, WATER_X, districtAt } from './city.js';

function panel(ctx, x, y, w, h) {
  ctx.fillStyle = 'rgba(8, 18, 28, 0.66)';
  ctx.beginPath();
  ctx.roundRect(x, y, w, h, 9);
  ctx.fill();
  ctx.strokeStyle = 'rgba(240, 178, 84, 0.35)';
  ctx.lineWidth = 1;
  ctx.stroke();
}

function bar(ctx, x, y, w, h, ratio, color, back) {
  ctx.fillStyle = back || 'rgba(255,255,255,0.16)';
  ctx.fillRect(x, y, w, h);
  ctx.fillStyle = color;
  ctx.fillRect(x, y, w * clamp(ratio, 0, 1), h);
}

function drawMinimap(ctx, game, x, y, w, h) {
  panel(ctx, x - 6, y - 6, w + 12, h + 12);
  const sx = w / WORLD_W;
  const sy = h / WORLD_H;
  ctx.save();
  ctx.beginPath();
  ctx.rect(x, y, w, h);
  ctx.clip();
  ctx.fillStyle = '#5d7d52';
  ctx.fillRect(x, y, w, h);
  ctx.fillStyle = '#2e7fa8';
  ctx.fillRect(x + WATER_X * sx, y, (WORLD_W - WATER_X) * sx, h);
  ctx.strokeStyle = 'rgba(30, 34, 40, 0.85)';
  ctx.lineWidth = 3;
  for (const rx of V_ROADS) {
    ctx.beginPath();
    ctx.moveTo(x + rx * sx, y);
    ctx.lineTo(x + rx * sx, y + h);
    ctx.stroke();
  }
  for (const ry of H_ROADS) {
    ctx.beginPath();
    ctx.moveTo(x, y + ry * sy);
    ctx.lineTo(x + w, y + ry * sy);
    ctx.stroke();
  }
  const dot = (wx, wy, color, r) => {
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.arc(x + wx * sx, y + wy * sy, r, 0, Math.PI * 2);
    ctx.fill();
  };
  // Objective first, then police, then the player on top.
  const obj = game.activeObjective;
  if (obj && obj.x) {
    const pulse = 3.4 + Math.sin(game.timeSec * 5) * 1.1;
    dot(obj.x, obj.y, '#ffd94d', pulse);
    ctx.strokeStyle = '#ffd94d';
    ctx.lineWidth = 1.4;
    ctx.beginPath();
    ctx.arc(x + obj.x * sx, y + obj.y * sy, pulse + 3.4, 0, Math.PI * 2);
    ctx.stroke();
  }
  for (const car of game.police.cars) if (!car.dead) dot(car.x, car.y, Math.sin(game.timeSec * 9) > 0 ? '#ff5252' : '#5e8bff', 2.6);
  for (const officer of game.police.officers) if (!officer.dead) dot(officer.x, officer.y, '#ff5252', 2);
  for (const thug of game.thugs) if (!thug.dead) dot(thug.x, thug.y, '#ff8c42', 2.2);
  const p = game.player;
  const px = p.inVehicle ? p.vehicle.x : p.x;
  const py = p.inVehicle ? p.vehicle.y : p.y;
  ctx.save();
  ctx.translate(x + px * sx, y + py * sy);
  ctx.rotate(p.inVehicle ? p.vehicle.angle : p.angle);
  ctx.fillStyle = '#ffffff';
  ctx.beginPath();
  ctx.moveTo(6, 0);
  ctx.lineTo(-4, -4);
  ctx.lineTo(-4, 4);
  ctx.closePath();
  ctx.fill();
  ctx.restore();
  ctx.restore();
  ctx.fillStyle = 'rgba(255,255,255,0.85)';
  ctx.font = 'bold 10px system-ui, sans-serif';
  ctx.fillText('PORT MERIDIAN', x + 2, y + h + 16);
}

export function drawHUD(ctx, game, w, h) {
  const p = game.player;
  ctx.textAlign = 'left';

  // Top-left: vitals, cash, weapon.
  panel(ctx, 14, 14, 218, 86);
  bar(ctx, 26, 28, 150, 13, p.health / 100, p.health > 28 ? '#7ed957' : '#e05252');
  ctx.fillStyle = '#ffffff';
  ctx.font = 'bold 11px system-ui, sans-serif';
  ctx.fillText('HEALTH', 26, 24);
  if (p.armour > 0) bar(ctx, 26, 47, 150, 7, p.armour / 100, '#7fb2e0');
  ctx.fillStyle = '#ffd94d';
  ctx.font = 'bold 19px system-ui, sans-serif';
  ctx.fillText(formatCash(p.cash), 26, 76);
  ctx.fillStyle = '#d9e6ee';
  ctx.font = '12px system-ui, sans-serif';
  const weaponText = p.weapon === 'pistol' ? 'PISTOL · ' + p.ammo : 'FISTS';
  ctx.fillText(weaponText, 128, 76);
  ctx.fillStyle = '#9fb6c6';
  ctx.font = '11px system-ui, sans-serif';
  ctx.fillText('Crates ' + game.missions.cratesFound.size + '/16 · Missions ' + game.stats.missionsDone, 26, 93);

  // Top-right: wanted stars, clock, district.
  const wanted = game.police.wanted;
  ctx.font = '26px system-ui, sans-serif';
  ctx.textAlign = 'right';
  for (let i = 0; i < 5; i++) {
    ctx.fillStyle = i < wanted ? '#ffd94d' : 'rgba(255,255,255,0.22)';
    ctx.fillText('★', w - 18 - (4 - i) * 28, 40);
  }
  ctx.fillStyle = '#ffffff';
  ctx.font = 'bold 15px system-ui, sans-serif';
  ctx.fillText(formatClock(game.timeOfDay), w - 18, 64);
  ctx.fillStyle = '#bcd2e0';
  ctx.font = '12px system-ui, sans-serif';
  const body = p.inVehicle ? p.vehicle : p;
  ctx.fillText(districtAt(body.x, body.y), w - 18, 82);
  ctx.textAlign = 'left';

  // Objective panel, top centre.
  const obj = game.activeObjective;
  if (obj) {
    ctx.font = 'bold 13px system-ui, sans-serif';
    const titleW = ctx.measureText(obj.title.toUpperCase()).width;
    ctx.font = '13px system-ui, sans-serif';
    const textW = ctx.measureText(obj.text).width;
    const pw = Math.max(titleW, textW) + 28;
    panel(ctx, w / 2 - pw / 2, 14, pw, 52);
    ctx.fillStyle = '#f0b254';
    ctx.font = 'bold 13px system-ui, sans-serif';
    ctx.fillText(obj.title.toUpperCase(), w / 2 - pw / 2 + 14, 35);
    ctx.fillStyle = '#ffffff';
    ctx.font = '13px system-ui, sans-serif';
    ctx.fillText(obj.text, w / 2 - pw / 2 + 14, 55);
  }

  drawMinimap(ctx, game, 20, h - 176, 196, 148);

  // Bottom-right: vehicle readout.
  if (p.inVehicle) {
    panel(ctx, w - 216, h - 96, 202, 82);
    ctx.fillStyle = '#ffffff';
    ctx.font = 'bold 14px system-ui, sans-serif';
    ctx.fillText(p.vehicle.name, w - 202, h - 70);
    ctx.fillStyle = '#ffd94d';
    ctx.font = 'bold 20px system-ui, sans-serif';
    ctx.fillText(Math.round(Math.abs(p.vehicle.speed) * 0.36) + ' km/h', w - 202, h - 44);
    bar(ctx, w - 202, h - 34, 150, 7, p.vehicle.health / 100, '#7fb2e0');
  }

  // Arrest meter.
  if (game.police.arrestProgress > 0.02) {
    ctx.fillStyle = 'rgba(10, 16, 22, 0.7)';
    ctx.fillRect(w / 2 - 130, h - 150, 260, 34);
    ctx.fillStyle = '#ff5252';
    ctx.font = 'bold 14px system-ui, sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('BEING ARRESTED — RUN!', w / 2, h - 136);
    bar(ctx, w / 2 - 110, h - 128, 220, 6, game.police.arrestProgress, '#ff5252');
    ctx.textAlign = 'left';
  }

  // Interaction prompt.
  if (game.promptText) {
    ctx.font = 'bold 15px system-ui, sans-serif';
    const tw = ctx.measureText(game.promptText).width + 30;
    panel(ctx, w / 2 - tw / 2, h - 64, tw, 36);
    ctx.fillStyle = '#ffffff';
    ctx.textAlign = 'center';
    ctx.fillText(game.promptText, w / 2, h - 41);
    ctx.textAlign = 'left';
  }

  // Dialogue line.
  if (game.dialog && game.dialogTimer > 0) {
    const dw = Math.min(w - 80, 720);
    panel(ctx, w / 2 - dw / 2, h - 128, dw, 52);
    ctx.fillStyle = '#f0b254';
    ctx.font = 'bold 13px system-ui, sans-serif';
    ctx.fillText(game.dialog.speaker, w / 2 - dw / 2 + 16, h - 106);
    ctx.fillStyle = '#ffffff';
    ctx.font = '14px system-ui, sans-serif';
    wrapText(ctx, game.dialog.text, w / 2 - dw / 2 + 16, h - 86, dw - 32, 17, 2);
  }

  // Toast.
  if (game.toast && game.toastTimer > 0) {
    ctx.font = 'bold 15px system-ui, sans-serif';
    ctx.textAlign = 'center';
    ctx.fillStyle = 'rgba(10, 20, 30, 0.75)';
    const tw = ctx.measureText(game.toast).width + 34;
    ctx.fillRect(w / 2 - tw / 2, 84, tw, 32);
    ctx.fillStyle = '#ffe9b0';
    ctx.fillText(game.toast, w / 2, 105);
    ctx.textAlign = 'left';
  }

  // Mission banner.
  if (game.banner && game.bannerTimer > 0) {
    const alpha = clamp(game.bannerTimer, 0, 1);
    ctx.globalAlpha = alpha;
    ctx.textAlign = 'center';
    ctx.fillStyle = '#ffd94d';
    ctx.font = 'bold 40px Georgia, serif';
    ctx.fillText(game.banner.title, w / 2, h * 0.3);
    ctx.fillStyle = '#ffffff';
    ctx.font = '17px system-ui, sans-serif';
    ctx.fillText(game.banner.sub, w / 2, h * 0.3 + 30);
    ctx.globalAlpha = 1;
    ctx.textAlign = 'left';
  }

  // Low-health pulse.
  if (p.health < 26 && p.alive) {
    const pulse = 0.1 + Math.sin(game.timeSec * 6) * 0.05;
    ctx.fillStyle = 'rgba(190, 30, 30,' + pulse.toFixed(3) + ')';
    ctx.fillRect(0, 0, w, h);
  }
}

function wrapText(ctx, text, x, y, maxWidth, lineHeight, maxLines) {
  const words = text.split(' ');
  let line = '';
  let lines = 0;
  for (const word of words) {
    const test = line ? line + ' ' + word : word;
    if (ctx.measureText(test).width > maxWidth && line) {
      ctx.fillText(line, x, y + lines * lineHeight);
      line = word;
      lines += 1;
      if (lines >= maxLines) return;
    } else {
      line = test;
    }
  }
  if (line && lines < maxLines) ctx.fillText(line, x, y + lines * lineHeight);
}

// An arrow at the player's feet pointing toward an off-screen objective.
export function drawObjectiveArrow(ctx, game) {
  const obj = game.activeObjective;
  if (!obj || !obj.x) return;
  const p = game.player;
  const body = p.inVehicle ? p.vehicle : p;
  const dx = obj.x - body.x;
  const dy = obj.y - body.y;
  const d = Math.sqrt(dx * dx + dy * dy);
  if (d < 60) return;
  const angle = Math.atan2(dy, dx);
  ctx.save();
  ctx.translate(body.x, body.y);
  ctx.rotate(angle);
  ctx.fillStyle = 'rgba(255, 217, 77, 0.9)';
  ctx.beginPath();
  ctx.moveTo(34, 0);
  ctx.lineTo(20, -8);
  ctx.lineTo(20, 8);
  ctx.closePath();
  ctx.fill();
  ctx.restore();
  ctx.fillStyle = '#ffd94d';
  ctx.font = 'bold 11px system-ui, sans-serif';
  ctx.textAlign = 'center';
  ctx.fillText(Math.round(d / 10) + 'm', body.x, body.y - 30);
  ctx.textAlign = 'left';
}
