// The law: wanted stars, the heat that feeds them, police officers on foot and in cars,
// the chase, the arrest (busted) and the slow cool-down when the player slips away.
import { CAR, PLACES, WANTED } from './config.js';
import { angleDiff, angleTo, clamp, dist } from './random.js';
import { makeCar } from './vehicles.js';

export function createPolice() {
  return {
    wanted: 0,
    heat: 0,
    coolTimer: 0,
    bustTimer: 0,
    cops: [], // {x,y,angle,speed,kind:'foot',carId?}
  };
}

export function addWanted(police, stars, reason) {
  police.wanted = clamp(police.wanted + stars, 0, WANTED.max);
  police.heat = Math.max(police.heat, police.wanted);
  police.coolTimer = 0;
  return reason;
}

/** Where a police car should appear: on a road a little way from the player. */
function spawnPoint(random, city, px, py) {
  for (let tries = 0; tries < 12; tries += 1) {
    const p = city.randomRoadPoint();
    const d = dist(p.x, p.y, px, py);
    if (d > 500 && d < 1100) return p;
  }
  return { x: px + 600, y: py, vertical: true };
}

export function stepPolice(police, dt, random, city, player, cars, onBusted) {
  const wanted = police.wanted;
  // Spawn to match the wanted level: foot cops plus a police car per 2 stars.
  const wantFoot = wanted >= 1 ? Math.min(2 + wanted, 6) : 0;
  const wantCars = wanted >= 2 ? Math.min(wanted - 1, 3) : 0;
  const foot = police.cops.filter((c) => c.kind === 'foot');
  const carCops = police.cops.filter((c) => c.kind === 'car');
  if (foot.length < wantFoot) {
    const p = spawnPoint(random, city, player.x, player.y);
    police.cops.push({ x: p.x, y: p.y, angle: 0, speed: 0, kind: 'foot' });
  }
  if (carCops.length < wantCars) {
    const p = spawnPoint(random, city, player.x, player.y);
    const car = makeCar(random, 'police', p.x, p.y, p.vertical ? Math.PI / 2 : 0);
    car.driver = 'police';
    car.vertical = p.vertical;
    cars.push(car);
    police.cops.push({ x: p.x, y: p.y, angle: 0, speed: 0, kind: 'car', carId: car.id });
  }
  // Drop extras when the wanted level falls.
  while (police.cops.filter((c) => c.kind === 'foot').length > wantFoot) {
    const i = police.cops.findIndex((c) => c.kind === 'foot');
    police.cops.splice(i, 1);
  }
  while (police.cops.filter((c) => c.kind === 'car').length > wantCars) {
    const i = police.cops.findIndex((c) => c.kind === 'car');
    const cop = police.cops[i];
    const car = cars.find((c) => c.id === cop.carId);
    if (car) car.dead = true;
    police.cops.splice(i, 1);
  }

  let nearestCop = Infinity;
  let busted = false;
  for (const cop of police.cops) {
    if (cop.kind === 'foot') {
      const d = dist(cop.x, cop.y, player.x, player.y);
      nearestCop = Math.min(nearestCop, d);
      const target = angleTo(cop.x, cop.y, player.x, player.y);
      cop.angle += clamp(angleDiff(cop.angle, target), -4 * dt, 4 * dt);
      const speed = player.inCar ? 0 : 250 + wanted * 12;
      cop.speed = speed;
      cop.x += Math.cos(cop.angle) * speed * dt;
      cop.y += Math.sin(cop.angle) * speed * dt;
      const fixedFoot = city.resolveBuildings(cop.x, cop.y, 12);
      cop.x = fixedFoot.x;
      cop.y = fixedFoot.y;
      if (!player.inCar && d < 30) {
        police.bustTimer += dt;
        if (police.bustTimer > 1.1) busted = true;
      }
    } else {
      // The police car chases the player's car (or the player on foot) by steering at them.
      const car = cars.find((c) => c.id === cop.carId);
      if (!car || car.dead) continue;
      const d = dist(car.x, car.y, player.x, player.y);
      nearestCop = Math.min(nearestCop, d);
      const target = angleTo(car.x, car.y, player.x, player.y);
      car.angle += clamp(angleDiff(car.angle, target), -2.4 * dt, 2.4 * dt);
      const wantSpeed = Math.min(680, 480 + wanted * 45);
      car.speed += clamp(wantSpeed - car.speed, -CAR.brake * dt, CAR.accel * dt);
      car.x += Math.cos(car.angle) * car.speed * dt;
      car.y += Math.sin(car.angle) * car.speed * dt;
      // Police cars cannot drive through buildings: slide along them instead.
      const fixedCar = city.resolveBuildings(car.x, car.y, car.w / 2 - 2);
      if (fixedCar.x !== car.x || fixedCar.y !== car.y) {
        car.x = fixedCar.x;
        car.y = fixedCar.y;
        car.speed *= 0.5;
      }
      const clampedCar = city.clampInside(car.x, car.y, car.w / 2);
      car.x = clampedCar.x;
      car.y = clampedCar.y;
      car.siren = (car.siren || 0) + dt;
      cop.x = car.x;
      cop.y = car.y;
      // Ramming the player's car damages it.
      if (player.inCar && d < 52) {
        const pc = cars.find((c) => c.id === player.carId);
        if (pc) pc.hp -= 14 * dt;
      }
    }
  }
  if (nearestCop > 60) police.bustTimer = 0;

  // Cool down: no cop close for a while and the stars fall, one at a time.
  if (wanted > 0) {
    if (nearestCop > 520) {
      police.coolTimer += dt;
      if (police.coolTimer > WANTED.decaySeconds) {
        police.wanted -= 1;
        police.coolTimer = 0;
        police.heat = police.wanted;
      }
    } else {
      police.coolTimer = 0;
    }
  }
  if (busted) onBusted();
  return { nearestCop };
}

/** Busted: lose some cash, wake up at the hospital, clean slate. */
export function bustPlayer(state) {
  const lost = Math.floor(state.cash * 0.15);
  state.cash -= lost;
  state.police.wanted = 0;
  state.police.heat = 0;
  state.police.cops.length = 0;
  for (const car of state.cars) if (car.driver === 'police') car.dead = true;
  state.player.inCar = false;
  state.player.carId = null;
  state.player.x = PLACES.hospital.x;
  state.player.y = PLACES.hospital.y;
  state.player.health = 100;
  state.player.speed = 0;
  return lost;
}
