# HAWKINS: NITRO RUN — frontend

React (app shell + menus) + Phaser 3 (the race) + TypeScript + Vite.

    npm install
    npm run dev        # http://localhost:5173
    npm run build      # typecheck + production build

Flow: Intro -> Main Menu -> Character -> Car -> Track -> Mode -> Race -> Results -> Main Menu

Controls: W/Up accelerate, S/Down brake then reverse, A D/Left Right steer, R restart race, Esc back/quit.
Key bindings and all handling values live in src/game/config/GameConfig.ts.

## Layout
- src/data: characters, cars, tracks, game modes (typed models, placeholder content)
- src/store: GameStore (typed reducer + context: screen, selected character/car/track/mode, last result)
- src/pages, src/components: React screens and shared UI
- src/services/raceLauncher.ts: the only place React starts Phaser (lazy-loaded)
- src/game/bridge.ts: React <-> Phaser contract (RaceConfig in, RaceResult out)
- src/game/config, entities, systems, scenes: the race (CarPhysics, TrackLayout, LapManager, RaceManager, GameScene, HudScene)
