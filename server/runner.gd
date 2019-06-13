extends SceneTree

const Server : GDScript = preload("res://server/ws_webrtc_server.gd")

var server = Server.new()

func _init():
	root.add_child(server)
	server.listen(8080)

func _iteration(delta):
	server.poll()
