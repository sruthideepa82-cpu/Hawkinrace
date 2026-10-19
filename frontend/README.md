# HAWKINS: NITRO RUN — frontend

React (app shell + menus) + Phaser 3 (the race) + TypeScript + Vite.

    npm install
    npm run dev        # http://localhost:5173
    npm run build      # typecheck + production build

Flow: Intro -> Main Menu -> Character -> Car -> Track -> Mode -> Race -> Results -> Main Menu

The main menu also has **ACCOUNT** (`#/auth`) for signing up and signing in. Racing
works signed-out, but results are only saved to an account, so a signed-out run
is discarded on purpose.

Controls: W/Up accelerate, S/Down brake then reverse, A D/Left Right steer, C cycle camera (chase/hood/map), R restart race, Esc back/quit.
Key bindings and all handling values live in src/game/config/GameConfig.ts.

## Layout
- src/data: characters, cars, tracks, game modes (typed models, placeholder content)
- src/store: GameStore (typed reducer + context: screen, selected character/car/track/mode, last result)
- src/pages, src/components: React screens and shared UI
- src/services/auth.ts: sign-in/sign-out and token storage
- src/services/api.ts: the only fetch() call site; attaches the bearer token, clears it on 401
- src/services/raceLauncher.ts: the only place React starts Phaser (lazy-loaded)
- src/game/bridge.ts: React <-> Phaser contract (RaceConfig in, RaceResult out)
- src/game/config, entities, systems, scenes: the race (CarPhysics, TrackLayout, LapManager, RaceManager, GameScene, HudScene)

Nothing under `src/game/` imports from `src/services/`. Phaser cannot reach the
network: the race has no idea whether a player is signed in.
