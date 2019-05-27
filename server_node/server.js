const WebSocket = require("ws");
const crypto = require("crypto");

const PORT = 8080;
const ALFNUM = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";

function randomInt (low, high) {
	return Math.floor(Math.random() * (high - low + 1) + low);
}

function randomId () {
	return Math.abs(new Int32Array(crypto.randomBytes(4).buffer)[0]);
}

function randomSecret () {
	let out = "";
	for (let i = 0; i < 32; i++) {
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
}

const lobbies = {};

function joinLobby (peer, pLobby) {
	let lobby = pLobby;
	if (lobby === "") {
		// Peer must not already be in a lobby
		if (peer.lobby !== "") return false;
		lobby = randomSecret();
		lobbies[lobby] = new Lobby(peer.id);
	} else if (!(lobby in lobbies)) {
		return false; // Lobby does not exists
	}
	peer.lobby = lobby;
	console.log(`Peer ${peer.id} joining lobby ${lobby} ` +
		`with ${lobbies[lobby].peers.length} peers`);
	lobbies[lobby].join(peer);
	peer.ws.send(`J: ${lobby}\n`);
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

	// Message relaying format:
	//
	// [O|A|C]: DEST_ID\n
	// PAYLOAD
	//
	// O: Client is sending an offer.
	// A: Client is sending an answer.
	// C: Client is sending a candidate.
	if (!peer.lobby) return false; // Peer is not in a lobby.
	const lobby = lobbies[peer.lobby];
	if (!lobby) return false; // Peer is in an invalid lobby.
	let destId = parseInt(cmd.substr(3).trim());
	if (!destId) return false; // Dest is not an ID.
	if (destId === 1) destId = lobby.host;
	const dest = lobbies[peer.lobby].peers.find((e) => e.id === destId);
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
		console.log(`Connection with peer ${peer.id} closed ` +
			`with reason ${code}: ${reason}`);
		if (peer.lobby && !(peer.lobby in lobbies) &&
			lobbies[peer.lobby].leave(peer)) {
			delete lobbies[peer.lobby];
			console.log(`Deleted lobby ${peer.lobby}`);
			peer.lobby = "";
		}
	});
	ws.on("error", (error) => {
		console.error(error);
	});
});
