extends Node

var peers : Dictionary = {}
var connected_peers = []
var peer_id : int = -1
onready var client = $WSClient

# Called when the node enters the scene tree for the first time.
func _ready():
	pass # Replace with function body.

func start():
	stop()
	client.connect_to_url("ws://localhost:8080")

func stop():
	client.close()
	peers.clear()
	client.close()

func _physics_process(delta):
	for id in peers:
		var c : WebRTCPeer = peers[id]
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
	peer.connect("new_ice_candidate", self, "_new_ice_candidate")
	peer.create_offer()
	return peer

func _new_ice_candidate(mid_name : String, index_name : String, sdp_name : String, id : int):
	peers[id].add_ice_candidate(mid_name, index_name, sdp_name)

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
	peers[id] = _create_peer(id)

func peer_disconnected(id : int):
	if peers.has(id):
		peers.erase(id)

func offer_received(id : int, offer : String):
	if peers.has(id):
		peers[id].set_remote_description("offer", offer)

func answer_received(id : int, answer : String):
	if peers.has(id):
		peers[id].set_remote_description("answer", answer)