extends Node

var client : WebSocketClient = WebSocketClient.new()

# Called when the node enters the scene tree for the first time.
func _ready():
	pass

func connect_to_url(url : String):
	client.connect("data_received", self, "_parse_msg")
	client.connect_to_url(url)

func close():
	client.disconnect_from_host()

func _parse_msg():
	var pkt_str : String = client.get_peer(1).get_packet().get_string_from_utf8()

	var req : PoolStringArray = pkt_str.split('\n', true, 1)
	if req.size() != 2: # Invalid request size
		return

	var type : String = req[0]
	if type.length() < 3: # Invalid type size
		return

	var src_str : String = type.substr(3, type.length() - 3)
	if not src_str.is_valid_integer(): # Source id is not an integer
		return

	var src_id : int = int(src_str)

	if type.begins_with("C: "):
		# Client connected
		emit_signal("peer_connected", src_id)
	elif type.begins_with("D: "):
		# Client connected
		emit_signal("peer_disconnected", src_id)
	elif type.begins_with("O: "):
		# Offer received
		emit_signal("offer_received", src_id, req[1])
	elif type.begins_with("A: "):
		# Answer received
		emit_signal("answer_received", src_id, req[1])

func send_offer(id : int, offer : String):
	client.get_peer(1).put_packet(str(id).to_utf8())
	client.get_peer(1).put_packet(offer.to_utf8())

func send_answer(id : int, answer : String):
	client.get_peer(1).put_packet(str(id).to_utf8())
	client.get_peer(1).put_packet(answer.to_utf8())

func _process(delta):
	var status : int = client.get_connection_status()
	if status == WebSocketClient.CONNECTION_CONNECTING or status == WebSocketClient.CONNECTION_CONNECTED:
		client.poll()