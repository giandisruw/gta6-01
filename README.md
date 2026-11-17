# Solmar Bay — Streets of Gold

[![make.fun](https://make.fun/badge/gta6-01.svg)](https://make.fun/bounty/gta6-01)
[![rank](https://make.fun/badge/gta6-01/giandisruw/gta6-01/rank.svg)](https://make.fun/bounty/gta6-01)
[![reward](https://make.fun/badge/gta6-01/giandisruw/gta6-01/reward.svg)](https://make.fun/bounty/gta6-01)

An original open-world crime game built for the make.fun **gta6-01** bounty ("Make GTA 6").
100% original: its city, characters, vehicles, names, story, art and music are invented —
nothing from Rockstar Games' Grand Theft Auto series or any other commercial game.

## The game

Mara Solis comes home to **Solmar Bay**, a sun-soaked coastal city, after five years away.
Her old friend Rico, who runs a garage, has work for her — six story missions that take her
from stealing her first car to cracking the vault of Bay Trust Bank.

- **Open city** — a 3600×2600 grid of avenues, blocks, parks, a beach and a marina, explorable on foot and by car
- **Traffic and pedestrians** — cars follow the road grid, park at kerbs, and stop for the car ahead; pedestrians stroll the sidewalks and flee from crime
- **Cars to steal and drive** — walk up to any car and press **E**; sedans, taxis, vans, trucks, muscle cars and sports cars, each with its own speed and handling, plus handbrake skids
- **Wanted level** — five stars; stealing cars, hitting pedestrians and shooting bring the police, on foot and in pursuit cars with sirens. Slip away and the heat cools down; get caught and you're **BUSTED**
- **Missions and story** — six missions with briefings, objectives, timers, a getaway chase and a gang fight, paying up to $2,500
- **Combat** — aim with the mouse, click to shoot; ammo crates around the city, or punch when you're dry
- **HUD with minimap** — cash, health, ammo, wanted stars, mission objective with distance, speedometer, car health, a live minimap and a clock
- **After the story** — taxi jobs, hidden cash stashes, free roam
- **Start screen and save** — title screen with the live city behind it, pause menu, autosave on every mission plus **Q** to save, **C** to continue
- **Sound** — everything synthesized with WebAudio: engine hum, sirens, gunshots, pickups, mission jingles and a music loop. **M** mutes.

## Controls

| Key | Action |
| --- | --- |
| WASD / arrows | Move / drive |
| Mouse | Aim (on foot) |
| Click | Shoot |
| E | Enter / exit car, interact (pick up, crack the vault) |
| Shift | Sprint |
| Space | Handbrake (while driving) |
| P / Esc | Pause |
| Q | Save game |
| C | Continue saved game (title screen) |
| M | Mute |

## Play it

Serve `game/` with any static server and open `game/index.html` in desktop Chrome — no build
step, no network requests, no accounts. For local play: `node serve.ts`, then open
http://localhost:8080.

## Tech

Dependency-free: plain HTML + canvas 2D + ES modules, split into one file per job
(`city.js`, `vehicles.js`, `peds.js`, `police.js`, `combat.js`, `missions.js`, `audio.js`,
`world.js`, `render.js`, `input.js`, `shots.js`). The screenshots in `screenshots/` are real
renders of the game's own code, staged by `?shot=start|drive|chase|mission`.

Built for make.fun — referral code `0txwmf1m`.
