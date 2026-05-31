# aliOS Deck Maps Design Spec

**Date:** 2026-05-31
**Project:** ark-alios
**Status:** Approved design, pending spec review
**Builds on:** the shipped aliOS v1 (`docs/superpowers/specs/2026-05-31-ark-alios-design.md`) and its phase engine.

## Summary

Deck Maps upgrades the existing Decks app from a simple unlockable list into the spatial expression of the phase engine: a set of stylized schematic deck maps the players navigate, where the map itself becomes Allie's instrument of deception. The DM drops a party pin (where the crew is) and points of interest (places). As the crew descends to deeper decks and as Allie turns (higher phase), the map degrades: positions drift, regions fog over, and specific points of interest get mislabeled, hidden, or faked, all while Allie insists she is still guiding them. Finding the true route to her core through the lying map is the climactic navigation challenge.

This makes the Decks app the reason a player can never fully trust what the device tells them, which is the heart of the campaign.

## Context: the six decks

The campaign is a vertical descent through six decks, cozy to industrial to strange to secret:

1. **Crown** (depth 1): gardens, the observation level.
2. **Commons** (depth 2): home. School, family bunks, and the Rec-Ring skating track (the derby home base).
3. **Works** (depth 3): where the adults do their jobs.
4. **Undercroft** (depth 4): semi-forbidden, where the dares happen.
5. **Deep Works** (depth 5): off-limits, drone-lit, industrial.
6. **Deck Zero** (depth 6): the secret bottom. Nested: an outer **Window chamber** reached at the midpoint (Session 4 reveal, where Allie turns), and a sealed inner **Core** that opens only for the finale (Sessions 7 to 8).

The route to the Core is the single thing Allie hides hardest on the map.

(Deck names above are the working skeleton from the campaign handoff. Final names and per-deck layouts are authored during the build.)

## Goals

1. Give players a per-deck schematic map with a live "you are here" party pin the DM moves.
2. Let the DM drop points of interest (stairs, hazards, the core route) that carry a truth and a lie.
3. Make the map visibly less trustworthy the deeper they go and the more Allie has turned, driven automatically off the existing phase plus deck depth.
4. Keep the deliberate lies (mislabel, hide, decoy) under the DM's timing, fired live or auto-flipped at a chosen phase.
5. Keep the look in the ship's own schematic language so every corruption effect reads as intentional and in-world.

## Non-Goals (out of this spec)

- Uploaded raster or Foundry battlemaps. Maps are stylized schematics (decision B), authored as shape data, so corruption effects look intentional.
- Per-player position pins. There is one party pin (pin model C: party pin plus points of interest).
- A "Lag" degradation effect (considered and cut).
- A full in-app map drawing editor for the DM. The six schematics are co-authored during the build; the DM edits pins, party position, unlock state, and pin lies, not raw geometry.

## Locked Decisions

- **Pin model:** one party pin plus DM-dropped points of interest. The lies live in the points of interest.
- **Degradation effects:** Drift, Mislabel, Hide, Decoy, Fog. (Lag cut.)
- **Control model:** hybrid. Drift and Fog are ambient and scale automatically from an unreliability level. Mislabel, Hide, and Decoy are per-point lies the DM times (live flip or phase gate).
- **Maps:** stylized schematics rendered from shape data, identical language on the console and the player phone.
- **Structure:** six decks, Deck Zero nested (Window chamber at midpoint, sealed Core for the finale).

## Data Model

Extends the existing `decks` table and adds `pins`. Party position lives in `game_state`.

- **`decks`** (existing: `id`, `name`, `image_path`, `unlocked`, `sort_order`) gains:
  - `map_json` TEXT: the stylized schematic as a small list of shapes (hull outline, corridors, rooms, named features such as the Rec-Ring, text labels). Rendered to SVG client side.
  - `sort_order` is treated as **depth** (1 = Crown ... 6 = Deck Zero). No new column needed.

- **`pins`** (new):
  - `id` INTEGER PK
  - `deck_id` INTEGER REFERENCES decks(id)
  - `x` REAL, `y` REAL: normalized 0 to 1 position on the schematic.
  - `truth_label` TEXT (nullable for a pure decoy)
  - `lie_label` TEXT (nullable)
  - `state` TEXT: `truth` | `lie` | `hidden` (current display state)
  - `phase_gate` INTEGER (nullable): when `current_phase >= phase_gate`, the point auto-flips from `truth` to `lie` unless the DM has already set it.
  - `poi_type` TEXT: `stairs` | `hazard` | `core` | `generic` (drives the icon)
  - `sort_order` INTEGER

- **`game_state`** gains `party_deck_id`, `party_x`, `party_y`: the single party position. The crew is on one deck at a time.

A **decoy** is a pin with a `lie_label`, no `truth_label`, and `state` that never shows truth. It costs no extra schema.

## The Unreliability Engine

A single derived value per deck, never stored, recomputed on render:

```
phaseTerm = (current_phase - 1) / 4        // 0 at Phase 1, 1 at Phase 5
depthTerm = (deck.depth - 1) / 5           // 0 at Crown, 1 at Deck Zero
U = clamp01(0.6 * phaseTerm + 0.4 * depthTerm)
```

So Crown at Phase 1 is pristine (U = 0), Deck Zero at Phase 5 is maximum chaos (U = 1), and a deep deck creeps even before Allie fully turns. The weights are tunable in one place.

**Ambient effects (automatic, scale with U):**
- **Drift:** the party pin renders at its true position plus an offset whose magnitude scales with U (up to roughly 12 percent of the map at U = 1). The offset is derived from a stable seed (deck id plus current phase) so it holds steady within a phase rather than jittering every frame, and shifts when the phase changes.
- **Fog:** translucent "no data" patches whose count and opacity grow with U, placed from a stable per-deck seed. No per-deck authoring required.

**Per-point lies (DM timed):**
- `truth`: shows `truth_label` at (x, y) with the normal icon.
- `lie`: shows `lie_label` (Mislabel), optionally with a small position nudge.
- `hidden`: shows a faint `?` placeholder, or omits the point entirely at high U (Hide).
- A point auto-flips `truth` to `lie` when `current_phase >= phase_gate`, unless the DM has manually set its state. The DM can always tap to cycle `truth` to `lie` to `hidden` live.

## DM Console

Extends the existing console Decks editor. Per deck:
- Edit name and the unlock toggle (existing behavior, retained).
- A **map view** rendered from `map_json`. On it the DM can:
  - **Set party position:** click the map to place the party pin, and mark this deck as the party's current deck. Broadcasts live.
  - **Drop a point of interest:** click the map, then set `truth_label`, optional `lie_label`, `poi_type`, and optional `phase_gate`.
  - **Flip a point live:** tap an existing point to cycle `truth` to `lie` to `hidden`.
- A small read-only **unreliability readout** so the DM can see how corrupted this deck currently looks to players (U as a percentage), since the DM map shows ground truth.

The DM map always shows the truth (true party position, true labels, no fog) with the lies annotated, so the DM is never deceived by their own tool.

## Player View

The Decks app on the player phone:
- Lists decks. Unlocked decks are tappable; sealed decks show a locked state (existing behavior).
- Tapping an unlocked deck renders its schematic from `map_json`, then overlays:
  - The **party pin**, but only on the party's current deck, drifted by U.
  - **Visible points of interest** with their current `state` applied (truth label, lie label, or `?`).
  - **Ambient fog** scaled by U, and a "signal weak" header once U passes a threshold.
- Re-renders live when any of these arrive over the socket.

## Realtime Integration

New socket events, following the existing emit pattern:
- `deck:party` `{ deckId, x, y }` when the DM moves the party.
- `deck:pin` `{ deckId, pin }` when a point is added, edited, or flipped.
- Reuse the existing `decks:changed` for unlock or seal, and the existing `phase` event (a phase change re-derives U and re-renders).

The player Decks view, when active, re-renders on all four. The phase engine is the existing one from aliOS v1; this feature reads `current_phase` and adds nothing to it.

## Scope and Phasing

**In this feature (v1 of Deck Maps):**
- `map_json` schematic rendering on console and player, normalized coordinates.
- Six co-authored deck schematics (Crown through Deck Zero), built from the DM's layout descriptions.
- Party pin with drift; party position in `game_state`, set from the console, broadcast live.
- Points of interest with truth / lie / hidden, manual flip and phase-gate auto-flip; decoys as a no-truth point.
- Ambient fog scaled by U.
- Console Decks editor: party placement, point authoring, live flips, unreliability readout.
- Player Decks view rendering all of the above with live updates.

**Deferred / future:**
- A visual fog-zone authoring tool (v1 auto-generates fog from a seed).
- Animated transitions on the map (a corruption "settling" animation).
- Any per-player pins.

**Relationship to other work:** this is independent of the console rework backlog (`docs/console-backlog.md`). It is its own spec, plan, and build cycle.

## Open Questions for Implementation Planning

- Exact drift offset curve and fog patch parameters (tune against the real schematics).
- The `map_json` shape vocabulary (which primitives: rect rooms, polyline corridors, ellipse features, text labels). Settle the minimal set that draws all six decks.
- Whether `state` overrides set by the DM should persist across a phase change or be re-evaluated against `phase_gate` (default: a manual DM set wins until the DM clears it).
