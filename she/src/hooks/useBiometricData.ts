import { useState, useEffect, useCallback, useRef } from "react";
import type { LogEntry } from "@/components/SecurityLog";
import { getAuth } from "@/lib/auth";

const timestamp = () => new Date().toLocaleTimeString("en-US", { hour12: false });

const INITIAL_LOGS: LogEntry[] = [
  { timestamp: "08:00:01", level: "INFO", message: "Session initialized. Master biometric profile loaded." },
  { timestamp: "08:00:03", level: "INFO", message: "User behavior matching Master Profile (Confidence: 98%)" },
  { timestamp: "08:00:12", level: "INFO", message: "Keystroke dynamics within normal parameters." },
];

/** Lock when score exceeds this (strict vs relaxed). Aligned with gauge “Critical” ~70+. */
const THRESHOLD_STRICT = 76;
const THRESHOLD_RELAXED = 88;

export function useBiometricData() {
  const [dwellTime, setDwellTime] = useState(142);
  const [mouseVelocity, setMouseVelocity] = useState(0);
  const [anomalyScore, setAnomalyScore] = useState(8);
  const [isIntruder, setIsIntruder] = useState(false);
  const [dwellHistory, setDwellHistory] = useState<number[]>(() => Array(20).fill(142));
  const [velocityHistory, setVelocityHistory] = useState<number[]>(() => Array(20).fill(0));
  const [externalMode, setExternalMode] = useState(false);
  const [logs, setLogs] = useState<LogEntry[]>(INITIAL_LOGS);
  const [confidenceScore, setConfidenceScore] = useState(100);
  const [strictMode, setStrictMode] = useState(true);
  const [lockdown, setLockdown] = useState(false);
  const [far] = useState(0.41);
  const [frr] = useState(4.02);

  const metricsForAuditRef = useRef({ dwell: 142, velocity: 0, anomaly: 8 });
  const externalModeRef = useRef(false);
  const strictModeRef = useRef(true);

  useEffect(() => {
    externalModeRef.current = externalMode;
  }, [externalMode]);

  useEffect(() => {
    strictModeRef.current = strictMode;
  }, [strictMode]);

  useEffect(() => {
    metricsForAuditRef.current = {
      dwell: dwellTime,
      velocity: mouseVelocity,
      anomaly: anomalyScore,
    };
  }, [dwellTime, mouseVelocity, anomalyScore]);

  /** Push operator telemetry to the server for supervisor review (dwell, velocity, anomaly). */
  useEffect(() => {
    const send = async () => {
      const auth = getAuth();
      if (!auth?.token) return;
      const { dwell, velocity, anomaly } = metricsForAuditRef.current;
      const entry = `telemetry dwell_ms=${Math.round(dwell)} velocity_px_s=${Math.round(velocity)} anomaly_pct=${Math.round(anomaly)}`;
      try {
        await fetch("/api/audit/append", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${auth.token}`,
          },
          body: JSON.stringify({ entry }),
        });
      } catch {
        /* offline or server down */
      }
    };
    void send();
    const id = window.setInterval(() => void send(), 5000);
    return () => window.clearInterval(id);
  }, []);

  const addLog = useCallback((level: LogEntry["level"], message: string) => {
    setLogs((prev) => [...prev.slice(-100), { timestamp: timestamp(), level, message }]);
  }, []);

  // Real-time keystroke spacing (keydown-to-keydown), used as "dwell" feature for the RF API
  useEffect(() => {
    let lastKeyTime = 0;
    const handleKeyDown = () => {
      const now = performance.now();
      if (lastKeyTime > 0) {
        const dwell = now - lastKeyTime;
        const clampedDwell = Math.min(600, Math.max(25, dwell));
        setDwellTime(clampedDwell);
        setDwellHistory((prev) => [...prev.slice(1), clampedDwell]);

        if (clampedDwell < 45 || clampedDwell > 420) {
          setConfidenceScore((prev) => Math.max(0, prev - 1.2));
        } else {
          setConfidenceScore((prev) => Math.min(100, prev + 0.4));
        }
      }
      lastKeyTime = now;
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, []);

  // Real pointer speed (px/s), EMA-smoothed — replaces fake periodic velocity jumps
  useEffect(() => {
    let lastT = performance.now();
    let lastX = window.innerWidth / 2;
    let lastY = window.innerHeight / 2;
    let emaV = 0;
    let primed = false;

    const onMove = (e: MouseEvent) => {
      const t = performance.now();
      const dt = (t - lastT) / 1000;
      if (dt < 0.012) return;

      const dx = e.clientX - lastX;
      const dy = e.clientY - lastY;
      const dist = Math.hypot(dx, dy);
      const inst = dt > 0 ? dist / dt : 0;

      if (!primed) {
        primed = true;
        lastX = e.clientX;
        lastY = e.clientY;
        lastT = t;
        return;
      }

      emaV = emaV * 0.82 + inst * 0.18;
      lastX = e.clientX;
      lastY = e.clientY;
      lastT = t;

      const clamped = Math.min(9000, Math.max(0, Math.round(emaV)));
      setMouseVelocity(clamped);
      setVelocityHistory((prev) => [...prev.slice(1), clamped]);
    };

    window.addEventListener("mousemove", onMove, { passive: true });
    return () => window.removeEventListener("mousemove", onMove);
  }, []);

  // Browser path: anomaly from backend Random Forest (same model as Python desktop)
  useEffect(() => {
    let cancelled = false;

    const poll = async () => {
      if (externalModeRef.current) return;
      const { dwell, velocity } = metricsForAuditRef.current;
      try {
        const r = await fetch("/api/ml/anomaly", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ dwell, velocity }),
        });
        const j = (await r.json()) as { ok?: boolean; anomaly_score?: number };
        if (cancelled || !j.ok || typeof j.anomaly_score !== "number") return;
        setAnomalyScore((prev) => Math.min(100, Math.max(0, prev * 0.22 + j.anomaly_score * 0.78)));
      } catch {
        /* same-origin fetch failed (offline) */
      }
    };

    void poll();
    const id = window.setInterval(() => void poll(), 1400);
    return () => {
      cancelled = true;
      clearInterval(id);
    };
  }, []);

  useEffect(() => {
    const lim = strictMode ? THRESHOLD_STRICT : THRESHOLD_RELAXED;
    if (anomalyScore > lim && !isIntruder) {
      setIsIntruder(true);
      addLog("ALERT", `Anomaly score ${Math.round(anomalyScore)}% exceeded threshold (${lim}%). Triggering lockdown.`);
    }
  }, [anomalyScore, isIntruder, strictMode, addLog]);

  const updateMetricsRef = useRef<(dwell: number, velocity: number, anomaly: number) => void>();
  updateMetricsRef.current = (dwell: number, velocity: number, anomaly: number) => {
    setExternalMode(true);
    setDwellTime(dwell);
    setMouseVelocity(velocity);
    setAnomalyScore(anomaly);
    setDwellHistory((prev) => [...prev.slice(1), dwell]);
    setVelocityHistory((prev) => [...prev.slice(1), velocity]);
    const lim = strictModeRef.current ? THRESHOLD_STRICT : THRESHOLD_RELAXED;
    if (anomaly > lim) {
      setIsIntruder(true);
      addLog("ALERT", `External anomaly score ${Math.round(anomaly)}% exceeded threshold (${lim}%). Lockdown triggered.`);
    } else {
      setIsIntruder(false);
    }
  };

  useEffect(() => {
    (window as unknown as { updateMetrics?: typeof updateMetricsRef.current }).updateMetrics = (
      dwell: number,
      velocity: number,
      anomaly: number,
    ) => {
      updateMetricsRef.current?.(dwell, velocity, anomaly);
    };
    return () => {
      delete (window as unknown as { updateMetrics?: unknown }).updateMetrics;
    };
  }, []);

  const triggerAlert = () => {
    setExternalMode(true);
    setAnomalyScore(92);
    setIsIntruder(true);
    setConfidenceScore(12);
    addLog("ALERT", "Manual breach simulation triggered. Anomaly score set to 92%.");
  };

  const lockWorkstation = () => {
    setIsIntruder(false);
    setAnomalyScore(8);
    setDwellTime(142);
    setMouseVelocity(0);
    setConfidenceScore(100);
    setExternalMode(false);
    addLog("INFO", "Workstation unlocked. Biometric profile reset to baseline.");
  };

  const exportReport = () => {
    const BOM = "\uFEFF";
    const escapeCsv = (s: string) => `"${String(s).replace(/"/g, '""')}"`;
    const header = "Timestamp,Level,Message\r\n";
    const rows = logs.map((l) => `${l.timestamp},${l.level},${escapeCsv(l.message)}`).join("\r\n");
    const csv = BOM + header + rows;
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `shield-id-security-report-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
    addLog("INFO", "Security report exported to CSV.");
  };

  const triggerLockdown = () => {
    setLockdown(true);
    addLog("ALERT", "LOCKDOWN MODE ENGAGED — Biometric mismatch detected.");
  };

  const releaseLockdown = () => {
    setLockdown(false);
    setConfidenceScore(100);
    addLog("INFO", "Lockdown released. System returning to monitoring state.");
  };

  return {
    dwellTime,
    mouseVelocity,
    anomalyScore,
    isIntruder,
    dwellHistory,
    velocityHistory,
    triggerAlert,
    lockWorkstation,
    logs,
    confidenceScore,
    strictMode,
    setStrictMode,
    lockdown,
    triggerLockdown,
    releaseLockdown,
    far,
    frr,
    exportReport,
    addLog,
  };
}
