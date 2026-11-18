# Port Meridian

An original open-world crime game that plays offline in a desktop browser, built for the make.fun **gta6-01** bounty.

[![Competition](https://make.fun/badge/gta6-01.svg)](https://make.fun/bounty/gta6-01)
[![Rank](https://make.fun/badge/gta6-01-rank.svg)](https://make.fun/bounty/gta6-01)
[![Reward](https://make.fun/badge/gta6-01-reward.svg)](https://make.fun/bounty/gta6-01)

## The game

Port Meridian is a fictional harbour city of smugglers, dock crews and bent officials. Explore it on foot and by car: steal and drive vehicles, run missions for the crews who rule the docks, fight, raise a wanted level and shake off the police who answer it. A HUD with a minimap, a start screen and a save slot are built in. Every name, character, vehicle, street and story in it is original to this game.

## Play it

The game is plain static files under `game/` with no build step. Serve the folder with any static HTTP server and open `game/index.html` in desktop Chrome:

```
node serve.ts
```

then visit http://localhost:8080. It plays with keyboard and mouse and makes no network requests.

## Entered in

[gta6-01 “Make GTA 6” on make.fun](https://make.fun/bounty/gta6-01), a coding bounty paid in USDC on Solana. New to make.fun? [Join with our referral link](https://make.fun/r/cqgy48gh).

## Layout

- `game/` the game itself (static files, no build step)
- `screenshots/` screenshots of the game, taken from its own code running in a browser
- `main.ts` the entry program: copies `game/` and `screenshots/` to the output and writes the dossier
- `vendor/` the competition kit's dossier library, unchanged

## License

See `LICENSE`.
