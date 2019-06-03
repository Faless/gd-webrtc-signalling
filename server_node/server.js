const WebSocket = require("ws");
const crypto = require("crypto");

const MAX_PEERS = 4096;
const MAX_LOBBIES = 1024;
const PORT = 9080;
const ALFNUM = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";

function randomInt (low, high) {
	return Math.floor(Math.random() * (high - low + 1) + low);
}

function randomId () {
	return Math.abs(new Int32Array(crypto.randomBytes(4).buffer)[0]);
}

function randomSecret () {
	let out = "";
	for (let i = 0; i < 16; i++) {
		out += ALFNUM[randomInt(0, ALFNUM.length - 1)];
	}
	return out;
}

const wss = new WebSocket.Server({ port: PORT });

class Peer {
	constructor (id, ws) {
		this.id = id;
		this.ws = ws;
		this.lobby = "";
		// Close connection after 1 sec if client has not joined a lobby
		setTimeout(() => {
			if (!this.lobby) ws.close();
		}, 1000);
	}
}

class Lobby {
	constructor (name, host) {
		this.name = name;
		this.host = host;
		this.peers = [];
		this.sealed = false;
	}
	getPeerId (peer) {
		if (this.host === peer.id) return 1;
		return peer.id;
	}
	join (peer) {
		const assigned = this.getPeerId(peer);
		peer.ws.send(`I: ${assigned}\n`);
		this.peers.forEach((p) => {
			p.ws.send(`N: ${assigned}\n`);
			peer.ws.send(`N: ${this.getPeerId(p)}\n`);
		});
		this.peers.push(peer);
	}
	leave (peer) {
		const idx = this.peers.findIndex((p) => peer === p);
		if (idx === -1) return false;
		const assigned = this.getPeerId(peer);
		const close = assigned === 1;
		this.peers.forEach((p) => {
			// Room host disconnected, must close.
			if (close) p.ws.close();
			// Notify peer disconnect.
			else p.ws.send(`D: ${assigned}\n`);
		});
		this.peers.splice(idx, 1);
		return close;
	}
	seal (peer) {
		// Only host can seal
		if (peer.id !== this.host) return false;
		this.sealed = true;
		this.peers.forEach((p) => {
			p.ws.send("S: \n");
		});
		console.log(`Peer ${peer.id} sealed lobby ${this.name} ` +
			`with ${this.peers.length} peers`);
		return true;
	}
}

const lobbies = new Map();
let peersCount = 0;

function joinLobby (peer, pLobby) {
	let lobbyName = pLobby;
	if (lobbyName === "") {
		if (lobbies.size >= MAX_LOBBIES) {
			console.log("Too many lobbies open, disconnecting");
			return false;
		}
		// Peer must not already be in a lobby
		if (peer.lobby !== "") return false;
		lobbyName = randomSecret();
		lobbies.set(lobbyName, new Lobby(lobbyName, peer.id));
		console.log(`Peer ${peer.id} created lobby ${lobbyName}`);
		console.log(`Open lobbies: ${lobbies.size}`);
	}
	const lobby = lobbies.get(lobbyName);
	if (!lobby) return false; // Lobby does not exists
	if (lobby.sealed) return false; // Lobby is sealed
	peer.lobby = lobbyName;
	console.log(`Peer ${peer.id} joining lobby ${lobbyName} ` +
		`with ${lobby.peers.length} peers`);
	lobby.join(peer);
	peer.ws.send(`J: ${lobbyName}\n`);
	return true;
}

function parseMsg (peer, msg) {
	const sep = msg.indexOf("\n");
	if (sep < 0) return false;

	const cmd = msg.slice(0, sep);
	if (cmd.length < 3) return false;

	const data = msg.slice(sep);

	// Lobby joining.
	if (cmd.startsWith("J: ")) {
		return joinLobby(peer, cmd.substr(3).trim());
	}

	if (!peer.lobby) return false; // Peer is not in a lobby.
	const lobby = lobbies.get(peer.lobby);
	if (!lobby) return false; // Peer is in an invalid lobby.

	// Lobby sealing.
	if (cmd.startsWith("S: ")) {
		return lobby.seal(peer);
	}

	// Message relaying format:
	//
	// [O|A|C]: DEST_ID\n
	// PAYLOAD
	//
	// O: Client is sending an offer.
	// A: Client is sending an answer.
	// C: Client is sending a candidate.
	let destId = parseInt(cmd.substr(3).trim());
	if (!destId) return false; // Dest is not an ID.
	if (destId === 1) destId = lobby.host;
	const dest = lobby.peers.find((e) => e.id === destId);
	if (!dest) return false; // Dest is not in this room.

	function isCmd (what) {
		return cmd.startsWith(`${what}: `);
	}
	if (isCmd("O") || isCmd("A") || isCmd("C")) {
		dest.ws.send(cmd[0] + ": " + lobby.getPeerId(peer) + data);
	}
	return true;
}

wss.on("connection", (ws) => {
	if (peersCount >= MAX_PEERS) {
		console.log("Max peers count reached, refusing connection");
		ws.close();
		return;
	}
	peersCount++;
	const id = randomId();
	const peer = new Peer(id, ws);
	ws.on("message", (message) => {
		if (typeof message !== "string") {
			ws.close();
			return;
		}
		if (!parseMsg(peer, message)) {
			console.log(`Error parsing message from ${id}:\n` +
				message);
			ws.close();
		}
	});
	ws.on("close", (code, reason) => {
		peersCount--;
		console.log(`Connection with peer ${peer.id} closed ` +
			`with reason ${code}: ${reason}`);
		if (peer.lobby && lobbies.has(peer.lobby) &&
			lobbies.get(peer.lobby).leave(peer)) {
			lobbies.delete(peer.lobby);
			console.log(`Deleted lobby ${peer.lobby}`);
			console.log(`Open lobbies: ${lobbies.size}`);
			peer.lobby = "";
		}
	});
	ws.on("error", (error) => {
		console.error(error);
	});
});

const interval = setInterval(() => { // eslint-disable-line no-unused-vars
	wss.clients.forEach((ws) => {
		ws.ping();
	});
}, 10000);
