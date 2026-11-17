// Combat: the player's pistol, the bullets it fires, muzzle flashes, and the rival
// gang members who shoot back. Melee is a short-range punch for when ammo runs out.
import { PLAYER } from './config.js';
import { angleTo, dist } from './random.js';

export function createCombat() {
  return {
    bullets: [], // {x,y,vx,vy,life,from:'player'|'gang',damage}
    gang: [], // {x,y,angle,hp,shootTimer,alive}
    muzzle: 0,
    shootCooldown: 0,
  };
}

export function fireBullet(combat, x, y, angle, from, damage) {
  const speed = 900;
  combat.bullets.push({
    x: x + Math.cos(angle) * 24,
    y: y + Math.sin(angle) * 24,
    vx: Math.cos(angle) * speed,
    vy: Math.sin(angle) * speed,
    life: 0.9,
    from,
    damage,
  });
  if (from === 'player') combat.muzzle = 0.08;
}

export function spawnGang(combat, random, x, y, count) {
  combat.gang.length = 0;
  for (let i = 0; i < count; i += 1) {
    combat.gang.push({
      x: x + (random() - 0.5) * 260,
      y: y + (random() - 0.5) * 200,
      angle: 0,
      hp: 60,
      shootTimer: 0.5 + random() * 1.2,
      alive: true,
    });
  }
}

export function stepCombat(combat, dt, random, player, city, onPlayerHit) {
  if (combat.shootCooldown > 0) combat.shootCooldown -= dt;
  if (combat.muzzle > 0) combat.muzzle -= dt;

  for (const g of combat.gang) {
    if (!g.alive) continue;
    const d = dist(g.x, g.y, player.x, player.y);
    g.angle = angleTo(g.x, g.y, player.x, player.y);
    g.shootTimer -= dt;
    if (d < 520 && g.shootTimer <= 0 && !player.inCar) {
      fireBullet(combat, g.x, g.y, g.angle + (random() - 0.5) * 0.2, 'gang', 8);
      g.shootTimer = 1.1 + random() * 0.9;
    } else if (d > 260) {
      // Close the distance on foot.
      g.x += Math.cos(g.angle) * 130 * dt;
      g.y += Math.sin(g.angle) * 130 * dt;
      const fixed = city.resolveBuildings(g.x, g.y, 12);
      g.x = fixed.x;
      g.y = fixed.y;
    }
  }

  for (const b of combat.bullets) {
    b.x += b.vx * dt;
    b.y += b.vy * dt;
    b.life -= dt;
    if (b.life <= 0) continue;
    if (city.buildingAt(b.x, b.y, 0)) { b.life = 0; continue; }
    if (b.from === 'player') {
      for (const g of combat.gang) {
        if (g.alive && dist(b.x, b.y, g.x, g.y) < 18) {
          g.hp -= b.damage;
          b.life = 0;
          if (g.hp <= 0) g.alive = false;
          break;
        }
      }
    } else if (!player.inCar && dist(b.x, b.y, player.x, player.y) < PLAYER.radius) {
      player.health -= b.damage;
      b.life = 0;
      onPlayerHit(b.damage);
    }
  }
  combat.bullets = combat.bullets.filter((b) => b.life > 0);
  combat.gang = combat.gang.filter((g) => g.alive);
  return combat.gang.length;
}
