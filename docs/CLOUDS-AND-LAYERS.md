# Drawing layers and the cloud problem (open, for thinking; nothing decided)

Written 2026-10-18 after Hazy noticed that "clouds just disappear behind mountains". This note describes the current
layer order, why clouds sit behind the mountains, what goes wrong, and the options. It is a brief for whoever picks this
up next: think it through and propose; do not change the art without Hazy's go (see "What a change costs").

## The current layer order (back to front)

`gen_draw()` in `gen/gen_core.c` paints like a painter: farthest first, each layer drawn over the ones before it.

1. Sky: gradient, stars, milky way, aurora (`draw_sky`, gen/gen_sky.c, steps 1-3)
2. Light: sun, moon with its phase, planet, eclipse (`draw_light`, step 5)
3. Clouds, plus the rain/storm/snow cloud deck (`draw_clouds`, step 7)
4. Ridges, far to near, up to 9 layers; the volcano and its plume belong to their ridge (`draw_layer`, gen/gen_ridges.c, step 8)
5. Near ground surface: meadow, desert, snowfield, shore (`draw_surface`, gen/gen_ground.c, step 9)
6. Features on the ground or water line: lighthouse, palms, cabin... drawn before the water so they reflect (`draw_features`, step 10)
7. Water: mirror of everything above, ripples, glitter path (`draw_water`, step 11; lake, sea, oasis only)
8. Weather: fog, rain, snowfall (`draw_weather`, step 12)
9. Finish: dither to the Game Boy's 4 shades (`draw_finish`, step 13; palette is applied afterwards as a trait)

A 1/1 runs the same stack with its scene hooks (`sp_*` in gen/gen_special.c) and adds its extras after the weather.

The order itself is sound and already handles the classic painter problems: far ridges are hazed toward the sky (aerial
perspective) and each ridge gets valley mist, so ranges separate; clouds may cross the sun or moon but never bury it;
ridges are squashed so they never cover the sun or moon; nearer ridges dip around a volcano crater so its plume starts
from a visible peak; features come before the water so they reflect; weather comes after the water so rain is not
mirrored.

## Why clouds are behind the mountains

Clouds were treated as part of the sky, the farthest layer, so they are painted before the ridges and every ridge is
painted over them. For high clouds that is correct: in a real landscape most clouds are far behind the mountains.

## What goes wrong

Cloud placement does not know where the mountains are (they do not exist yet when clouds are drawn). In
`draw_clouds` (gen/gen_sky.c, step 7) each cloud's centre height is `cy = rnd(6, skyBottom * 55 / 100)`, so a cloud
can sit anywhere in the upper ~55% of the sky, which overlaps the height of the taller ridges. Such a cloud is then cut
by the ridge line drawn over it and reads as a cloud chopped off or "disappearing" behind the mountain. Real low cloud
sits in front of distant peaks or hangs between ranges; it is not sliced flat by the skyline.

## Options

1. **Keep clouds above the peaks.** Only place (or keep) clouds where they stay fully visible. Smallest change, but
   clouds would crowd the upper sky and the picture loses depth. Note: ridges are generated after clouds, so this needs
   either a ridge ceiling known before clouds, or moving clouds after `ridge_setup` while keeping the random stream order
   (or accepting a new stream).
2. **Two cloud layers (Rem's recommendation).** High clouds stay where they are (behind everything). A few low cloud
   bands or wisps are drawn between ridge layers (e.g. after the far ridges, before the middle/near ones), so they sit
   in front of distant peaks and behind nearer ones. Matches how depth looks in real mountains and works with the
   existing haze/valley mist. Tone them like the ridge haze at that depth so they read as atmosphere, not stickers.
3. Variants to consider: limit the existing cloud height range so the behind-layer clouds stay above typical ridge
   tops, and move the lower part of the range into the between-ridges layer; or let the valley mist carry the low-cloud
   role more strongly instead of adding cloud shapes.

Things to keep working: clouds never bury the sun or moon (`inlight` check); the 1/1 scenes decide whether they have
clouds (`sp_clouds`); the banner pass (WIDE) continues clouds past the edges without cutting at the seams; the volcano
cone colour depends on whether sky or cloud is behind its crater (`vol_lit`); and the Game Boy cost (time per piece,
ROM bank space; ridges are drawn per layer already, so a between-ridges cloud pass fits the existing phases).

Suggested first step before choosing: measure how often it happens (render e.g. seeds 1-300 with gen_host and count
clouds whose area is partly covered by a ridge), and make a before/after contact sheet of the same seeds for Hazy.

## Two smaller observations (same review, lower priority)

- Weather has no depth: rain and snow are drawn at the same size and density over the far ridges as over the
  foreground (fog follows the horizon band and is fine).
- Ridges ignore the sun's side: their shading does not change with where the sun is (`lx` is only used for the
  clearance below the sun/moon in gen_ridges.c), so a low sun does not light one side of a mountain. A lit rim on the
  sun's side would be the most visible upgrade here.

## What a change costs (any change to the drawing)

Every seed's art changes, so before the mint opens a change means: new ROM and a new ROM sha256 (server reads it from
gb/seedlab.gb); rebuild web/gen.wasm; regenerate the golden test (300 seeds) and keep parity (WASM = native = ROM in
PyBoy, phase screens equal); re-check the ten 1/1s (scenes with clouds change) and their descriptions; Hazy copies the
new ROM to the EverDrive and power-cycles; then a real Game Boy test drawing must end with "tiles match the
reference" before /admin/open. Once pieces are minted the art of minted seeds can never change, so this decision
belongs before the mint.

## Decision and what was built (2026-10-18, Hazy: "I'd rather clouds don't disappear behind other traits, well not fully"; "Go")

- Clouds keep their placement and the random stream is unchanged (ridges and everything else draw exactly as before).
  `draw_clouds` remembers every cloud's puffs; after the last ridge, `cloud_front()` (gen/gen_sky.c) measures each cloud
  against the skyline (`skyl`, the topmost ridge pixel per column).
- A cloud covered for more than half goes on in front of the ridges where it is covered: as see-through mist over a real
  ridge (its own tone at about 60%, half that at the rim), drawn whole over far haze that looks like sky (within 28 tones
  of the sky). Partly covered clouds stay behind the ridge, as before. A cloud that would barely show in front (under half
  of its covered pixels at least 24 tones off what is there) is left alone, so no dotted slivers in pale haze.
- A piece's cloud is judged inside the piece only, so the banner's centre stays the piece. The ten 1/1s are untouched.
- Checked: 119 of 300 golden pieces change, traits identical, before/after sheets with Hazy.
