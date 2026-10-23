from pathlib import Path
import time

import cv2
import requests
from ultralytics import YOLO


# ==========================================
# 1. PROJECT PATHS
# ==========================================

ROOT = Path(__file__).resolve().parent.parent

MODEL_PATH = ROOT / "yolov8m.pt"


API_URL = "https://railguard-backend-38sa.onrender.com/api/crowd"
VIDEO_API_URL = "https://railguard-backend-38sa.onrender.com/api/video_frame"



# ==========================================
# 2. CAMERA CONFIGURATION
# ==========================================

CAMERAS = [
    {
        "camera_id": "CAM-01",
        "platform": 1,
        "video_path": ROOT / "videos" / "platform1.mp4",
    },
    {
        "camera_id": "CAM-02",
        "platform": 2,
        "video_path": ROOT / "videos" / "platform2.mp4",
    },
    {
        "camera_id": "CAM-03",
        "platform": 3,
        "video_path": ROOT / "videos" / "platform3.mp4",
    },
]

SAFE_CAPACITY = 40

DISPLAY_WIDTH = 960
DISPLAY_HEIGHT = 540

CONFIDENCE = 0.15
IMAGE_SIZE = 1280

ZONE1_X = 320
ZONE2_X = 640

API_UPDATE_INTERVAL = 0.2
FRAME_UPDATE_INTERVAL = 0.1


# ==========================================
# 3. CHECK MODEL AND VIDEOS
# ==========================================

if not MODEL_PATH.exists():
    raise FileNotFoundError(
        f"YOLO model not found: {MODEL_PATH}"
    )

for camera in CAMERAS:
    if not camera["video_path"].exists():
        raise FileNotFoundError(
            f"Video not found for {camera['camera_id']}: "
            f"{camera['video_path']}"
        )


# ==========================================
# 4. INITIALIZE CAMERAS
# ==========================================

camera_states = {}

print("Loading YOLO models for all cameras...")

for camera in CAMERAS:

    camera_id = camera["camera_id"]

    print(f"Loading {camera_id}...")

    # Each camera gets its own model/tracker state.
    model = YOLO(str(MODEL_PATH))

    cap = cv2.VideoCapture(
        str(camera["video_path"])
    )

    if not cap.isOpened():
        raise RuntimeError(
            f"Could not open video for {camera_id}: "
            f"{camera['video_path']}"
        )

    camera_states[camera_id] = {
        "config": camera,
        "model": model,
        "cap": cap,
        "last_api_update": 0,
        "last_frame_update": 0,
        "last_warning": 0,
        "previous_people": -1,
        "session": requests.Session(),
    }

    print(f"{camera_id} initialized successfully!")


print("\nAll cameras initialized.")
print("Press Q in a video window to stop all detectors.")


# ==========================================
# 5. PROCESS ONE CAMERA FRAME
# ==========================================

def process_camera(camera_id, state):

    config = state["config"]
    model = state["model"]
    cap = state["cap"]

    current_time = time.monotonic()

    # Read the next video frame.
    ret, frame = cap.read()

    # Restart the video when it ends.
    if not ret:

        cap.set(cv2.CAP_PROP_POS_FRAMES, 0)

        # Reset this camera's tracker for the new video loop.
        model.predictor = None

        ret, frame = cap.read()

        if not ret:
            return

    frame = cv2.resize(
        frame,
        (DISPLAY_WIDTH, DISPLAY_HEIGHT)
    )

    # ======================================
    # YOLO DETECTION AND TRACKING
    # ======================================

    results = model.track(
        source=frame,
        persist=True,
        classes=[0],
        conf=CONFIDENCE,
        iou=0.45,
        imgsz=IMAGE_SIZE,
        tracker="bytetrack.yaml",
        verbose=False
    )

    result = results[0]

    entry = 0
    waiting = 0
    exit_count = 0

    # ======================================
    # PROCESS DETECTED PEOPLE
    # ======================================

    if result.boxes is not None:

        for box in result.boxes:

            x1, y1, x2, y2 = (
                box.xyxy[0].cpu().tolist()
            )

            cx = int((x1 + x2) / 2)

            person_id = None

            if box.id is not None:
                person_id = int(box.id[0].item())

            # Classify the person's zone.
            if cx < ZONE1_X:
                zone = "ENTRY"
                entry += 1

            elif cx < ZONE2_X:
                zone = "WAITING"
                waiting += 1

            else:
                zone = "EXIT"
                exit_count += 1

            x1, y1, x2, y2 = map(
                int, (x1, y1, x2, y2)
            )

            # Draw the bounding box.
            cv2.rectangle(
                frame,
                (x1, y1),
                (x2, y2),
                (0, 255, 0),
                2
            )

            if person_id is not None:
                label = f"ID {person_id} | {zone}"
            else:
                label = zone

            cv2.putText(
                frame,
                label,
                (x1, max(y1 - 10, 20)),
                cv2.FONT_HERSHEY_SIMPLEX,
                0.5,
                (0, 255, 0),
                2
            )

    # ======================================
    # CROWD STATISTICS
    # ======================================

    total = entry + waiting + exit_count

    zones = {
        "ENTRY": entry,
        "WAITING": waiting,
        "EXIT": exit_count,
    }

    highest_zone = max(
        zones,
        key=zones.get
    )

    highest_zone_count = zones[highest_zone]

    density = round(
        (total / SAFE_CAPACITY) * 100,
        2
    )

    # ======================================
    # CROWD STATUS
    # ======================================

    if total > 30:
        status = "CRITICAL"

    elif total > 20:
        status = "HIGH"

    else:
        status = "NORMAL"

    if status == "CRITICAL":

        staff_action = (
            f"URGENT: Deploy staff to "
            f"{highest_zone} zone on Platform "
            f"{config['platform']}"
        )

    elif status == "HIGH":

        staff_action = (
            f"Deploy staff to "
            f"{highest_zone} zone on Platform "
            f"{config['platform']}"
        )

    else:
        staff_action = "Monitoring crowd"

    # ======================================
    # DISPLAY CAMERA INFORMATION
    # ======================================

    cv2.putText(
        frame,
        f"{camera_id} | Platform {config['platform']}",
        (20, 30),
        cv2.FONT_HERSHEY_SIMPLEX,
        0.75,
        (255, 255, 0),
        2
    )

    cv2.putText(
        frame,
        f"People: {total}",
        (20, 65),
        cv2.FONT_HERSHEY_SIMPLEX,
        0.7,
        (0, 255, 255),
        2
    )

    cv2.putText(
        frame,
        f"Entry: {entry} | Waiting: {waiting} | Exit: {exit_count}",
        (20, 100),
        cv2.FONT_HERSHEY_SIMPLEX,
        0.55,
        (255, 255, 255),
        2
    )

    status_color = (
        (0, 0, 255)
        if status != "NORMAL"
        else (0, 255, 0)
    )

    cv2.putText(
        frame,
        f"Status: {status}",
        (20, 135),
        cv2.FONT_HERSHEY_SIMPLEX,
        0.7,
        status_color,
        2
    )

    cv2.line(
        frame,
        (ZONE1_X, 0),
        (ZONE1_X, DISPLAY_HEIGHT),
        (255, 200, 0),
        2
    )

    cv2.line(
        frame,
        (ZONE2_X, 0),
        (ZONE2_X, DISPLAY_HEIGHT),
        (255, 200, 0),
        2
    )

    # ======================================
    # SEND THIS CAMERA'S CROWD DATA
    # ======================================

    if (
        current_time - state["last_api_update"]
        >= API_UPDATE_INTERVAL
    ):

        payload = {
            "camera_id": camera_id,
            "platform": config["platform"],
            "people": total,
            "entry": entry,
            "waiting": waiting,
            "exit": exit_count,
            "status": status,
            "highest_zone": highest_zone,
            "highest_zone_count": highest_zone_count,
            "density": density,
            "staff_action": staff_action,
        }

        try:
            response = state["session"].post(
                API_URL,
                json=payload,
                timeout=2
            )

            response.raise_for_status()

        except requests.RequestException as error:

            if (
                current_time - state["last_warning"] >= 5
            ):
                print(
                    f"{camera_id} backend error: {error}"
                )

                state["last_warning"] = current_time

        state["last_api_update"] = current_time

    # ======================================
    # SEND THIS CAMERA'S ANNOTATED FRAME
    # ======================================

    if (
        current_time - state["last_frame_update"]
        >= FRAME_UPDATE_INTERVAL
    ):

        try:
            success, buffer = cv2.imencode(
                ".jpg",
                frame
            )

            if success:
                response = state["session"].post(
                    VIDEO_API_URL,
                    data={
                        "camera_id": camera_id
                    },
                    files={
                        "frame": (
                            "frame.jpg",
                            buffer.tobytes(),
                            "image/jpeg"
                        )
                    },
                    timeout=2
                )

                response.raise_for_status()

        except requests.RequestException as error:

            if (
                current_time - state["last_warning"] >= 5
            ):
                print(
                    f"{camera_id} frame upload error: {error}"
                )

                state["last_warning"] = current_time

        state["last_frame_update"] = current_time

    # ======================================
    # DEBUG OUTPUT
    # ======================================

    if total != state["previous_people"]:

        print(
            f"{camera_id} | Platform {config['platform']} | "
            f"People: {total} | "
            f"Entry: {entry} | "
            f"Waiting: {waiting} | "
            f"Exit: {exit_count} | "
            f"Status: {status}"
        )

        state["previous_people"] = total

    # Display each camera in a separate window.
    cv2.imshow(
        f"RailGuard AI - {camera_id}",
        frame
    )


# ==========================================
# 6. RUN ALL CAMERAS
# ==========================================

try:

    while True:

        for camera_id, state in camera_states.items():
            process_camera(camera_id, state)

        # Press Q in any OpenCV window to stop.
        if cv2.waitKey(1) & 0xFF == ord("q"):
            break

finally:

    for state in camera_states.values():
        state["cap"].release()
        state["session"].close()

    cv2.destroyAllWindows()

    print("All camera detectors stopped.")
 