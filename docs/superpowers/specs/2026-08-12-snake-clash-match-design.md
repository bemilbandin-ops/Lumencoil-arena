# Snake Clash-Style Solo Match Design

## Goal

Convert Lumencoil Arena from an endless multiplayer sandbox into a focused,
bot-only 90-second match that delivers the core Snake Clash loop: eat, level up,
bite weaker snakes, avoid stronger snakes, and defeat a final boss.

The first milestone succeeds when a new player can press Play, understand the
level hierarchy without instructions, grow within seconds, make repeated
prey-versus-threat decisions, reach the boss, and immediately replay.

## Scope

### Included

- One private match per connected player
- Existing mouse, keyboard, and touch steering
- Existing server-authoritative movement, snake bodies, food, bots, and canvas
  renderer
- Direct integer levels displayed above every snake
- Level-gated body cutting and head kills
- A 75-second growth phase followed by a 15-second boss phase
- Win, loss, and immediate Play Again flow
- Focused automated and visual verification

### Excluded

- Human multiplayer and multiplayer-facing UI
- Accounts, shops, currencies, upgrades, quests, and persistent progression
- Advertising, analytics, and monetization
- New skins, audio packs, or unrelated visual redesign
- Deleting the existing multiplayer transport before the solo loop is proven

## Player Experience

Pressing Play starts a private match immediately. The player spawns at level 1
with eight body segments. The arena already contains food and bot snakes at readable
levels. Ambient food grants one level; rare food grants three levels. Each level
adds one body segment, up to the existing segment cap.

Every snake has a large level badge above its head. A lower-level badge is shown
as prey, an equal-level badge as neutral, and a higher-level badge as danger.
This is the primary combat explanation; no tutorial modal is required.

For the first 75 seconds, the player grows by collecting food and attacking
weaker snakes. Biting a weaker snake's body cuts it at the contacted segment.
The detached tail becomes one-level pickups. Biting a weaker snake's head kills
it and turns its remaining body into pickups. Equal- or higher-level snakes
cannot be cut. Stronger snakes can apply the same rules to the player. Existing
bite cooldown prevents multiple cuts in the same instant.

At 15 seconds remaining, normal bot replacement stops and the boss enters. The
boss has a fixed level of 80 and a visually distinct body, badge, and status
bar. The boss follows normal level-contact rules: the player must reach at least
level 81 and bite its head to win. The player loses if their head is eaten or the
timer reaches zero before the boss dies.

The result screen shows WIN or DEFEAT, final level, defeated snakes, and one
prominent Play Again button. Play Again creates a fresh match without reloading
the page.

## Match State

Each private match has one of four states:

1. `READY`: arena creation and player spawn; not visible as a waiting screen.
2. `GROWTH`: 75 seconds of food collection and bot combat.
3. `BOSS`: 15 seconds with the boss active and normal bot replacement disabled.
4. `RESULT`: simulation frozen except for short result effects; accepts replay.

The server owns state transitions and remaining time. Client clocks are only for
smooth display. Starting or replaying a match creates a new world so no food,
snake, timer, or score state leaks between runs.

## Architecture

The existing server simulation remains the source of truth. Instead of placing
every human in the singleton shared world, the server associates each active
connection with a private match containing that player's snake and bots. The
current `GameWorld` movement, food, body, combat, bot AI, and snapshot code is
reused. Match orchestration wraps the world and controls timing, boss spawning,
results, and reset.

The client continues to send only steering, boost, and lifecycle intent. Server
snapshots add a compact match payload containing phase, milliseconds remaining,
player level, boss state, and result. The renderer continues drawing the world;
the React shell renders the timer, player level, boss status, result, and replay
button.

Human multiplayer code remains dormant and out of the player-facing path. It is
not removed during this milestone because removal does not improve the solo
match and would expand risk.

## Components

- `MatchSession`: owns one `GameWorld`, phase timing, boss lifecycle, and result.
- `GameWorld`: retains authoritative movement, food, body cutting, deaths, and
  bots; receives explicit solo-match initialization and boss creation hooks.
- Shared protocol types: expose match phase, remaining time, integer level, boss
  summary, and result.
- `GameClient`: starts and replays matches and consumes match snapshot fields.
- React shell: replaces endless-arena multiplayer HUD with level, timer, boss status,
  and result UI.
- Canvas renderer: adds level badge states and visually distinct boss treatment.

## Failure Handling

- Invalid or out-of-order input continues to be ignored server-side.
- A dropped connection ends its private match after the existing grace period.
- Reconnection during the grace period resumes the same match and authoritative
  timer; after expiry, Retry creates a new match.
- Duplicate replay requests are idempotent and create at most one new match.
- Missing boss or player state during a phase transition fails the match safely
  as a defeat instead of leaving the client stuck.

## Verification

Focused simulation tests must prove:

- A new match starts at level 1 in `GROWTH`.
- Ambient and rare food grant exactly one and three levels.
- Level gain adds body segments without exceeding the cap.
- Weaker-body contact cuts the tail and creates the expected pickups.
- Weaker-head contact awards a defeat and drops remaining body pickups.
- Equal- and higher-level targets cannot be cut by the attacker.
- The phase changes to `BOSS` at 15 seconds remaining and creates one level-80
  boss.
- A level-81 player can defeat the boss; level 80 cannot.
- Player head loss or timer expiry produces defeat.
- Boss head loss produces victory.
- Play Again creates a clean level-1 match with a reset timer and scores.

Integration verification must start a real server, create a solo match, steer the
player, observe authoritative phase fields, replay, and confirm that separate
clients cannot see each other's private worlds.

Visual verification must cover desktop and a 390-by-844 mobile viewport for the
growth HUD, prey/danger badges, boss phase, win result, defeat result, and Play
Again. The timer and level hierarchy must remain readable during dense combat.
