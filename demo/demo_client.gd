extends Node

var peers : Dictionary = {}
var connected_peers = []
var peer_id : int = -1
onready var client = $WSClient
var rtc_mp : WebRTCMultiplayer = WebRTCMultiplayer.new()

func start():
	stop()
	client.connect_to_url("ws://localhost:8080")

func stop():
	peers.clear()
	rtc_mp.close()
	client.close()

func _physics_process(delta):
	rtc_mp.poll()
	while rtc_mp.get_available_packet_count() > 0:
		print(rtc_mp.get_packet().get_string_from_utf8())

func _create_peer(id : int):
	var peer : WebRTCPeerConnection = WebRTCPeerConnection.new()
	peer.initialize({
		"iceServers": [ { "urls": ["stun:stun.l.google.com:19302"] } ]
	})
	peer.connect("session_description_created", self, "_offer_created", [id])
	peer.connect("ice_candidate_created", self, "_new_ice_candidate", [id])
	rtc_mp.add_remote_peer(peer, id)
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
	rtc_mp.initialize(id)
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