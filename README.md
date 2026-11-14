# Carley's World

A cosy browser game where you look after Carley, a tiny chibi girl living in a cottage with a garden.

## Run it

```
npm install --ignore-scripts   # (plain `npm install` also works on most machines)
npm run dev                    # then open the printed URL (usually http://localhost:5173)
npm test                       # automated tests (meters, commands, scenarios, save/load)
npm run build                  # type-check + production build into dist/
```

## How to play

Carley has six meters: **Rest, Fun, Social, Relax, Garden, Tummy**. They drain slowly and only
fill while she is doing something that feeds them. Her **Happy** meter is the weighted sum of all of them
(pain and irritation subtract from it). Keep her happy - and keep the *Happy streak* going.

Tell her what to do with the buttons at the bottom (keys 1-8). Click the active button again to stop.

| Button | Feeds | Notes |
| --- | --- | --- |
| Sleep | Rest | goes to bed; fills while she sleeps |
| Paint | Fun | the canvas fills in as she paints |
| Read | Fun (+Relax) | |
| Garden | Garden | needs daylight, no rain; waters the flowers |
| Sunbathe | Relax | needs real sunshine |
| Call Sister | Social | |
| Milk | Tummy | a glass of milk |
| Hug | Social + Relax | soothes aches too |

The **Auto** button (top right) lets Carley choose her own activities again. Space pauses, F3 opens the debug panel.
The weather, mosquitoes, butterflies and little accidents still happen on their own.

## Project layout

`src/config` tuning (meters, activities, world layout) - `src/systems` simulation (needs, mood, brain, commands, weather,
audio, save) - `src/activities` activity scripts - `src/render` Phaser drawing - `src/ui` HUD - `tests` Vitest suites.
