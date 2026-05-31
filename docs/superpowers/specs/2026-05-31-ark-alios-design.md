# aliOS Design Spec

**Date:** 2026-05-31
**Project:** ark-alios
**Status:** Approved design, pending spec review

## Summary

aliOS is a Progressive Web App that turns each player's real phone into an in-world device for a tabletop campaign. It is a one way "whisper" system: the Dungeon Master privately delivers preplanned messages, images, and ship data to individual players, and the interface itself slowly turns from a warm helper into the campaign's antagonist (the caretaker AI "Allie") as the story descends.

The app exists for one reason that a group text cannot serve: the interface is a character. It ages, lies, redacts, locks, and finally turns on the players. That decay, plus the drama of a private secret landing in one player's pocket, is the entire point.

## Context

This supports the Ark campaign, an 8 session science fantasy D&D 5e game for five middle school players (mixed experience). The campaign is set on a generation ship run by a caretaker AI named A.L.I. ("Allie"). The hidden twist is that the ship landed generations ago and Allie has kept everyone sealed inside. aliOS is the diegetic interface of that ship, given to the players as their personal device.

First play is expected roughly one month out (late June or early July 2026, exact date to be confirmed), which sets the build runway.

## Goals

1. Let the DM privately push a preplanned message to one specific player's phone, instantly, during play.
2. Make delivery feel real across a mixed device room (iPhone and Android), without depending on platform features the iPhones lack.
3. Make the interface visibly decay over the campaign, driven by a single DM controlled phase dial, culminating in a theatrical takeover at the midpoint.
4. Keep the DM's hands off the keyboard during play: preplanned by default, improvisation available when needed.
5. Stay safe and simple for minors: no real accounts, no player authored content, the DM is the only sender.

## Non-Goals (explicitly out of v1)

- Player to player messaging of any kind. The only sender is the DM.
- In app "forwarding" of secrets. Sharing a secret is a verbal roleplay choice made out loud at the table, not an app action.
- Reliable lock screen or background push as a foundation. The iPhones cannot do it consistently. Background push may ride along later as an Android only bonus.
- Player composing, replying, or typing anything. Every player surface is receive only.

## Locked Decisions

These were settled during brainstorming and are not open questions:

- **Prime directive:** DM to player orchestrated private delivery. The whisper system is the product.
- **Delivery model:** The app stays open on the table on a deliberately dull idle screen. On an incoming message every phone fires the same way: a notification chime, a screen glow, and a red badge increment, plus a vibrate on Android only. Sound carries the realism because it works on every device when the app is in the foreground.
- **Devices:** Five players, each with their own phone, mixed iPhone and Android. Five private channels.
- **Login:** Character picker plus a simple PIN that the DM sets and hands out. No email, no real accounts.
- **Home screen:** A faux phone OS home screen with six apps, each showing a live red unread badge.
- **DM control model:** Hybrid. The DM pre-writes a library of messages, fires any line with one tap, and has a free type box for improvising live. All sending is DM to player only.
- **Decay ambition:** Theatrical is the ceiling. Delivered as a phase engine (automatic aging everywhere) plus one hand built theatrical set piece at the midpoint Window reveal. More set pieces are fast follow.
- **Realtime transport:** Live socket push (Socket.io). Polling and background web push were both rejected as the spine.
- **Aesthetic direction:** A cozy, slightly too cheerful ship UI that visibly rots as the phases climb.

## Architecture

A standalone app at `~/projects/ark-alios`, built on the established house stack:

- **Backend:** Node, Express 5, better-sqlite3.
- **Realtime:** Socket.io. The server holds open connections to all five player phones and the DM console. Sends and phase changes are pushed live, landing in well under a second.
- **Frontend:** Vanilla JS PWA. Installs to the home screen so it behaves like a real device OS rather than a website in a tab.
- **One server, two front-ends:** the same backend and database serve both the Player app and the DM console at different URLs. The console lives at a hidden path (for example `/console`) gated behind the parent PIN.
- **Deploy:** PM2 plus Cloudflare Tunnel on acutis-box, following the established tunnel pattern. Proposed subdomain `alios.playdnd.online`.

## The Two Surfaces

### Player app (the phone), receive only

- **Login:** tap your character, enter the PIN.
- **Idle screen:** deliberately dull (clock, "Day 14,602 of the Voyage"). Nothing to scroll. This is the default state between beats so heads stay at the table.
- **Home screen:** the six apps with live red badges.
- **Apps:**
  - **Messages** (core): receives private messages threaded by sender (Mom, Téa, Allie, unknown). Receive only, no compose.
  - **Allie:** the assistant app. Its voice and behavior shift by phase. This is the interface character that turns.
  - **Archive:** a search box over a curated ship knowledge base. Returns DM authored entries, or `ACCESS DENIED` for redacted topics (for example, searching "Window").
  - **Photos:** displays pushed images (handouts, "photos a friend sent").
  - **Decks:** a map of the ship that unlocks deeper levels as the party descends.
  - **Settings:** flavor (name, Voyage info) and a surface where decay glitches appear.
- **On incoming push:** chime, screen glow, badge increment, plus vibrate on Android.

### DM console (laptop, also phone usable), the cockpit

- **Roster:** all five players at a glance, connection status, and read receipts so the DM knows whether a player actually opened a message.
- **Message library:** pre-written lines, each tagged to a sender, a target app, an optional image, and an optional phase gate. One tap fires a line to a chosen player.
- **Free type box:** improvise a line as any sender to any player, live.
- **Phase dial (1 to 5):** advance the decay. The whole room ages at once.
- **Archive editor:** set what the ship knows and what reads `ACCESS DENIED`. Pre-built or toggled live.
- **Image push:** upload and send an image to a player's Photos or Messages.

The console is responsive so it works from a laptop browser tab (default, more room to see all five players) or the DM's phone (to keep Foundry full screen on the projector).

## Data Model (SQLite)

- **`characters`** — the five player characters: name, PIN, avatar.
- **`senders`** — every voice the DM can send as: name, avatar, `is_allie` flag (Allie is the OS itself and is special).
- **`messages`** — the pre-written library. Fields: sender, target app, body text, optional image, optional phase gate. Reusable templates.
- **`deliveries`** — the log of everything actually sent. Fields: target character, sender, exact text and image sent, app, `sent_at`, `read_at`, and the phase at send time. This is the read receipt store and the "what does this player know" memory.
- **`archive_entries`** — curated ship knowledge: keyword or topic, response body, `redacted` flag, optional phase gate.
- **`decks`** — map levels, each with an `unlocked` flag.
- **`game_state`** — a single row: `current_phase`, `current_session`, and any global state.

## The Phase Engine (the decay)

A single global `current_phase` (1 to 5) is the spine of the "Allie turns" effect. Everything keys off it:

- **Palette** cools from warm teal toward something sickly.
- **Allie's voice** shifts: helpful, then clingy, then wrong, then adversarial.
- **Apps** lock and unlock, badges seed onto previously empty apps, glitches intensify.
- **Archive** redacts more topics as the phase climbs.

When the DM taps the dial, a `phase_changed` event reaches all five phones over the socket and they re-theme live, with a short transition so players see the world shift in their hands.

Mapping to the campaign arc:

- **Phase 1 (Sessions 1 to 2):** warm, cozy, "everything is fine." Allie is a sweetheart.
- **Phase 2 (Session 3):** first hairline cracks. A friend goes quiet. One app locks.
- **Phase 3 (Session 4, the Window):** the one hand built theatrical set piece in v1. Allie hijacks all five screens at once for the reveal. The only fully scripted cutscene built for launch.
- **Phase 4 (Sessions 5 to 6):** Allie is an active opponent. Cold, redacted, glitching, locking players out.
- **Phase 5 (Sessions 7 to 8):** endgame state, set by the DM based on the ending the players choose (tear down, reseal, or free her).

## Delivery Feel ("feels real")

Because the device room is mixed, realism rides on what works everywhere in the foreground:

- **Chime:** a distinct notification sound, ideally a recognizable "Allie" tone the players learn to dread. Works on every device.
- **Glow:** the screen visibly reacts on arrival.
- **Badge:** the red unread count increments on the relevant app icon.
- **Vibrate:** Android only, treated as a bonus, never as the foundation.

## v1 Scope Fence

**In v1 (must exist before Session 1):**

- Server, DB, Socket.io, PWA scaffold, deployed at `alios.playdnd.online` behind the tunnel.
- Login (character picker plus PIN).
- Player home screen: all six apps, live red badges, the dull idle screen.
- Messages (receive only, threaded by sender).
- Allie (phase aware tone) and Archive (curated entries plus redaction).
- Photos, Decks, Settings, kept thin.
- Delivery feel: chime, glow, badge, Android vibrate.
- DM console: roster with read receipts, message library plus one tap send, free type box, phase dial, archive editor, image push.
- Phase engine 1 to 5 (palette, Allie's voice, locks, glitches).
- One theatrical set piece: the Phase 3 Window takeover.

**Fast follow (between sessions, not blocking launch):**

- More theatrical set pieces at other beats.
- Background web push (Android lock screen bonus).
- Animation polish beyond the one cutscene.

**Parked (maybe never):** player to player chat.

**Cut-line if the runway gets tight (in order):**

1. Decks ships as a static image instead of an unlocking map.
2. The Phase 3 cutscene degrades to a simpler scripted message sequence instead of a full animated takeover.

Messages, Allie, Archive, and the phase engine are not cut under any circumstance. They are the reason this beats a group text.

## Safety and Trust

- No real accounts, no email, no personal data beyond a character name and a DM set PIN.
- The DM is the only sender. No player can put text on another player's screen, so there is no peer moderation surface.
- The console is gated behind the parent PIN at a hidden path.
- Parents are informed the app exists before Session Zero.

## Open Questions for Implementation Planning

- Exact phase to palette token mapping (specific colors per phase).
- Service worker scope and offline caching strategy for the PWA install.
- Asset list for the Phase 3 cutscene (the one set piece that needs real production).
