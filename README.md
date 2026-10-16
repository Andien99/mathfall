# Mathfall

A co-op classroom roguelike. Students form teams of four, each on their own device, and fight through a branching dungeon to a boss. Every Attack, Defend and skill only fires when the student answers a maths question correctly.

This is milestone 1: the full loop works end to end over real multiplayer (one server, many teams). The art is generated in code; see *What's real and what isn't* at the bottom.

## How a game runs

1. **Teacher** opens `/host`, picks questions (school bank, own sets, generated topics, or a mix), sets options and clicks **Create game**.
2. The lobby shows a big join code, the site address and a QR code. **Students** go to the site, type the code and their name, then **choose a hero**: Knight, Mage, Ranger or Cleric, with a **Boy / Girl** switch above the cards that changes the hero's look (not its stats). Teammates see each other's picks.
3. Students are grouped into teams of four as they join (team size is a setting). **Balance teams** spreads them evenly; drag a student to move them; drop on the dashed box to make a new team. Click **Start game**.
4. Each team gets its own **tower map**: a tall parchment scroll climbed from the bottom floor to the boss at the top. Six paths wind up through seven columns, merging and splitting, so most rooms offer two or three ways up. Everyone votes for the next room by tapping it; the room most of the team picks wins. Rooms: Monsters, Elite, Treasure, Campfire, Merchant, Unknown (ambush, shrine or cache) and the Boss. Floor 1 is always monsters, the middle floor is always treasure and the last floor before the boss is always a campfire. Elites and campfires never appear in the bottom third. Run length sets the height: Quick 6 floors, Standard 9, Long 13 (plus the boss). Enemies scale with how far up the tower you are, not the floor number, so all three lengths end equally hard.
5. **Battles** run in rounds, and everyone acts in the same round:
   - Pick **Attack**, **Defend**, **Skill 1** or **Skill 2**. A question opens. A correct answer fires the action at once.
   - **Energy** (0–10) powers Skill 1 and Skill 2. Attack and Defend each charge +3; each Focus answer charges +1. Skills cost 3–6 energy (stronger skills cost more). Heroes start each fight with 2, so the opening round is always a basic action.
   - A **wrong answer is a miss**: the hero swings and whiffs, and their turn is spent. The answer card drops to the bottom of the screen so the miss plays in view above it, with the correct answer and a *Show the working* button. After a correct answer the card closes at once and the hero's action plays only then, so students on phones see their own attack. Switching action before answering keeps the same question, so students can't skip hard ones.
   - **Free follow-up:** a correct answer for Attack or Defend makes the student's *next* Attack or Defend free (no question). The one after that needs a question again. Skills always need a question.
   - **Quick-time events:** elites and bosses sometimes unleash a big move (the Sentinel's Earthshatter, Gravemaw's Tail Storm and Shatterstorm). Everyone gets a quick arithmetic question (+, −, ×, ÷) with 10 seconds to answer; a right answer dodges the hit completely. Some raid moves chain three in a row.
   - When every hero has acted, or the round timer runs out, the enemies act. Each enemy shows what it will do next (for example "8 → Mia" or "Storm next!"), so the team can react: guard a target, freeze or kill a dangerous enemy, heal.
   - An unanswered question carries into the next round, so no work is lost.
   - Students who finish early can answer **Focus** questions: each correct one makes their next attack or skill 30% stronger (up to three).
   - A knocked-out hero answers a question to **get back up**. Everyone who fell revives at the end of a fight.
   - Tap an enemy to target it. Tap a teammate (or their card) to guard or heal them.
6. **After every won fight** each student picks an upgrade: **Attack** (+15% damage), **Defence** (+15% block, 6% less damage taken) or **Health** (+6 max HP). Upgrades last for the run, and a team that beats the tower keeps its heroes (upgrades, skills, gold) for the next, harder climb.
7. **"?" rooms** are one of ten events, each with an illustration and two or three choices, several of them risk-or-safe: Wyvern's Nest, Strangling Vines, Shrine of Numbers, The Grinning Dealer, Forgotten Library, The Suspicious Chest, The Fallen Adventurer, Moonlit Fountain, Abandoned Forge and Ambush! (a team decision: fight together, or everyone sneaks past by answering correctly). Choices marked ✎ ask a question; the outcome depends on the answer.
8. **Campfire**: the party sits around the fire; each student picks Rest (heal 35%), Train (upgrade a skill) or Meditate (start the next fight with full energy and Focus). Bubbles show what everyone chose.
9. **The raid.** When the game timer ("Time until the raid") runs out, or when the teacher presses *Start raid now*, every team is pulled into one fight against **Voidmaw, Heart of the Tower**. Heroes below 80% health are healed to 80%. Each team sees its own party in front, with every other team's heroes fighting in the background; all damage goes into one shared health bar (about 130 HP per student, and it hits 20% harder than a normal boss). Voidmaw uses quick-time attacks, sometimes three in a row. A team that falls regroups at half health. The class wins if Voidmaw falls before the raid timer (default 8 minutes) ends; results then show damage by team and by student.
10. **Treasure** gives each student a chest with a skill of a random rarity (Common, Rare, Epic, Legendary). They can swap it into either skill slot, or keep their two skills for 10 gold. The **Merchant** sells skills for gold. The **Campfire** heals 35% or upgrades a skill (+35% power).
11. **Acts.** Each map ends in a boss. Beating it completes the act: the team keeps its heroes and climbs a new map (Act 2, Act 3, …) with a different boss at the top and tougher enemies. The bosses rotate: Gravemaw the Crystal Wyrm, then **The Iron Colossus** (overheats at half health and hits harder; telegraphs a quick-time *Meltdown*), then **The Hollow King** (raises Bone Thralls, drains life with *Soul Drain*, and calls a three-strike quick-time *Death Knell*); after that the cycle repeats, stronger each time.
12. The **first boss**, Gravemaw the Crystal Wyrm, changes at half health: it summons two Crystal Shards and charges *Shatterstorm*, which hits the whole party harder for every shard still standing. Break the crystals first.
8. Beating the boss starts a harder run (Ascension 1, 2 …). A team that falls starts a new run. Teams keep going until the teacher ends the game or the time limit runs out.
9. **Results**: the teacher gets team standings, every student's accuracy, best streak, average time and weakest skill, class accuracy by skill (weakest first) and the hardest questions, plus **Download results (CSV)**. Each student sees a podium and their own report with the questions they got wrong and the worked answers.

While playing, the teacher's **live view** opens with **the tower**: a drawn stone tower with battlements, the boss chamber at the top (showing the bosses teams are facing), lit windows on floors where a team is, and every floor from 1 to the boss, with each team's banner on the floor it has reached, its heroes, and what it is doing right now. Click any team to show its battle on the projector. During the raid it becomes the raid board: Voidmaw's health and damage by team. Below that, the live view shows every team's floor, current room, enemies, hero health and accuracy. **Watch** opens a team's battle on the projector. **Pause all** freezes every team ("Eyes on your teacher"). **Hurry along** ends the current round or room for a team that's stuck.

## Game options

| Option | Choices |
|---|---|
| Run length | Quick (~10 min), Standard (~20 min), Long (~30 min) |
| Round timer | Off, 30, 45, 60 or 90 seconds |
| Team size | 2 to 5 |
| Adaptive support | On/off: after two wrong in a row, a student gets supported questions until they get two right |
| Hints | On/off: a hint button on every question |
| Pause after a wrong answer | none to 5 seconds |
| Game length | No limit, or 15 to 60 minutes |
| Sound on student devices | On/off (students can also mute) |
| Late joining | Allowed or locked once started |

## Questions

### The school bank

Every `.json` file in the `banks/` folder appears under **School bank** for every teacher. This is the "agreed upon" bank: add or change a file, redeploy, and everyone sees it. `banks/year-7-algebra-core-skills.json` is included: 48 questions plus 30 supported questions on like terms, collecting like terms, coefficients and constants, substitution and equivalent expressions, each with a worked solution.

### My sets

Teachers' own sets are saved in their browser. **New set** opens the editor:

- Write maths between dollar signs: `$3x + 5x$`, `$\frac{1}{2}$`, `$x^{2}$`. The preview shows exactly what students see.
- *Pick from options* (correct answer plus up to three wrong ones; options are shuffled per student) or *Type the answer* (with a **Test it** box to check what will be marked right).
- Optional skill (for the results page), hint and worked solution.
- Every set has a **main list** and a **supported list**. Drag questions between them, or use ⇄ to copy.
- **Paste a list**: one question per line, parts separated by `|` or a tab: `question | correct | wrong… | skill`. With only a correct answer it becomes a typed question.
- **Import a file**: Mathfall or **Flurry Fight** `.json` exports, `.csv` or a text list.
- **Export** saves a `.json` copy. To add a set to the school bank, put that file in `banks/`.
- **Copy and edit** on a school bank set makes your own editable copy.

### Generated topics

Integers, Solving equations, Index laws, Percentages, Fractions, and Like terms and substitution. Each has Foundation, Core and Extension levels, fresh numbers every time, wrong options built from common mistakes, and a worked solution for every question. Students on supported questions get the level below. Mix them with sets to stretch a small bank.

### Supported questions

A student uses the supported list when the teacher clicks the small dot beside their name (lobby or live view), or automatically for a few questions after two wrong in a row (if adaptive support is on). The dot has no label, so a projected screen doesn't reveal who is supported, and students never see it. Dots are remembered by name in the teacher's browser.

### How typed answers are marked

Accepted: spacing and capitals, term order (`6 + 8k` = `8k + 6`), letter order (`ba` = `ab`), equal numbers (`1/2` = `0.5`, `1 1/2` = `1.5`), a leading `x =`, a `$` sign, a unit (`26 cm`), and `−` or `×` typed with the keypad.

Marked wrong on purpose: unsimplified answers (`3k + 5k` for `8k`), brackets left in when the answer is expanded (or missing when it's factorised), `×` or `÷` when the answer has none, and an unevaluated sum (`40/8 + 8`) when the answer is one number.

### File format

```json
{
  "title": "Year 7 Algebra: core skills",
  "questions": [
    { "type": "mc", "skill": "Collecting like terms", "q": "Simplify $3x + 5x$.",
      "options": ["$8x$", "$15x$", "$8x^{2}$"], "correct": 0,
      "hint": "Add the numbers in front.", "solution": "$3 + 5 = 8$, so $8x$." },
    { "type": "text", "skill": "Substitution", "q": "If $m = 5$, evaluate $4m + 3$.", "answers": ["23"] }
  ],
  "modified": [ ...supported questions in the same shape... ]
}
```

`hint` and `solution` are optional. Flurry Fight exports use the same shape.

## Run it on your own computer

You need [Node.js](https://nodejs.org) 18 or newer.

```
npm install
npm start
```

Open http://localhost:3000/host. Students on the same network join at `http://YOUR-COMPUTER-IP:3000`. School networks often block this, which is why hosting it online is usually easier.

To test multiplayer on one computer, open the student page in several **separate windows or browser profiles** (each tab keeps its own player, so ordinary tabs work too).

## Put it online (free, on Render)

1. Create a GitHub repository and upload this folder (everything except `node_modules`).
2. Sign in to [render.com](https://render.com) with GitHub, click **New → Blueprint**, choose the repository and click **Apply**. `render.yaml` sets up a free Node web service in Singapore (lowest lag from Australia).
3. Render gives you an address like `https://mathfall.onrender.com`. Students go there; you go to `/host`.

**Free-plan catch:** free services sleep after a while without visitors and take up to a minute to wake. Open the host page a few minutes before class. One free instance comfortably handles a class of 24–30; everything is turn-based and the server sends small updates.

## Good to know

- Games live in the server's memory. Restarting or redeploying ends any game in progress.
- Up to 48 players per game, in up to 10 named teams.
- A student who refreshes or drops out rejoins automatically as the same hero, with their open question restored. Rejoining with the same name also reclaims a disconnected hero. The teacher's page also resumes after a refresh.
- A disconnected student never holds up their team: rounds and votes only wait for connected players.
- The server marks every answer and resolves every action. Correct answers are never sent to the browser, each question can only be answered once, and duplicate or stale submissions are ignored.
- Sound is generated in the browser (no audio files). iPads need one tap before sound can play.
- The battle scene drops to a lighter mode by itself if a device struggles. Try it on a typical school Chromebook before a lesson.

## Replacing the art

The built-in sprites are generated by a pixel rig in `public/js/sprites.js` (heroes, enemies, boss, chests, icons) and the dungeon by `public/js/dungeon.js`. To use hand-made art, put sprite sheets in `public/art/` with a `manifest.json`:

```json
{
  "heroes": {
    "knight": { "sheet": "knight.png", "frame": [84, 76],
      "poses": { "idle0": [0, 0], "idle1": [1, 0], "idle2": [2, 0], "idle3": [3, 0],
                 "windup": [0, 1], "swing1": [1, 1], "swing2": [2, 1], "cast0": [3, 1], "cast1": [4, 1],
                 "defend": [0, 2], "hurt": [1, 2], "down": [2, 2], "victory": [3, 2] } }
  },
  "enemies": {
    "slime": { "sheet": "slime.png", "frame": [64, 52],
      "poses": { "idle0": [0, 0], "idle1": [1, 0], "idle2": [2, 0], "idle3": [3, 0], "windup": [4, 0], "attack": [5, 0], "hurt": [6, 0] } }
  }
}
```

Hero frames are 84×76 with the feet at (46, 72), facing left. Enemy frame sizes are in `ENEMY_DEF` in `sprites.js`, facing right. Anything not listed keeps the generated art. Add `"portrait": [x, y, w, h]` to a hero to crop its HUD portrait from the idle frame. Add `"variants": 3, "variantRows": 1` to put colour variants on extra rows.

**All heroes are Andy's own sprites, in a boy and a girl version.** Hero art is keyed `class:gender` in the manifest (`knight:m`, `mage:f`, …); the server gives each hero a `skin` and every portrait and sprite uses it. The girl knight (`tools/art-src/knight_f_base.png`) is built by `build_ranger.py` like the clerics and rangers. Every hero's idle loop was animated by PixelLab (`animate_image`, 4 frames played 0-1-2-1 so it loops smoothly); the mages' flames flicker in it. The source strips are `tools/art-src/<sheet>_idle.png`. PixelLab made the knight, boy cleric and girl ranger blink, so `python3 tools/fix_blink.py knight cleric_m ranger_f` pastes the open-eyed face from the first frame onto the others (following the head if it moved); re-run it on any new idle strip that blinks. `python3 tools/build_knight.py`, `tools/build_mage.py` (both mages: the staff is moved to the free hand and re-angled per pose; the flame grows for spells and goes out when knocked down) and `tools/build_ranger.py` (both rangers and both clerics: whole-sprite lean, recoil, crouch and kneel) build the other poses and three colour variants. Heroes are matched to the knight's height (about 55px, feet to head): `build_ranger.py` shrinks the girl cleric to 85%, the boy cleric to 93% and the girl ranger to 95% with a nearest-neighbour pass about the feet, so pixels stay crisp and every pose shrinks the same way. The mages are about 2px shorter and are left as drawn, since enlarging pixel art doubles pixels. All have a 14th pose, `sit`, used at the campfire. **Knight special slash.** Both knights attack with a hand-animated move made in PixelLab: a shoulder-charge dash with the sword trailing behind, a plant, the sword swung overhead, then a downward slash (12–14 frames, about 1.1 s). The charge pose was made with PixelLab `edit_image` from the idle frame, the in-betweens with `animate_image` pinned between keyframes. Source strips are `tools/art-src/atk/<sheet>_slash_src.png` (128×112 frames, feet at 80,104); `python3 tools/build_attack.py` recolours them for the three cape colours, writes `public/art/<sheet>_slash.png` and adds `anims.slash` to the manifest (frame times, the hit frame, the trail frame, how far she dashes). In battle (`_bigSlash` in `scene.js`) the camera eases in about 14% on the knight, the screen edges darken, a pale crescent after-image follows the sword's path, and the screen shakes on the hit. **Cleric smite.** Both clerics cast their attack from where they stand: they raise the staff overhead while chanting (the mouth moves), then slam it down, and yellow lightning strikes the enemy from the top of the screen (`skyStrike` in `scene.js`: a forked bolt, a flash, a glow and sparks). Same pipeline: `tools/art-src/atk/<sheet>_smite_src.png` → `build_attack.py` → `anims.smite` with `cast: true` (no dash, gentler 10% zoom) and a `strike` frame. Any hero can get a move the same way: add an entry to `MOVES` in `build_attack.py` keyed by the attack's effect name.

**Ranger shot.** Both rangers' basic attack and Poison Arrow use a PixelLab draw → aim → release → recoil animation, fired from where they stand. They hold full draw for about 0.7 s while a twinkling star of light gathers at the arrow tip (`charge` frame → `release` frame), then on the `release` frame the game launches the arrow from the bow (`muzzle`, px from the feet) and the hit lands when it arrives; a light 6% zoom plays. Source `tools/art-src/atk/<sheet>_shoot_src.png`; the boy's release and recoil were a second PixelLab pass started from his full-draw frame.

**Mage cast.** Both mages' basic attack (Arcane Bolt), Fireball and Ice Shard use a PixelLab animation: the mage points the staff at the enemy and holds it while the spell forms at the tip, then it launches (`anims.cast`, same pipeline; PixelLab painted its own ice blasts on some frames, so only the clean pointing frames are used). The spell is drawn per element (`drawCharge` / `elementHit` in `scene.js`): **arcane** – a violet orb with two orbiting motes and sparks spiralling in, a violet bolt, a ring and starburst on hit; **fire** – a flickering fireball with flame licks and rising embers, a bigger fireball in flight, an explosion of embers and a shockwave on hit; **ice** – a spinning crystal with shards drawn in, a long frost shard with a sparkle trail, a frost ring and tumbling ice chunks on hit.

**Defends and big moves.** Every class has a PixelLab defend and one "big move" that all its party or area skills play first (`_preAnimName` in `scene.js`), then the skill's usual effect runs from the move's hit frame:

| Class | Defend | Big move (used by) |
|---|---|---|
| Knight | Guard – sword raised to block | Rally – sword thrust up with a war cry (Shield Wall, Battle Cry, Aegis, any heal/buff or area spell) |
| Mage | Ward – staff held out | Channel – staff raised overhead (Lightning, Frost Nova, Meteor, Starfall, Venom Storm, any heal/buff) |
| Ranger | Evade – crouch and backflip | Volley – bow aimed at the sky (Volley, Starfall, Venom Storm, any area spell) |
| Cleric | Holy guard – warding gesture | Pray – staff lifted, head bowed (Healing Light, Blessing, Sanctuary, Phoenix Feather, any area spell) |

PixelLab paints its own magic into many frames; `tools/assemble_moves.py` keeps only the character (the largest connected shape plus anything touching the idle sprite's box), so detached swirls and orbs are dropped, and strips the fire it drew above the mage's staff. The frame order and holds per move are in its `PLAN`; timings and hit frames in `SIMPLE` in `build_attack.py`. Move sheets load in the background after the page opens; the join form can no longer submit (and reload the page) before the game has loaded.

**Animation Lab and preview pack.** `/dev/lab.html` (live at https://mathfall.onrender.com/dev/lab.html) replays any hero's attack, defend, class skill or treasure skill against any enemy, with every effect, at 1×, ½× or ¼× speed, boy or girl, any colour; it never touches a real game. It also takes settings from the address bar (`?cls=mage&gender=f&move=fireball&enemy=slime&speed=0.5&loop=0&bare=1`). `python3 tools/make_previews.py <folder>` (with the game running locally) builds an offline pack: sprite-only GIFs of every hero animation, MP4 battle clips of every move with effects (recorded from the lab), enemy GIFs, event art, the raw sprite sheets and an `index.html` gallery.

**Hit sparks.** Every damaging hit throws long streak sparks that fly well out and arc down (`hitSparks`); the knight's blows also throw tumbling steel-blue cubes.

**Enemies shudder when hit.** Every time an enemy takes damage it shakes side to side seven times over about 0.56 s, 4–9 px each way (`hitShake`), harder for bigger hits; poison and burn ticks give a small shake, and other teams' raid hits a faint one. All ten event illustrations in `public/art/events/` were generated with PixelLab (192×192, shown with a soft vignette). The raid boss Voidmaw is Andy's red dragon, made in PixelLab: `python3 tools/build_dragon.py` turns `tools/art-src/dragon_base.png` (256×256, mirrored to face the heroes) into `public/art/voidmaw.png`, scaled to 148px and snapped back to its own palette, with lean, lunge, roar and hurt poses and fire breath added at the jaws.

**The knight is hand-made.** `public/art/knight.png` is built from Andy's knight (`tools/art-src/knight_base.png`, 64×55, facing left) by `python3 tools/build_knight.py` (needs Pillow). The script cuts out the sword and re-angles it around the grip (RotSprite-style, so the blade stays crisp), leans and shifts the body for each pose, makes the kneeling knocked-out pose, and recolours the cape for the second and third knight in a team (blue, crimson, emerald). To change the knight, replace the base image and re-run the script. `/dev/sprites.html` shows every frame; `/dev/scene.html` previews the battle scene.

## Tests

```
npm test
```

Runs 65 answer-marking cases, then starts a test server and has bot students play full runs over real sockets (8 bots, two teams), including a disconnect and reconnect and a duplicate-answer check. `node test/bots.test.js 24` runs a full class of 24 in six teams.

`MATHFALL_TEST=1` is for these tests only: it sends correct answers to the browser and enables room shortcuts. Never set it on a real server.

## What's real and what isn't

**Built and tested:** real multiplayer for many teams on one server; simultaneous rounds with a round timer; server-side marking; worked solutions; adaptive supported questions; hints; Focus; getting back up; 4 heroes with 3 colour variants each; 21 skills across 4 rarities powered by energy (charged by Attack, Defend and Focus) with upgrades; 5 enemy types with telegraphed intents (including a healer and an elite with a two-turn wind-up); a two-phase boss; a Slay-the-Spire-style tower map (6, 9 or 13 floors, 7 columns, 6 merging paths) climbed bottom to top with team voting; Andy's hand-made knight sprite with 13 animation frames in 3 colours; treasure skill swaps, campfire, merchant, shrine; ascension runs; teacher editor, import/export, school bank, generators, lobby, live view, spectating, pause, results and CSV; reconnects.

**Prototype quality:**
- **Art.** The sprites and dungeon are generated from code, not hand-drawn. They're consistent and animated (idle, attack, cast, defend, hurt, knocked out, victory), with smooth lighting, fog and particles over the pixel art, but they won't match a commercial game's hand-painted sprites. The manifest above is the route to commissioned or bought sprite sheets.
- **Balance.** Bots won comfortably; real students will be slower and less accurate. Expect to tune enemy health and damage (`shared/content.js`, `server/combat.js`) after the first lessons.
- **Phones.** Laptops, Chromebooks and iPads (both orientations) are the target. Phones work in landscape but are cramped.

**Not built yet:** pictures or diagrams in questions; a live-editable shared bank (needs a database; for now the school bank is the `banks/` folder); saved results history (download the CSV); music.

## Files

```
server.js            web server, school bank loading, QR codes
server/session.js    games, players, teams, runs, all socket handlers
server/combat.js     rounds, hero actions, enemy intents, statuses, the boss
server/run.js        maps, rooms, loot
server/questions.js  question sets, adaptive selection, marking, hints
shared/content.js    heroes, skills, enemies (shared by server and browser)
shared/answers.js    typed-answer marking (shared by server and the editor's Test it box)
shared/generators.js skill-based question generators
banks/               the school question bank (.json files)
public/index.html    student page          public/js/play.js       student client
public/host.html     teacher page          public/js/host.js       teacher client
public/js/scene.js   battle renderer, animations, lighting
public/js/sprites.js pixel rig, characters, chests, icons
public/js/pixel.js   pixel drawing toolkit (shading, outlines)
public/js/dungeon.js generated dungeon backdrops
public/js/mapview.js tower map (vertical parchment scroll) and voting
public/js/question.js question panel and on-screen maths keypad
public/js/audio.js   generated sound effects
public/css/          styles        public/fonts, public/vendor   fonts and KaTeX (self-hosted)
test/                answer-marking tests and the multiplayer bot test
render.yaml          one-click Render deployment
```
