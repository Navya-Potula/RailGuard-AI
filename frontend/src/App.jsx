import { useEffect, useState, useRef } from "react";
import { motion } from "framer-motion";

import {
  LayoutDashboard,
  Video,
  BarChart3,
  AlertTriangle,
  ShieldCheck,
  Bell,
  Activity,
  Users,
  ArrowUpRight,
  TrainFront,
  Radio,
  Clock3,
  Zap,
} from "lucide-react";

import {
  ResponsiveContainer,
  AreaChart,
  Area,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
} from "recharts";

import "./App.css";

// ==========================================
// API CONFIGURATION
// ==========================================

const API_URL = "http://127.0.0.1:5000/api/crowd";
const BACKEND_URL = "http://127.0.0.1:5000";

const CAMERAS = [
  { id: "CAM-01", platform: 1, name: "Platform 1" },
  { id: "CAM-02", platform: 2, name: "Platform 2" },
  { id: "CAM-03", platform: 3, name: "Platform 3" },
];

const DEFAULT_DATA = {
  platform: 1,
  people: 0,
  density: 0,
  status: "NORMAL",
  entry: 0,
  waiting: 0,
  exit: 0,
  highest_zone: "WAITING",
  highest_zone_count: 0,
  staff_action: "Waiting for AI data",
};

// ==========================================
// MAIN APP
// ==========================================

function App() {
  const [selectedCamera] = useState("CAM-01");

  const [crowdData, setCrowdData] = useState(DEFAULT_DATA);

  const [cameraData, setCameraData] = useState({
    "CAM-01": { ...DEFAULT_DATA, platform: 1 },
    "CAM-02": { ...DEFAULT_DATA, platform: 2 },
    "CAM-03": { ...DEFAULT_DATA, platform: 3 },
  });

  const [history, setHistory] = useState([]);
  const [connected, setConnected] = useState(false);
  const [lastUpdated, setLastUpdated] = useState("--:--:--");

  const [notificationPermission, setNotificationPermission] =
    useState(
      "Notification" in window
        ? Notification.permission
        : "unsupported"
    );

  // Browser notifications can be turned on/off without affecting voice alerts.
  const [browserNotificationsOn, setBrowserNotificationsOn] = useState(true);
  const browserNotificationsOnRef = useRef(true);

  const previousStatuses = useRef({});
  const previousNotificationStatuses = useRef({});
  const lastCriticalAnnouncements = useRef({});

  const CRITICAL_REPEAT_INTERVAL = 20 * 1000;

  // ==========================================
  // FETCH ALL THREE CAMERAS + ALERTS
  // ==========================================

  useEffect(() => {
    let active = true;

    const fetchAllCameraData = async () => {
      const results = await Promise.allSettled(
        CAMERAS.map(async (camera) => {
          const response = await fetch(
            `${API_URL}?camera_id=${camera.id}`
          );

          if (!response.ok) {
            throw new Error(`Failed to fetch ${camera.id}`);
          }

          const data = await response.json();

          return {
            ...camera,
            data: {
              ...DEFAULT_DATA,
              ...data,
              platform: data.platform ?? camera.platform,
            },
          };
        })
      );

      if (!active) return;

      const successfulResults = results
        .filter((result) => result.status === "fulfilled")
        .map((result) => result.value);

      if (successfulResults.length === 0) {
        setConnected(false);
        return;
      }

      setConnected(successfulResults.length === CAMERAS.length);

      const updatedTime = new Date().toLocaleTimeString();
      setLastUpdated(updatedTime);

      setCameraData((previous) => {
        const updated = { ...previous };

        successfulResults.forEach((camera) => {
          updated[camera.id] = camera.data;
        });

        return updated;
      });

      // Use Platform 1 as the main dashboard summary.
      // The three camera cards below show each platform separately.
      const mainCamera =
        successfulResults.find(
          (camera) => camera.id === selectedCamera
        );

      if (mainCamera) {
  setCrowdData(mainCamera.data);
}

// Save crowd history for all three platforms
setHistory((previous) => {
  const lastUpdate = previous[previous.length - 1] || {};

  const latestData = {};

  successfulResults.forEach((camera) => {
    latestData[camera.id] = Number(camera.data.people) || 0;
  });

  return [
    ...previous,
    {
      time: updatedTime,

      platform1:
        latestData["CAM-01"] ?? lastUpdate.platform1 ?? 0,

      platform2:
        latestData["CAM-02"] ?? lastUpdate.platform2 ?? 0,

      platform3:
        latestData["CAM-03"] ?? lastUpdate.platform3 ?? 0,
    },
  ].slice(-20);
});
      // ==========================================
      // VOICE ALERTS + BROWSER NOTIFICATIONS
      // ==========================================

      successfulResults.forEach(({ id, data }) => {
        const currentStatus = String(
          data.status || "NORMAL"
        ).toUpperCase();

        const platform = data.platform;
        const zone = String(
          data.highest_zone || "WAITING"
        ).toUpperCase();

        const count =
          Number(data.highest_zone_count) || 0;

        const staffAction =
          data.staff_action ||
          `Deploy staff to ${zone} zone immediately`;

        const now = Date.now();

        const previousStatus =
          previousStatuses.current[id] || "NORMAL";

        const previousNotificationStatus =
          previousNotificationStatuses.current[id] ||
          "NORMAL";

        const isCritical = currentStatus === "CRITICAL";
        const isHigh = currentStatus === "HIGH";

        const enteredCritical =
          isCritical && previousStatus !== "CRITICAL";

        const repeatCritical =
          isCritical &&
          previousStatus === "CRITICAL" &&
          now -
            (lastCriticalAnnouncements.current[id] || 0) >=
            CRITICAL_REPEAT_INTERVAL;

        const enteredHigh =
          isHigh && previousStatus !== "HIGH";

        if (
          "speechSynthesis" in window &&
          (enteredCritical || repeatCritical || enteredHigh)
        ) {
          const message = isCritical
            ? `Emergency warning! Platform ${platform}. Critical crowd detected in the ${zone} zone. ${count} people detected in this zone. ${staffAction}. Please control passenger movement immediately.`
            : `Attention! Platform ${platform}. High crowd detected in the ${zone} zone. ${count} people detected in this zone. ${staffAction}.`;

          // Avoid interrupting a currently playing announcement.
          if (!window.speechSynthesis.speaking) {
            const speech = new SpeechSynthesisUtterance(message);
            speech.rate = 0.9;
            speech.pitch = 1;
            speech.volume = 1;
            window.speechSynthesis.speak(speech);
          }

          if (isCritical) {
            lastCriticalAnnouncements.current[id] = now;
          }
        }

        const enteredAlert =
          (isHigh || isCritical) &&
          previousNotificationStatus !== currentStatus;

        if (
          browserNotificationsOnRef.current &&
          enteredAlert &&
          "Notification" in window &&
          Notification.permission === "granted"
        ) {
          try {
            new Notification(
              `${currentStatus} Crowd Alert — Platform ${platform}`,
              {
                body: `${count} people in ${zone} zone. ${staffAction}`,
                icon: "/favicon.ico",
              }
            );
          } catch (error) {
            console.error("Notification error:", error);
          }
        }

        previousStatuses.current[id] = currentStatus;
        previousNotificationStatuses.current[id] =
          currentStatus;
      });
    };

    fetchAllCameraData();

    const interval = setInterval(fetchAllCameraData, 1000);

    return () => {
      active = false;
      clearInterval(interval);

      if ("speechSynthesis" in window) {
        window.speechSynthesis.cancel();
      }
    };
  }, [selectedCamera]);

  // ==========================================
  // BROWSER NOTIFICATION PERMISSION
  // ==========================================

  const requestNotificationPermission = async () => {
    if (!("Notification" in window)) {
      alert("Browser notifications are not supported.");
      setNotificationPermission("unsupported");
      return;
    }

    try {
      const permission =
        await Notification.requestPermission();

      setNotificationPermission(permission);

      if (permission === "granted") {
        new Notification("RailGuard AI", {
          body: "Browser notifications are enabled.",
        });
      } else if (permission === "denied") {
        alert(
          "Notifications are blocked. Enable them in your browser settings."
        );
      }
    } catch (error) {
      console.error("Notification permission error:", error);
    }
  };
  const toggleBrowserNotifications = async () => {
    if (browserNotificationsOnRef.current) {
      browserNotificationsOnRef.current = false;
      setBrowserNotificationsOn(false);
      return;
    }

    if (!("Notification" in window)) {
      alert("Browser notifications are not supported.");
      return;
    }

    let permission = Notification.permission;

    if (permission === "default") {
      permission = await Notification.requestPermission();
      setNotificationPermission(permission);
    }

    if (permission === "granted") {
      browserNotificationsOnRef.current = true;
      setBrowserNotificationsOn(true);
    } else {
      alert("Please allow notifications in your browser settings.");
    }
  };
  // ==========================================
  // MAIN DASHBOARD VALUES — PLATFORM 1
  
// ==========================================
// COMBINED DASHBOARD VALUES — ALL 3 PLATFORMS
// ==========================================

const allPlatformData = CAMERAS.map((camera) => ({
  ...camera,
  data: cameraData[camera.id] || {
    ...DEFAULT_DATA,
    platform: camera.platform,
  },
}));

// Total people detected across all platforms
const onlinePlatformData = allPlatformData.filter(
  (camera) => camera.data.camera_online === true
);

const people = onlinePlatformData.reduce(
  (total, camera) =>
    total + (Number(camera.data.people) || 0),
  0
);

const density =
  onlinePlatformData.length > 0
    ? onlinePlatformData.reduce(
        (total, camera) =>
          total + (Number(camera.data.density) || 0),
        0
      ) / onlinePlatformData.length
    : 0;

// Risk ranking: CRITICAL is more serious than HIGH
const riskRank = {
  NORMAL: 0,
  HIGH: 1,
  CRITICAL: 2,
};

const getRisk = (camera) =>
  String(camera?.data?.status || "NORMAL").toUpperCase();

// Platform with the highest risk (used for the safety recommendation)
const highestRiskCamera = [...allPlatformData]
  .filter((camera) => camera.data.camera_online !== false)
  .sort((a, b) => {
    const riskDifference =
      (riskRank[getRisk(b)] ?? 0) -
      (riskRank[getRisk(a)] ?? 0);

    if (riskDifference !== 0) {
      return riskDifference;
    }

    return (
      (Number(b.data.people) || 0) -
      (Number(a.data.people) || 0)
    );
  })[0] || allPlatformData[0];

const status = getRisk(highestRiskCamera);

// Platform with the largest total people count
const busiestPlatform = [...allPlatformData].sort(
  (a, b) =>
    (Number(b.data.people) || 0) -
    (Number(a.data.people) || 0)
)[0];

const platform = busiestPlatform?.platform ?? 1;

// Platform reporting the largest crowd count in its highest-priority zone.
// This may be different from the platform with the largest total count.
const priorityCamera = [...allPlatformData].sort(
  (a, b) =>
    (Number(b.data.highest_zone_count) || 0) -
    (Number(a.data.highest_zone_count) || 0)
)[0];

const priorityPlatform = priorityCamera?.platform ?? 1;

const priorityZone = String(
  priorityCamera?.data?.highest_zone || "WAITING"
).toUpperCase();

const priorityCount =
  Number(priorityCamera?.data?.highest_zone_count) || 0;

// Keep Platform 1's zone highlight aligned with its own zone data.
const platform1PriorityZone = String(
  cameraData["CAM-01"]?.highest_zone || "WAITING"
).toUpperCase();

const statusClass =
  status === "CRITICAL"
    ? "critical"
    : status === "HIGH"
    ? "high"
    : "normal";

  // ==========================================
  // ZONE CONFIGURATION
  // ==========================================

  const zones = [
    {
      name: "Entry Zone",
      key: "entry",
      color: "cyan",
      description: "Passenger entrance",
      icon: ArrowUpRight,
    },
    {
      name: "Waiting Zone",
      key: "waiting",
      color: "purple",
      description: "Passenger waiting area",
      icon: Users,
    },
    {
      name: "Exit Zone",
      key: "exit",
      color: "orange",
      description: "Passenger exit",
      icon: TrainFront,
    },
  ];


  // ==========================================
// COMBINED ZONE ANALYSIS — ALL 3 PLATFORMS
// ==========================================

const zoneTotals = zones.map((zone) => {
  const totalCount = allPlatformData.reduce(
    (sum, camera) =>
      sum + (Number(camera.data[zone.key]) || 0),
    0
  );

  // Find which platform has the most people in this zone
  const busiestCameraForZone = [...allPlatformData].sort(
    (a, b) =>
      (Number(b.data[zone.key]) || 0) -
      (Number(a.data[zone.key]) || 0)
  )[0];

  return {
    ...zone,
    totalCount,
    busiestPlatform: busiestCameraForZone?.platform ?? 1,
    busiestPlatformCount:
      Number(busiestCameraForZone?.data?.[zone.key]) || 0,
  };
});

const highestCombinedZone = [...zoneTotals].sort(
  (a, b) => b.totalCount - a.totalCount
)[0];

const totalZonePeople = zoneTotals.reduce(
  (sum, zone) => sum + zone.totalCount,
  0
);
  // ==========================================
  // MANUAL VOICE TEST
  // ==========================================

  const testVoiceAlert = () => {
    if (!("speechSynthesis" in window)) {
      alert("Voice announcements are not supported.");
      return;
    }

    const message =
      `Test announcement. Platform ${priorityPlatform}. ` +
      `${getRisk(priorityCamera)} crowd status. ` +
      `${priorityCount} people detected in the ${priorityZone} zone. ` +
      `Please send staff to the ${priorityZone} zone.`;

    window.speechSynthesis.cancel();

    const speech = new SpeechSynthesisUtterance(message);
    speech.rate = 0.9;
    speech.pitch = 1;
    speech.volume = 1;

    window.speechSynthesis.speak(speech);
  };

  // ==========================================
  // DASHBOARD UI
  // ==========================================

  return (
    <div className="railguard-app">
      {/* SIDEBAR */}

      <aside className="sidebar">
        <div className="brand">
          <div className="brand-icon">
            <ShieldCheck size={27} />
          </div>

          <div>
            <h2>
              RailGuard<span> AI</span>
            </h2>
            <p>SMART CROWD SAFETY</p>
          </div>
        </div>

        <div className="nav-label">MAIN MENU</div>

        <nav className="sidebar-nav">
          <a className="nav-item active" href="#dashboard">
            <LayoutDashboard size={19} />
            <span>Dashboard</span>
          </a>

          <a className="nav-item" href="#monitoring">
            <Video size={19} />
            <span>Live Monitoring</span>
          </a>

          <a className="nav-item" href="#analytics">
            <BarChart3 size={19} />
            <span>Analytics</span>
          </a>

          <a className="nav-item" href="#alerts">
            <AlertTriangle size={19} />
            <span>Alerts</span>

            {status !== "NORMAL" && (
              <span className="nav-alert-dot" />
            )}
          </a>
        </nav>

        <div className="sidebar-bottom">
          <div className="sidebar-status">
            <div
              className={`connection-dot ${
                connected ? "online" : ""
              }`}
            />

            <div>
              <strong>
                {connected ? "System Online" : "Connecting..."}
              </strong>

              <p>
                {connected
                  ? "Backend connected"
                  : "Waiting for backend"}
              </p>
            </div>
          </div>

          <div className="sidebar-footer">
            <ShieldCheck size={15} />
            AI-POWERED RAILWAY SAFETY
          </div>
        </div>
      </aside>

      {/* MAIN CONTENT */}

      <main className="main-content" id="dashboard">
        {/* TOPBAR */}

        <header className="topbar">
          <div>
            <div className="breadcrumb">
              RailGuard / Dashboard
            </div>

            <h1>Control Center</h1>

            <p className="page-subtitle">
              Real-time railway platform crowd monitoring
            </p>
          </div>

          <div className="topbar-right">
            <div className="live-indicator">
              <span
                className={`live-dot ${
                  connected ? "" : "offline"
                }`}
              />

              {connected ? "LIVE SYSTEM" : "OFFLINE"}
            </div>

            <button
              className="icon-button"
              aria-label="Alerts"
              onClick={() =>
                document
                  .getElementById("alerts")
                  ?.scrollIntoView({ behavior: "smooth" })
              }
            >
              <Bell size={19} />

              {status !== "NORMAL" && (
                <span className="bell-dot" />
              )}
            </button>

            
          </div>
        </header>

        {/* WELCOME BANNER */}

        <section className="welcome-banner">
          <div className="welcome-content">
            <div className="eyebrow">
              <Activity size={15} />
              INTELLIGENT CROWD SURVEILLANCE
            </div>

            <h2>
              Every Passenger. <span>Every Second.</span>
            </h2>

            <p>
              AI-powered crowd detection for safer railway
              platforms. Monitor passenger movement and
              identify crowd risks instantly.
            </p>

            <div className="welcome-meta">
              <span>
                <Radio size={15} />
                All 3 Platforms Monitoring
              </span>

              <span>
                <Clock3 size={15} />
                Updated {lastUpdated}
              </span>
            </div>
          </div>

          <div className="welcome-visual">
            <div className="visual-ring ring-one" />
            <div className="visual-ring ring-two" />

            <div className="visual-shield">
              <ShieldCheck size={57} strokeWidth={1.5} />
            </div>

            <div className="visual-tag">
              <span
                className={`live-dot ${
                  connected ? "" : "offline"
                }`}
              />
              AI DETECTION
            </div>
          </div>
        </section>

        {/* STATISTICS CARDS */}

        <section className="stats-grid">
  {/* 1. TOTAL CROWD ACROSS ALL PLATFORMS */}
  <motion.div
    className="stat-card"
    initial={{ opacity: 0, y: 12 }}
    animate={{ opacity: 1, y: 0 }}
  >
    <div className="stat-top">
      <div className="stat-icon cyan-bg">
        <Users size={21} />
      </div>
      <span className="stat-label">TOTAL LIVE CROWD</span>
    </div>

    <h2>{people}</h2>

    <p>Total people detected across all platforms</p>

    <div className="stat-bottom">
      <span className="mini-dot cyan-dot" />
      Live AI person detection
    </div>
  </motion.div>

  {/* 2. AVERAGE CROWD DENSITY */}
  <motion.div
    className="stat-card"
    initial={{ opacity: 0, y: 12 }}
    animate={{ opacity: 1, y: 0 }}
    transition={{ delay: 0.08 }}
  >
    <div className="stat-top">
      <div className="stat-icon purple-bg">
        <Activity size={21} />
      </div>
      <span className="stat-label">AVERAGE PLATFORM LOAD</span>
    </div>

    <h2>
      {Number(density).toFixed(1)}
      <small>%</small>
    </h2>

    <div className="density-track">
      <div
        className={`density-fill ${statusClass}`}
        style={{
          width: `${Math.min(100, Math.max(0, Number(density) || 0))}%`,
        }}
      />
    </div>

    <p>Average crowd density across 3 platforms</p>

    <div className="stat-bottom">
      <span className="mini-dot" />
      Combined platform monitoring
    </div>
  </motion.div>

  {/* 3. HIGHEST RISK ACROSS ALL PLATFORMS */}
  <motion.div
    className="stat-card"
    initial={{ opacity: 0, y: 12 }}
    animate={{ opacity: 1, y: 0 }}
    transition={{ delay: 0.16 }}
  >
    <div className="stat-top">
      <div className="stat-icon orange-bg">
        <AlertTriangle size={21} />
      </div>
      <span className="stat-label">OVERALL RISK STATUS</span>
    </div>

    <div className={`status-pill ${statusClass}`}>
      <span className="status-dot" />
      {status}
    </div>

    <p className="stat-description">
      {status === "CRITICAL"
        ? "Critical crowd risk detected across monitored platforms"
        : status === "HIGH"
        ? "High crowd level detected on a monitored platform"
        : "All monitored platforms are within normal crowd levels"}
    </p>

    <div className="stat-bottom">
      <span className="mini-dot" />
      Based on the highest platform risk
    </div>
  </motion.div>

  {/* 4. BUSIEST PLATFORM AND ITS CROWDED ZONE */}
  <motion.div
    className="stat-card"
    initial={{ opacity: 0, y: 12 }}
    animate={{ opacity: 1, y: 0 }}
    transition={{ delay: 0.24 }}
  >
    <div className="stat-top">
      <div className="stat-icon green-bg">
        <Zap size={21} />
      </div>
      <span className="stat-label">BUSIEST PLATFORM ZONE</span>
    </div>

    <h2 className="priority-name">
      {priorityZone || "WAITING"}
    </h2>

    <p>
      Platform {priorityPlatform} · {priorityCount} people detected
    </p>

    <div className="stat-bottom">
      <span className="mini-dot green-dot" />
      Zone with the highest detected crowd
    </div>
  </motion.div>
</section>

        {/* CROWD ACTIVITY CHART */}

        
{/* ========================================== */}
{/* CROWD ACTIVITY + PLATFORM OVERVIEW */}
{/* ========================================== */}

<section
  className="content-grid"
  style={{
    display: "grid",
    gridTemplateColumns: "1.4fr 1fr",
    gap: "20px",
    alignItems: "stretch",
  }}
>
  {/* ========================================== */}
  {/* CROWD ACTIVITY CHART */}
  {/* ========================================== */}

  <div
    className="panel history-panel"
    id="analytics"
  >
    <div className="panel-heading">
      <div>
        <h3>Crowd Activity</h3>

        <p>
           Live passenger count across all three platforms
        </p>
      </div>

      <div className="chart-live">
        <span className="live-dot" />
        LIVE
      </div>
    </div>

    <div
      className="chart-container"
      style={{
        minHeight: "320px",
      }}
    >
      {history.length > 0 ? (
        <ResponsiveContainer width="100%" height="100%">
          <AreaChart data={history}>
  <defs>
    <linearGradient
      id="platform1Gradient"
      x1="0"
      y1="0"
      x2="0"
      y2="1"
    >
      <stop
        offset="0%"
        stopColor="#22d3ee"
        stopOpacity={0.3}
      />
      <stop
        offset="95%"
        stopColor="#22d3ee"
        stopOpacity={0}
      />
    </linearGradient>

    <linearGradient
      id="platform2Gradient"
      x1="0"
      y1="0"
      x2="0"
      y2="1"
    >
      <stop
        offset="0%"
        stopColor="#a78bfa"
        stopOpacity={0.25}
      />
      <stop
        offset="95%"
        stopColor="#a78bfa"
        stopOpacity={0}
      />
    </linearGradient>

    <linearGradient
      id="platform3Gradient"
      x1="0"
      y1="0"
      x2="0"
      y2="1"
    >
      <stop
        offset="0%"
        stopColor="#34d399"
        stopOpacity={0.25}
      />
      <stop
        offset="95%"
        stopColor="#34d399"
        stopOpacity={0}
      />
    </linearGradient>
  </defs>

  <CartesianGrid
    stroke="#243344"
    strokeDasharray="4 4"
    vertical={false}
  />

  <XAxis
    dataKey="time"
    stroke="#718096"
    tick={{ fontSize: 10 }}
    tickLine={false}
    axisLine={false}
    minTickGap={35}
  />

  <YAxis
    stroke="#718096"
    tick={{ fontSize: 11 }}
    tickLine={false}
    axisLine={false}
    allowDecimals={false}
    width={32}
  />

  <Tooltip
    contentStyle={{
      background: "#111d2b",
      border: "1px solid #2a4054",
      borderRadius: "10px",
      color: "#ffffff",
    }}
    labelStyle={{
      color: "#94a3b8",
    }}
  />

  {/* Platform 1 */}
  <Area
    type="monotone"
    dataKey="platform1"
    name="Platform 1"
    stroke="#22d3ee"
    strokeWidth={2.5}
    fill="url(#platform1Gradient)"
    connectNulls
    activeDot={{ r: 5 }}
  />

  {/* Platform 2 */}
  <Area
    type="monotone"
    dataKey="platform2"
    name="Platform 2"
    stroke="#a78bfa"
    strokeWidth={2.5}
    fill="url(#platform2Gradient)"
    connectNulls
    activeDot={{ r: 5 }}
  />

  {/* Platform 3 */}
  <Area
    type="monotone"
    dataKey="platform3"
    name="Platform 3"
    stroke="#34d399"
    strokeWidth={2.5}
    fill="url(#platform3Gradient)"
    connectNulls
    activeDot={{ r: 5 }}
  />
</AreaChart>
        </ResponsiveContainer>
      ) : (
        <div className="chart-empty">
          <Activity size={28} />
          <p>Waiting for crowd data...</p>
        </div>
      )}
    </div>

    <div className="chart-footer">
  <span>
    <span
      className="legend-dot"
      style={{ background: "#22d3ee" }}
    />
    Platform 1
  </span>

  <span>
    <span
      className="legend-dot"
      style={{ background: "#a78bfa" }}
    />
    Platform 2
  </span>

  <span>
    <span
      className="legend-dot"
      style={{ background: "#34d399" }}
    />
    Platform 3
  </span>

  <span>{history.length} recent updates</span>
</div>
  </div>

  {/* ========================================== */}
  {/* PLATFORM OVERVIEW */}
  {/* ========================================== */}

  <div
    className="panel"
    style={{
      padding: "20px",
    }}
  >
    <div className="panel-heading">
      <div>
        <h3>Platform Overview</h3>

        <p>
          Live status across all platforms
        </p>
      </div>

      <TrainFront
        size={21}
        className="panel-heading-icon"
      />
    </div>

    <div
      style={{
        display: "flex",
        flexDirection: "column",
        gap: "14px",
        marginTop: "20px",
      }}
    >
      {CAMERAS.map((camera) => {
        const data =
          cameraData[camera.id] || {
            ...DEFAULT_DATA,
            platform: camera.platform,
          };

        const platformStatus = String(
          data.status || "NORMAL"
        ).toUpperCase();

        const platformStatusClass =
          platformStatus === "CRITICAL"
            ? "critical"
            : platformStatus === "HIGH"
            ? "high"
            : "normal";

        const platformPeople =
          Number(data.people) || 0;

        const platformDensity = Math.max(
          0,
          Math.min(
            100,
            Number(data.density) || 0
          )
        );

        return (
          <div
            key={camera.id}
            style={{
              padding: "15px",
              border: "1px solid #26384a",
              borderRadius: "12px",
              background: "#0b1522",
            }}
          >
            {/* PLATFORM NAME */}

            <div
              style={{
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
                marginBottom: "12px",
              }}
            >
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: "10px",
                }}
              >
                <div
                  style={{
                    width: "34px",
                    height: "34px",
                    borderRadius: "9px",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    background:
                      "rgba(34,211,238,0.10)",
                    color: "#22d3ee",
                  }}
                >
                  <TrainFront size={18} />
                </div>

                <div>
                  <strong
                    style={{
                      display: "block",
                      color: "#ffffff",
                      fontSize: "14px",
                    }}
                  >
                    Platform {camera.platform}
                  </strong>

                  <span
                    style={{
                      color: "#718096",
                      fontSize: "11px",
                    }}
                  >
                    {camera.id}
                  </span>
                </div>
              </div>

              <span
                className={`status-pill ${platformStatusClass}`}
                style={{
                  fontSize: "10px",
                  padding: "5px 8px",
                }}
              >
                <span className="status-dot" />
                {platformStatus}
              </span>
            </div>

            {/* COUNT + DENSITY */}

            <div
              style={{
                display: "flex",
                justifyContent: "space-between",
                alignItems: "flex-end",
                marginBottom: "8px",
              }}
            >
              <div>
                <span
                  style={{
                    color: "#718096",
                    fontSize: "11px",
                  }}
                >
                  LIVE CROWD
                </span>

                <strong
                  style={{
                    display: "block",
                    color: "#ffffff",
                    fontSize: "24px",
                    marginTop: "2px",
                  }}
                >
                  {platformPeople}
                </strong>
              </div>

              <div
                style={{
                  textAlign: "right",
                }}
              >
                <span
                  style={{
                    color: "#718096",
                    fontSize: "11px",
                  }}
                >
                  LOAD
                </span>

                <strong
                  style={{
                    display: "block",
                    color: "#22d3ee",
                    fontSize: "15px",
                  }}
                >
                  {platformDensity.toFixed(0)}%
                </strong>
              </div>
            </div>

            {/* DENSITY BAR */}

            <div
              style={{
                height: "5px",
                width: "100%",
                background: "#1e293b",
                borderRadius: "10px",
                overflow: "hidden",
              }}
            >
              <div
                style={{
                  height: "100%",
                  width: `${platformDensity}%`,
                  background:
                    platformStatus === "CRITICAL"
                      ? "#ef4444"
                      : platformStatus === "HIGH"
                      ? "#f59e0b"
                      : "#22d3ee",
                  borderRadius: "10px",
                  transition: "width 0.4s ease",
                }}
              />
            </div>

            {/* ZONE */}

            <div
              style={{
                display: "flex",
                justifyContent: "space-between",
                marginTop: "10px",
                fontSize: "11px",
              }}
            >
              <span
                style={{
                  color: "#718096",
                }}
              >
                Priority zone
              </span>

              <strong
                style={{
                  color: "#cbd5e1",
                }}
              >
                {data.highest_zone || "WAITING"}
              </strong>
            </div>
          </div>
        );
      })}
    </div>
  </div>
</section>


        {/* ========================================== */}
        {/* THREE PLATFORM LIVE CCTV MONITORING */}
        {/* ========================================== */}

        <section
          className="panel"
          id="monitoring"
          style={{
            marginTop: "24px",
            marginBottom: "24px",
            padding: "20px",
            width: "100%",
            boxSizing: "border-box",
          }}
        >
          <div className="panel-heading" style={{ marginBottom: "20px" }}>
            <div>
              <h3>Live Platform Monitoring</h3>
              <p>
                Monitor all three railway platforms simultaneously
              </p>
            </div>

            <Video size={22} className="panel-heading-icon" />
          </div>

          <div
            className="three-camera-grid"
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(3, minmax(0, 1fr))",
              gap: "16px",
              width: "100%",
            }}
          >
            {CAMERAS.map((camera) => {
              const data =
                cameraData[camera.id] || {
                  ...DEFAULT_DATA,
                  platform: camera.platform,
                };

              const cameraStatus = String(
                data.status || "NORMAL"
              ).toUpperCase();

              const cameraStatusClass =
                cameraStatus === "CRITICAL"
                  ? "critical"
                  : cameraStatus === "HIGH"
                  ? "high"
                  : "normal";

              return (
                <div
                  key={camera.id}
                  className="platform-camera-card"
                  style={{
                    minWidth: 0,
                    overflow: "hidden",
                    border: "1px solid #2a4054",
                    borderRadius: "12px",
                    background: "#0b1522",
                  }}
                >
                 {/* DYNAMIC CAMERA CONNECTION STATUS */}
{(() => {
  const cameraOnline = data.camera_online === true;
  const frameOnline = data.frame_online === true;
  const isLive = cameraOnline && frameOnline;

  return (
    <span
      style={{
        display: "flex",
        alignItems: "center",
        gap: "5px",
        color: isLive ? "#4ade80" : "#ef4444",
        fontSize: "11px",
        whiteSpace: "nowrap",
      }}
    >
      <span
        style={{
          width: "7px",
          height: "7px",
          borderRadius: "50%",
          background: isLive ? "#4ade80" : "#ef4444",
          display: "inline-block",
        }}
      />
      {isLive ? "LIVE" : !cameraOnline ? "OFFLINE" : "NO VIDEO"}
    </span>
  );
})()}
                  {/* CCTV VIDEO */}

                  <div
                    style={{
                      width: "100%",
                      aspectRatio: "16 / 9",
                      background: "#03070c",
                      position: "relative",
                    }}
                  >
                    <img
  key={camera.id}
  src={`${BACKEND_URL}/video_feed?camera_id=${camera.id}`}
  alt={`Platform ${camera.platform} live CCTV`}
  loading="eager"
  onError={(e) => {
    console.error(
      `Platform ${camera.platform} video failed:`,
      e.currentTarget.src
    );
  }}
  style={{
    width: "100%",
    height: "100%",
    objectFit: "contain",
    display: "block",
  }}

                    />
                  </div>

                  {/* CAMERA LIVE STATISTICS */}

                  <div style={{ padding: "12px" }}>
                    <div
                      style={{
                        display: "flex",
                        justifyContent: "space-between",
                        alignItems: "center",
                        marginBottom: "10px",
                        gap: "8px",
                      }}
                    >
                      <span
                        style={{
                          color: "#94a3b8",
                          fontSize: "12px",
                        }}
                      >
                        People detected
                      </span>

                      <strong
                        style={{
                          color: "#ffffff",
                          fontSize: "20px",
                        }}
                      >
                        {Number(data.people) || 0}
                      </strong>
                    </div>

                    <div
                      style={{
                        display: "flex",
                        justifyContent: "space-between",
                        alignItems: "center",
                        gap: "8px",
                        flexWrap: "wrap",
                      }}
                    >
                      <span
                        style={{
                          color: "#94a3b8",
                          fontSize: "12px",
                        }}
                      >
                        Crowd status
                      </span>

                      <span
                        className={`status-pill ${cameraStatusClass}`}
                        style={{
                          fontSize: "11px",
                          padding: "5px 8px",
                        }}
                      >
                        <span className="status-dot" />
                        {cameraStatus}
                      </span>
                    </div>

                    <div
                      style={{
                        marginTop: "10px",
                        color: "#94a3b8",
                        fontSize: "12px",
                      }}
                    >
                      Priority zone:{" "}
                      <strong style={{ color: "#e2e8f0" }}>
                        {data.highest_zone || "WAITING"}
                      </strong>
                    </div>

                    <div
                      style={{
                        marginTop: "8px",
                        height: "5px",
                        borderRadius: "10px",
                        background: "#1e293b",
                        overflow: "hidden",
                      }}
                    >
                      <div
                        style={{
                          height: "100%",
                          width: `${Math.max(
                            0,
                            Math.min(
                              100,
                              Number(data.density) || 0
                            )
                          )}%`,
                          background:
                            cameraStatus === "CRITICAL"
                              ? "#ef4444"
                              : cameraStatus === "HIGH"
                              ? "#f59e0b"
                              : "#22d3ee",
                          transition: "width 0.4s ease",
                        }}
                      />
                    </div>

                    <p
                      style={{
                        color: "#94a3b8",
                        fontSize: "11px",
                        marginTop: "8px",
                        marginBottom: 0,
                      }}
                    >
                      AI crowd detection active
                    </p>
                  </div>
                </div>
              );
            })}
          </div>
        </section>

        {/* ZONES + SAFETY RECOMMENDATIONS */}

        <section className="bottom-grid">
          {/* ZONE ANALYSIS */}

          <div className="panel zones-panel">
            <div className="panel-heading">
              <div>
                <h3>Platform Zone Analysis</h3>
                <p>
  Combined passenger distribution across all 3 platforms
</p>
              </div>

              <span className="section-count">03 ZONES</span>
            </div>

            <div className="zones-list">
  {zoneTotals.map((zone) => {
    const Icon = zone.icon;

    const percent =
      totalZonePeople > 0
        ? (zone.totalCount / totalZonePeople) * 100
        : 0;

    const isPriority =
      highestCombinedZone?.key === zone.key;

    return (
      <div
        className={`zone-row ${
          isPriority ? "priority-zone-row" : ""
        }`}
        key={zone.key}
      >
        <div className={`zone-icon ${zone.color}`}>
          <Icon size={19} />
        </div>

        <div className="zone-info">
          <div className="zone-title-row">
            <strong>{zone.name}</strong>

            <span>{zone.totalCount} people</span>
          </div>

          <div className="zone-track">
            <div
              className={`zone-fill ${zone.color}`}
              style={{
                width: `${percent}%`,
                transition: "width 0.4s ease",
              }}
            />
          </div>

          <p>{zone.description}</p>

          <p
            style={{
              fontSize: "11px",
              color: "#94a3b8",
              marginTop: "5px",
            }}
          >
            Most on Platform {zone.busiestPlatform}:{" "}
            {zone.busiestPlatformCount} people
          </p>

          {isPriority && (
            <span className="zone-priority-label">
              <AlertTriangle size={12} />
              HIGHEST CROWD ZONE
            </span>
          )}
        </div>
      </div>
    );
  })}
</div>
          </div>

          {/* SAFETY RECOMMENDATIONS */}

          <div className="panel action-panel" id="alerts">
            <div className="panel-heading">
              <div>
                <h3>Safety Recommendations</h3>
                <p>AI recommendation for Platform {highestRiskCamera?.platform ?? 1}</p>
              </div>

              <div className={`action-icon ${statusClass}`}>
                <ShieldCheck size={21} />
              </div>
            </div>

            <div className={`alert-banner ${statusClass}`}>
              <AlertTriangle size={19} />

              <div>
                <strong>
                  {status === "CRITICAL"
                    ? "Critical Crowd Alert"
                    : status === "HIGH"
                    ? "High Crowd Alert"
                    : "Platform Operating Normally"}
                </strong>

                <p>
                  {status === "CRITICAL"
                    ? "Immediate staff intervention is recommended."
                    : status === "HIGH"
                    ? "Monitor passenger movement and prepare staff."
                    : "No elevated crowd risk reported by the AI."}
                </p>
              </div>
            </div>

            <div className="recommendation">
              <span className="recommendation-label">
                RECOMMENDED ACTION
              </span>

              <p>
                {highestRiskCamera?.data?.staff_action ||
                  "Continue monitoring and follow station safety procedures."}
              </p>

              <div className="recommendation-zone">
                <Radio size={15} />
                Focus zone:
                <strong>
                  {String(
                    highestRiskCamera?.data?.highest_zone || "WAITING"
                  ).toUpperCase()}
                </strong>
              </div>
            </div>

            <button
              type="button"
              className="voice-test-button"
              onClick={toggleBrowserNotifications}
              style={{ marginBottom: "10px" }}
            >
              <Bell size={17} />
              {browserNotificationsOn
                ? "Turn Browser Notifications OFF"
                : "Turn Browser Notifications ON"}
            </button>

            <button
              type="button"
              className="voice-test-button"
              onClick={testVoiceAlert}
              style={{ marginBottom: "10px" }}
            >
              <Bell size={17} />
              Test Voice Announcement
            </button>
            <div className="alert-footer">
              <span className="mini-dot green-dot" />

              <span>Last checked: {lastUpdated}</span>
            </div>
          </div>
        </section>

        {/* FOOTER */}

        <footer className="dashboard-footer">
          <div>
            <ShieldCheck size={16} />
            <span>RailGuard AI</span>
            <span className="footer-divider">·</span>
            Intelligent Railway Safety System
          </div>

          <span>Real-time Crowd Monitoring Dashboard</span>
        </footer>
      </main>
    </div>
  );
}

export default App;
 