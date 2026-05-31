# aliOS

In-world phone OS for the Ark campaign. A DM whisper system plus a decaying interface (the caretaker AI "Allie").

The DM privately pushes preplanned messages, images, and ship records to each player's phone. One phase dial ages the whole interface across every phone at once, building to a theatrical Window takeover at the midpoint.

## Stack
Node, Express 5, better-sqlite3, Socket.io, vanilla JS PWA. Tests use node:test.

## Run locally
```
npm install
npm test
npm start
```
Player app: http://localhost:3007
DM console: http://localhost:3007/console  (parent PIN, default 1234)

## How it fits together
- Players log in by tapping their character and entering a PIN you hand out.
- The console is where you send messages, fire library lines, push images, edit the Archive, manage Decks, set the phase, and trigger the Window cutscene.
- Deliveries land live over a websocket with a chime, a screen glow, and a red badge. Vibration fires on Android only.

## First-run setup
1. Set a long random SESSION_SECRET (copy .env.example to .env or export it).
2. Change the parent PIN away from the default:
   ```
   node -e "const{openDb}=require('./src/db');const{setConfig}=require('./src/config');const db=openDb(process.env.DB_PATH||'./data/alios.db');setConfig(db,'parent_pin','REPLACE_PIN');console.log('pin set')"
   ```
3. Edit the seeded crew names and PINs from the database (or reseed) so each player has their own character and PIN.

## Deploy (acutis-box, manual)
1. Set SESSION_SECRET and the parent PIN as above.
2. Start under PM2:
   ```
   pm2 start ecosystem.config.js
   pm2 save
   ```
3. Add a Cloudflare Tunnel ingress rule in /etc/cloudflared/config.yml:
   ```
   - hostname: alios.thelopezfamily.org
     service: http://localhost:3007
   ```
   then restart: `sudo systemctl restart cloudflared`
4. Add a CNAME for alios pointing at the tunnel.
5. Verify https://alios.thelopezfamily.org serves the player app and /console prompts for the PIN.

## Notes
- iPhones cannot vibrate from a web app and cannot reliably receive background push. The design keeps the app open on the table during play, so delivery relies on sound plus a visual glow, which work on every device.
- The chime and icons in public/player are generated placeholders. Swap in bespoke art and sound any time.
