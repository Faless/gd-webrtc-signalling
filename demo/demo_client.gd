extends Node

var peers : Dictionary = {}
var connected_peers = []
var peer_id : int = -1
onready var client = $WSClient

func start():
	stop()
	client.connect_to_url("ws://localhost:8080")

func stop():
	client.close()
	peers.clear()
	client.close()

func get_peer(id : int) -> WebRTCPeer:
	if not connected_peers.has(id) or not peers.has(id):
		return null
	return peers[id]

func _physics_process(delta):
	for id in peers:
		var c : WebRTCPeer = peers[id]
		c.poll()
		if c.get_connection_state() == WebRTCPeer.STATE_CONNECTED:
			if not connected_peers.has(id):
				connected_peers.append(id)
				c.put_packet(("Hello from %d" % id).utf8())
		if c.get_available_packet_count() > 0:
			print("Got packet from %d: %s" % [id, c.get_packet().get_string_from_utf8()])

func _create_peer(id : int):
	var peer : WebRTCPeer = WebRTCPeer.new()
	if OS.get_name() != "HTML5":
		peer = load("res://demo/webrtc/webrtc.gdns").new()
	peer.connect("offer_created", self, "_offer_created", [id])
	peer.connect("new_ice_candidate", self, "_new_ice_candidate", [id])
	if id > peer_id:
		peer.create_offer()
	return peer

func _new_ice_candidate(mid_name : String, index_name : int, sdp_name : String, id : int):
	printt(id, mid_name, index_name, sdp_name)
	client.send_candidate(id, mid_name, index_name, sdp_name)

func _offer_created(type : String, data : String, id : int):
	if not peers.has(id):
		return
	peers[id].set_local_description(type, data)
	if type == "offer":
		client.send_offer(id, data)
	else: # "answer"
		client.send_answer(id, data)

func connected(id : int):
	peer_id = id

func disconnected():
	peer_id = -1

func peer_connected(id : int):
	print("Peer connected %d" % id)
	peers[id] = _create_peer(id)

func peer_disconnected(id : int):
	if peers.has(id):
		peers.erase(id)

func offer_received(id : int, offer : String):
	print("Got offer: %d" % id)
	if peers.has(id):
		peers[id].set_remote_description("offer", offer)

func answer_received(id : int, answer : String):
	print("Got answer: %d" % id)
	if peers.has(id):
		peers[id].set_remote_description("answer", answer)

func candidate_received(id : int, mid : String, index : int, sdp : String):
	if peers.has(id):
		peers[id].add_ice_candidate(mid, index, sdp)

func generate_multiplayer_peer():
	if peers.size() < 1:
		return
	var server : int = peer_id
	var multi : WebRTCMultiplayer = WebRTCMultiplayer.new()
	var keys : Array = peers.keys()
	keys.sort()
	if keys[0] < peer_id:
		multi.create_client(peers[keys[0]], peer_id)
	else:
		multi.create_server(peers.size())
	for id in keys:
		if id == server:
			continue
		multi.accept_peer(peers[id], id)
	return multi