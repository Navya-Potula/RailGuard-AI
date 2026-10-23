# 🚆 RailGuard AI
### AI-Based Smart Railway Platform Crowd Management System

## 📌 About the Project

I developed **RailGuard AI** to monitor railway platform crowds using Artificial Intelligence and Computer Vision. The system detects people in video feeds and displays crowd information through an interactive dashboard.

It provides **zone-wise crowd monitoring**, crowd density status, and voice alerts to help identify crowded areas and support timely staff response.

## ✨ Features

- **AI-Based People Detection** – Detects people in video frames using YOLO.
- **Zone-Wise Crowd Monitoring** – Monitors crowd distribution across Entry, Waiting, and Exit zones.
- **Live Crowd Dashboard** – Displays platform crowd information and monitoring status.
- **Crowd Density Monitoring** – Displays crowd density and status based on the detection data.
- **Voice Alerts** – Announces high crowd levels and provides staff response messages.
- **Browser Notifications** – Provides crowd alerts through browser notifications.
- **Crowd Statistics** – Displays crowd information and monitoring trends through dashboard charts.

## 🛠️ Technologies Used

### Frontend
- HTML5
- CSS3
- JavaScript
- React.js
- Vite
- Recharts
- Framer Motion
- Lucide React

### Backend
- Python
- Flask
- Flask-CORS

### AI and Computer Vision
- YOLO
- OpenCV
- Requests

## 📁 Project Structure

```text
Smart-Crowd-Management/
│
├── ai/
│   └── crowd_detector.py
│
├── backend/
│   └── server.py
│
├── frontend/
│   ├── public/
│   ├── src/
│   │   ├── App.jsx
│   │   ├── App.css
│   │   ├── index.css
│   │   └── main.jsx
│   ├── package.json
│   └── vite.config.js
│
├── .gitignore
└── README.md
```

## ⚙️ How to Run the Project

### 1. Clone the Repository

```bash
git clone https://github.com/Navya-Potula/RailGuard-AI.git
cd RailGuard-AI
```

### 2. Set Up the Python Environment

```bash
python -m venv venv
```

Activate the environment in Windows PowerShell:

```powershell
.\venv\Scripts\Activate.ps1
```

Install the required packages:

```bash
pip install flask flask-cors ultralytics opencv-python requests
```

### 3. Configure the AI Model and Video

The YOLO model weights and video files are not included in the repository.

Place the required model and video files in the locations configured in `ai/crowd_detector.py`.

### 4. Start the Backend

From the project root, run:

```bash
python backend/server.py
```

### 5. Start the AI Detector

Open another terminal, activate the Python environment, and run:

```bash
python ai/crowd_detector.py
```

### 6. Start the Frontend

Open another terminal and run:

```bash
cd frontend
npm install
npm run dev
```

Open the local URL displayed by Vite in your browser.

## 👩‍💻 Developed By

**Navya Potula**  
B.Tech – Computer Science and Engineering
