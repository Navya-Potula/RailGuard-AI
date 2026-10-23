from flask import Flask, request, jsonify, Response
from flask_cors import CORS
import time
import threading

app = Flask(__name__)
CORS(app)

# ==========================================
# CONFIGURATION
# ==========================================

CAMERA_IDS = ["CAM-01", "CAM-02", "CAM-03"]

# Camera is considered offline if no crowd update
# is received within this many seconds.
CAMERA_TIMEOUT = 3.0

# A CCTV frame is considered stale after this period.
FRAME_TIMEOUT = 2.0

camera_lock = threading.Lock()


# ==========================================
# INITIAL CAMERA DATA
# ==========================================

def create_camera(camera_id, platform):
    return {
        "crowd_data": {
            "camera_id": camera_id,
            "platform": platform,
            "people": 0,
            "density": 0,
            "status": "NORMAL",
            "entry": 0,
            "waiting": 0,
            "exit": 0,
            "highest_zone": "WAITING",
            "highest_zone_count": 0,
            "staff_action": "Waiting for AI data",
        },
        "frame": None,
        "last_data_update": None,
        "last_frame_update": None,
    }


cameras = {
    "CAM-01": create_camera("CAM-01", 1),
    "CAM-02": create_camera("CAM-02", 2),
    "CAM-03": create_camera("CAM-03", 3),
}


# ==========================================
# CAMERA STATUS HELPERS
# ==========================================

def get_camera_snapshot(camera_id):
    camera = cameras[camera_id]

    now = time.monotonic()

    last_data_update = camera["last_data_update"]
    last_frame_update = camera["last_frame_update"]

    camera_online = (
        last_data_update is not None
        and now - last_data_update <= CAMERA_TIMEOUT
    )

    frame_online = (
        last_frame_update is not None
        and now - last_frame_update <= FRAME_TIMEOUT
    )

    result = camera["crowd_data"].copy()

    result["camera_online"] = camera_online
    result["frame_online"] = frame_online

    result["last_data_update"] = last_data_update
    result["last_frame_update"] = last_frame_update

    # Do not report an old crowd status as a current live status.
    if not camera_online:
        result["status"] = "OFFLINE"
        result["staff_action"] = (
            "Check camera connection and restore AI monitoring."
        )

    return result


# ==========================================
# GET ALL CAMERA DATA
# ==========================================

@app.route("/api/cameras", methods=["GET"])
def get_all_cameras():
    with camera_lock:
        result = {
            camera_id: get_camera_snapshot(camera_id)
            for camera_id in CAMERA_IDS
        }

    return jsonify(result)


# ==========================================
# UPDATE CROWD DATA FROM YOLO
# ==========================================

@app.route("/api/crowd", methods=["POST"])
def update_crowd():
    data = request.get_json(silent=True)

    if not isinstance(data, dict):
        return jsonify({
            "success": False,
            "message": "Valid JSON data is required.",
        }), 400

    camera_id = str(
        data.get("camera_id", "CAM-01")
    ).upper()

    if camera_id not in cameras:
        return jsonify({
            "success": False,
            "message": f"Unknown camera: {camera_id}",
        }), 404

    with camera_lock:
        camera = cameras[camera_id]

        camera["crowd_data"].update(data)

        camera["crowd_data"]["camera_id"] = camera_id
        camera["crowd_data"]["platform"] = int(
            camera["crowd_data"].get(
                "platform",
                CAMERA_IDS.index(camera_id) + 1,
            )
        )

        camera["last_data_update"] = time.monotonic()

    return jsonify({
        "success": True,
        "camera_id": camera_id,
    })


# ==========================================
# GET CROWD DATA FOR ONE CAMERA
# ==========================================

@app.route("/api/crowd", methods=["GET"])
def get_crowd():
    camera_id = (
        request.args.get("camera_id") or "CAM-01"
    ).upper()

    if camera_id not in cameras:
        return jsonify({
            "success": False,
            "message": f"Unknown camera: {camera_id}",
        }), 404

    with camera_lock:
        result = get_camera_snapshot(camera_id)

    return jsonify(result)


# ==========================================
# RECEIVE YOLO-ANNOTATED VIDEO FRAME
# ==========================================

@app.route("/api/video_frame", methods=["POST"])
def receive_video_frame():
    camera_id = (
        request.form.get("camera_id")
        or request.args.get("camera_id")
        or request.headers.get("X-Camera-ID")
        or "CAM-01"
    ).upper()

    if camera_id not in cameras:
        return jsonify({
            "success": False,
            "message": f"Unknown camera: {camera_id}",
        }), 404

    if "frame" not in request.files:
        return jsonify({
            "success": False,
            "message": "No frame received.",
        }), 400

    frame_bytes = request.files["frame"].read()

    if not frame_bytes:
        return jsonify({
            "success": False,
            "message": "Empty frame received.",
        }), 400

    with camera_lock:
        cameras[camera_id]["frame"] = frame_bytes
        cameras[camera_id]["last_frame_update"] = time.monotonic()

    return jsonify({
        "success": True,
        "camera_id": camera_id,
    })


# ==========================================
# STREAM THE CORRECT CAMERA'S CCTV FEED
# ==========================================

@app.route("/video_feed", methods=["GET"])
def video_feed():
    camera_id = (
        request.args.get("camera_id") or "CAM-01"
    ).upper()

    if camera_id not in cameras:
        return jsonify({
            "success": False,
            "message": f"Unknown camera: {camera_id}",
        }), 404

    def generate():
        last_sent_frame = None

        while True:
            with camera_lock:
                camera = cameras[camera_id]
                frame = camera["frame"]
                frame_time = camera["last_frame_update"]

            # Send only when a new frame has arrived.
            if (
                frame is not None
                and frame_time is not None
                and frame_time != last_sent_frame
            ):
                yield (
                    b"--frame\r\n"
                    b"Content-Type: image/jpeg\r\n"
                    b"Cache-Control: no-cache\r\n\r\n"
                    + frame
                    + b"\r\n"
                )

                last_sent_frame = frame_time

            time.sleep(0.04)

    return Response(
        generate(),
        mimetype="multipart/x-mixed-replace; boundary=frame",
        headers={
            "Cache-Control": "no-cache, no-store, must-revalidate",
            "Pragma": "no-cache",
            "X-Accel-Buffering": "no",
        },
    )


# ==========================================
# BACKEND HEALTH CHECK
# ==========================================

@app.route("/", methods=["GET"])
def home():
    return jsonify({
        "message": "RailGuard AI Multi-Camera Backend is running!",
        "cameras": CAMERA_IDS,
    })


# ==========================================
# START SERVER
# ==========================================

if __name__ == "__main__":
    app.run(
        host="127.0.0.1",
        port=5000,
        debug=False,
        threaded=True,
    ) 