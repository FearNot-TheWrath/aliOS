// src/sockets.js
const { readToken } = require('./auth');

function roomForCharacter(id) { return `char:${id}`; }
const CONSOLE_ROOM = 'console';

// minimal cookie header parser (avoids a dep); returns { name: value }
function parseCookies(header) {
  const out = {};
  String(header || '').split(';').forEach((pair) => {
    const i = pair.indexOf('=');
    if (i === -1) return;
    out[pair.slice(0, i).trim()] = decodeURIComponent(pair.slice(i + 1).trim());
  });
  return out;
}

function attach(io, { secret }) {
  io.use((socket, next) => {
    const cookies = parseCookies(socket.handshake.headers.cookie);
    // console (parent) cookie wins if present; otherwise player auth token or cookie
    const consoleClaims = readToken(cookies.alios_console, secret);
    if (consoleClaims && consoleClaims.role === 'parent') {
      socket.data.claims = consoleClaims;
      return next();
    }
    const playerToken = (socket.handshake.auth && socket.handshake.auth.token) || cookies.alios_session;
    const playerClaims = readToken(playerToken, secret);
    if (playerClaims && playerClaims.role === 'player') {
      socket.data.claims = playerClaims;
      return next();
    }
    return next(new Error('unauthorized'));
  });

  io.on('connection', (socket) => {
    const { role, characterId } = socket.data.claims;
    if (role === 'player') socket.join(roomForCharacter(characterId));
    if (role === 'parent') socket.join(CONSOLE_ROOM);
  });
}

function emitDelivery(io, characterId, delivery) {
  io.to(roomForCharacter(characterId)).emit('delivery', delivery);
  io.to(CONSOLE_ROOM).emit('delivery:sent', { characterId, delivery });
}

function emitRead(io, characterId, deliveryId) {
  io.to(CONSOLE_ROOM).emit('delivery:read', { characterId, deliveryId });
}

module.exports = { attach, emitDelivery, emitRead, roomForCharacter, CONSOLE_ROOM };
