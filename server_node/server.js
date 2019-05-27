const WebSocket = require('ws');
const crypto = require('crypto');

const PORT = 8080
const ALFNUM = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";

function randomInt(low, high) {
  return Math.floor(Math.random() * (high - low + 1) + low);
}

function randomId() {
	return Math.abs(new Int32Array(crypto.randomBytes(4).buffer)[0]);
}

function randomSecret() {
	var out = "";
	for (var i = 0; i < 32; i++) {
		out += ALFNUM[randomInt(0, ALFNUM.length)];
	}
	return out;
}

const wss = new WebSocket.Server({ port: PORT });

class Peer {
	constructor (id, ws) {
		this.id = id;
		this.ws = ws;
		this.lobby = "";
	}
}

class Lobby {
	constructor (host) {
		this.host = host;
		this.peers = [];
	}
	getPeerId (peer) {
		return this.host === peer.id ? 1 : peer.id;
	}
	join (peer) {
		var assigned = this.getPeerId(peer);
		var me = this;
		peer.ws.send(`I: ${assigned}\n`);
		this.peers.forEach(function (p) {
			p.ws.send(`N: ${assigned}\n`);
			peer.ws.send(`N: ${me.getPeerId(p)}\n`);
		});
		this.peers.push(peer);
	}
	leave (peer) {
		var idx = this.peers.findIndex(function (p) {
			return peer === p;
		});
		if (idx === -1) return false;
		var assigned = this.getPeerId(peer);
		var close = assigned === 1;
		var me = this;
		this.peers.forEach(function (p) {
			if (close) p.ws.close(); // Room host disconnected, must close.
			else p.ws.send(`D: ${assigned}\n` ); // Notify peer disconnect.
		});
		this.peers.splice(idx, 1);
		return close;
	}
}

var lobbies = {}

function _join_lobby(peer, lobby) {
	if (lobby === '') {
		// Peer must not already be in a lobby
		if (peer.lobby !== '') return false;
		lobby = randomSecret();
		lobbies[lobby] = new Lobby(peer.id);
	} else if (!lobbies.hasOwnProperty(lobby)) {
		return false; // Lobby does not exists
	}
	peer.lobby = lobby;
	console.log(`Peer ${peer.id} joining lobby ${lobby} with ${lobbies[lobby].peers.length} peers`);
	lobbies[lobby].join(peer);
	peer.ws.send(`J: ${lobby}\n`);
	return true;
}

function _parseMsg(peer, msg) {
	var sep = msg.indexOf('\n');
	if (sep < 0) return false;

	var cmd = msg.slice(0, sep);
	if (cmd.length < 3) return false;

	var data = msg.slice(sep);

	// Lobby joining.
	if (cmd.startsWith('J: ')) {
		return _join_lobby(peer, cmd.substr(3).trim());
	}

	// Message relaying format:
	//
	// [O|A|C]: DEST_ID\n
	// PAYLOAD
	//
	// O: Client is sending an offer.
	// A: Client is sending an answer.
	// C: Client is sending a candidate.
	if (!peer.lobby) return false; // Peer is not in a lobby.
	var lobby = lobbies[peer.lobby];
	if (!lobby) return false; // Peer is in an invalid lobby.
	var destId = parseInt(cmd.substr(3).trim());
	if (!destId) return false; // Dest is not an ID.
	if (destId === 1) destId = lobby.host;
	var dest = lobbies[peer.lobby].peers.find(function (elem) {
		return elem.id === destId;
	});
	if (dest === undefined) return false; // Dest is not in this room.

	if (cmd.startsWith('O: ') || cmd.startsWith('A: ') || cmd.startsWith('C: ')) {
		dest.ws.send(cmd[0] + ": " + lobby.getPeerId(peer) + data);
	}
	return true;
}

wss.on('connection', function connection(ws) {
	var id = randomId();
	var peer = new Peer(id, ws);
	ws.on('message', function (message) {
		if (typeof message != 'string') {
			ws.close();
			return;
		}
		if (!_parseMsg(peer, message)) {
			console.log(`Error parsing message from ${id}:\n${message}`);
			ws.close();
		}
	});
	ws.on('close', function (code, reason) {
		console.log(`Connection with peer ${peer.id} closed with reason ${code}: ${reason}`);
		if (peer.lobby && lobbies.hasOwnProperty(peer.lobby) && lobbies[peer.lobby].leave(peer)) {
			delete lobbies[peer.lobby];
			console.log(`Deleted lobby ${peer.lobby}`);
			peer.lobby = '';
		}
	});
	ws.on('error', function(error) {
		console.error(error);
	});
});
