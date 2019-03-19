extends Node

var server : WebSocketServer = WebSocketServer.new()
var peers : Array = []

func listen(port : int):
	server.connect("data_received", self, "_parse_msg")
	server.connect("client_connected", self, "_peer_connected")
	server.connect("client_disconnected", self, "_peer_disconnected")
	server.listen(port)

func stop():
	server.stop()
	peers.clear()

func _peer_connected(id : int, protocol = ""):
	for p in peers:
		server.get_peer(p).put_packet(("C: %d\n" % id).to_utf8())
	peers.append(id)

func _peer_disconnected(id : int, was_clean : bool = false):
	for p in peers:
		server.get_peer(p).put_packet(("D: %d\n" % id).to_utf8())
	peers.erase(id)

func _parse_msg(id : int):
	var pkt_str : String = server.get_peer(id).get_packet().get_string_from_utf8()

	var req : PoolStringArray = pkt_str.split('\n', true, 1)
	if req.size() != 2: # Invalid request size
		return

	var type : String = req[0]
	if type.length() < 3: # Invalid type size
		return

	var dest_str : String = type.substr(3, type.length() - 3)
	if not dest_str.is_valid_integer(): # Destination id is not an integer
		return

	var dest_id : int = int(dest_str)
	if not peers.has(dest_id): # Destination ID not connected
		return

	if type.begins_with("O: "):
		# Client is making an offer
		server.get_peer(dest_id).put_packet(("O: %d\n%s" % [id, req[1]]).to_utf8())
	elif type.begins_with("A: "):
		# Client is making an answer
		server.get_peer(dest_id).put_packet(("A: %d\n%s" % [id, req[1]]).to_utf8())

func _process(delta):
	if server.is_listening():
		server.poll()