import { motion, AnimatePresence } from "framer-motion";
import { useBiometricData } from "@/hooks/useBiometricData";
import Sparkline from "@/components/Sparkline";
import AnomalyGauge from "@/components/AnomalyGauge";
import SecurityLog from "@/components/SecurityLog";
import ThreatAssessment from "@/components/ThreatAssessment";
import LockdownOverlay from "@/components/LockdownOverlay";
import { Switch } from "@/components/ui/switch";
import { toast } from "@/components/ui/use-toast";
import { Shield, Lock, AlertTriangle, Zap, Download, Activity, LogOut } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { clearAuth, getAuth } from "@/lib/auth";
import AdminCreateUserDialog from "@/components/AdminCreateUserDialog";
import AdminPasswordResetQueue from "@/components/AdminPasswordResetQueue";
import AdminOperatorAudit from "@/components/AdminOperatorAudit";

const Dashboard = () => {
  const navigate = useNavigate();
  const auth = getAuth();
  const role = auth?.role ?? "user";
  const displayName = auth?.username;
  const isAdmin = role === "admin";
  const {
    dwellTime, mouseVelocity, anomalyScore, isIntruder,
    dwellHistory, velocityHistory, triggerAlert, lockWorkstation,
    logs, confidenceScore, strictMode, setStrictMode,
    lockdown, triggerLockdown, releaseLockdown,
    far, frr, exportReport,
  } = useBiometricData();

  const onLogout = () => {
    clearAuth();
    toast({
      title: "Signed out",
      description: "You’ve returned to the login screen.",
    });
    navigate("/");
  };

  return (
    <>
      <LockdownOverlay active={lockdown} onDismiss={releaseLockdown} />
      <motion.div
        className="min-h-screen bg-background selection:bg-verified/30"
        animate={isIntruder ? {
          backgroundColor: ["hsl(240,10%,2%)", "hsl(0,80%,5%)", "hsl(240,10%,2%)"],
        } : { backgroundColor: "hsl(240,10%,2%)" }}
        transition={isIntruder ? { duration: 2, repeat: Infinity, ease: "easeInOut" } : { duration: 0.5 }}
      >
        {/* Header */}
        <header className="h-14 flex items-center justify-between px-6 border-b border-foreground/5 bg-background/80 backdrop-blur-md sticky top-0 z-50">
          <div className="flex items-center gap-3">
            <Shield className="w-5 h-5 text-verified" />
            <span className="font-bold tracking-tighter text-lg">SHIELD-ID</span>
            <div className="h-4 w-px bg-foreground/10" />
            <span className="text-xs text-muted-foreground uppercase tracking-widest font-mono-data">Biometric Monitor</span>
          </div>
          <div className="flex items-center gap-4">
            {/* Adaptive Threshold Toggle */}
            <div className="flex items-center gap-2">
              <span className={`text-[9px] font-mono-data uppercase tracking-wider ${!strictMode ? "text-verified" : "text-muted-foreground/50"}`}>Convenience</span>
              <Switch checked={strictMode} onCheckedChange={setStrictMode} className="data-[state=checked]:bg-verified data-[state=unchecked]:bg-muted" />
              <span className={`text-[9px] font-mono-data uppercase tracking-wider ${strictMode ? "text-alert" : "text-muted-foreground/50"}`}>Strict</span>
            </div>
            <div className="h-4 w-px bg-foreground/10" />
            <div className="text-[10px] font-mono-data uppercase tracking-wider text-muted-foreground">
              {displayName ? (
                <>
                  Signed in: <span className="text-foreground">{displayName}</span>
                  <span className="text-muted-foreground/50 mx-1">·</span>
                </>
              ) : null}
              Role: <span className="text-foreground">{role}</span>
            </div>
            <div className="h-4 w-px bg-foreground/10" />
            {isAdmin && (
              <>
                <AdminCreateUserDialog />
                <div className="h-4 w-px bg-foreground/10" />
              </>
            )}
            {isAdmin && (
              <button
                onClick={exportReport}
                className="text-[10px] font-mono-data uppercase tracking-wider text-muted-foreground hover:text-foreground transition-colors px-3 py-1.5 rounded bg-secondary flex items-center gap-1.5"
              >
                <Download className="w-3 h-3" />
                Export Report
              </button>
            )}
            <button
              onClick={onLogout}
              className="text-[10px] font-mono-data uppercase tracking-wider text-muted-foreground hover:text-foreground transition-colors px-3 py-1.5 rounded bg-secondary flex items-center gap-1.5"
            >
              <LogOut className="w-3 h-3" />
              Logout
            </button>
            {!isIntruder && (
              <button
                onClick={triggerAlert}
                className="text-[10px] font-mono-data uppercase tracking-wider text-muted-foreground hover:text-alert transition-colors px-3 py-1.5 rounded bg-secondary"
              >
                Simulate Breach
              </button>
            )}
            <div className={`flex items-center gap-2 px-3 py-1 rounded-full ${
              isIntruder ? "bg-alert/10 border border-alert/20" : "bg-verified/10 border border-verified/20"
            }`}>
              <div className={`w-1.5 h-1.5 rounded-full animate-pulse ${
                isIntruder ? "bg-alert glow-red" : "bg-verified glow-green"
              }`} />
              <span className={`text-[10px] font-mono-data font-bold uppercase tracking-wider ${
                isIntruder ? "text-alert" : "text-verified"
              }`}>Live</span>
            </div>
          </div>
        </header>

        <main className="max-w-6xl mx-auto p-8 space-y-6">
          {/* Main Status Card */}
          <motion.div
            className="relative overflow-hidden rounded-xl surface-card p-12 flex flex-col items-center justify-center min-h-[280px]"
            layout
          >
            <div className={`absolute inset-0 bg-gradient-to-b ${
              isIntruder ? "from-alert/10 to-transparent" : "from-verified/5 to-transparent"
            } opacity-50 transition-all duration-1000`} />

            <AnimatePresence mode="wait">
              {isIntruder ? (
                <motion.div key="intruder" initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 0.95 }} transition={{ duration: 0.3 }} className="relative z-10 flex flex-col items-center">
                  <AlertTriangle className="w-10 h-10 text-alert mb-4 animate-pulse" />
                  <span className="text-xs font-mono-data text-alert/60 uppercase tracking-[0.3em] mb-4">Security Breach Detected</span>
                  <h1 className="text-5xl md:text-6xl font-mono-data font-bold text-alert tracking-tighter">INTRUDER DETECTED</h1>
                  <motion.button onClick={lockWorkstation} className="mt-8 px-8 py-3 bg-alert text-destructive-foreground font-mono-data font-bold uppercase tracking-wider text-sm rounded glow-red" whileTap={{ scale: 0.97 }} whileHover={{ scale: 1.02 }}>
                    <Lock className="inline w-4 h-4 mr-2 -mt-0.5" />
                    Lock Workstation
                  </motion.button>
                </motion.div>
              ) : (
                <motion.div key="verified" initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 0.95 }} transition={{ duration: 0.3 }} className="relative z-10 flex flex-col items-center">
                  <span className="text-xs font-mono-data text-verified/60 uppercase tracking-[0.3em] mb-4">Identity Confirmation</span>
                  <h1 className="text-5xl md:text-6xl font-mono-data font-bold text-verified tracking-tighter">USER VERIFIED</h1>
                  <div className="mt-8 flex gap-4">
                    <div className="h-1 w-12 bg-verified/20 rounded-full overflow-hidden">
                      <motion.div className="h-full bg-verified rounded-full" animate={{ x: ["-100%", "100%"] }} transition={{ duration: 2, repeat: Infinity, ease: "easeInOut" }} />
                    </div>
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
          </motion.div>

          {/* Performance Metrics (FAR / FRR / EER) */}
          <div className="grid grid-cols-3 gap-4">
            <div className="surface-card p-4 flex flex-col">
              <p className="text-[10px] uppercase tracking-widest text-muted-foreground mb-2">False Acceptance Rate</p>
              <div className="flex items-baseline gap-1.5">
                <Activity className="w-3 h-3 text-verified" />
                <span className="text-2xl font-mono-data font-bold">{far.toFixed(2)}</span>
                <span className="text-xs font-mono-data text-muted-foreground">%</span>
              </div>
            </div>
            <div className="surface-card p-4 flex flex-col">
              <p className="text-[10px] uppercase tracking-widest text-muted-foreground mb-2">False Rejection Rate</p>
              <div className="flex items-baseline gap-1.5">
                <Activity className="w-3 h-3 text-alert" />
                <span className="text-2xl font-mono-data font-bold">{frr.toFixed(2)}</span>
                <span className="text-xs font-mono-data text-muted-foreground">%</span>
              </div>
            </div>
            <div className="surface-card p-4 flex flex-col">
              <p className="text-[10px] uppercase tracking-widest text-muted-foreground mb-2">Equal Error Rate</p>
              <div className="flex items-baseline gap-1.5">
                <span className="text-2xl font-mono-data font-bold">2.2</span>
                <span className="text-xs font-mono-data text-muted-foreground">%</span>
              </div>
              <span className="text-[9px] font-mono-data text-muted-foreground/60 mt-1">Optimal Threshold</span>
            </div>
          </div>

          {/* Metrics Grid */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            {/* Dwell Time */}
            <div className="surface-card p-6">
              <p className="text-[10px] uppercase tracking-widest text-muted-foreground mb-4">Current Dwell Time</p>
              <div className="flex items-baseline gap-2">
                <span className="text-3xl font-mono-data font-bold">{Math.round(dwellTime)}</span>
                <span className="text-sm font-mono-data text-muted-foreground">ms</span>
              </div>
              <p className="text-[9px] font-mono-data text-muted-foreground/50 mt-1">Updates on keypress</p>
              <div className="mt-4 bg-muted/20 rounded overflow-hidden">
                <Sparkline data={dwellHistory} />
              </div>
            </div>

            {/* Mouse Velocity */}
            <div className="surface-card p-6">
              <div className="flex items-center gap-2 mb-4">
                <Zap className="w-3 h-3 text-muted-foreground" />
                <p className="text-[10px] uppercase tracking-widest text-muted-foreground">Mouse Velocity</p>
              </div>
              <div className="flex items-baseline gap-2">
                <span className="text-3xl font-mono-data font-bold">{Math.round(mouseVelocity).toLocaleString()}</span>
                <span className="text-sm font-mono-data text-muted-foreground">px/s</span>
              </div>
              <div className="mt-4 bg-muted/20 rounded overflow-hidden">
                <Sparkline data={velocityHistory} color="hsl(var(--foreground))" />
              </div>
            </div>

            {/* Anomaly Score */}
            <div className="surface-card p-6 flex flex-col items-center">
              <p className="text-[10px] uppercase tracking-widest text-muted-foreground mb-4 self-start">Anomaly Score</p>
              <AnomalyGauge score={anomalyScore} />
              <p className="mt-3 text-[10px] font-mono-data text-muted-foreground uppercase tracking-wider">
                {anomalyScore < 30 ? "Normal" : anomalyScore < 70 ? "Elevated" : "Critical"}
              </p>
            </div>
          </div>

          {isAdmin && (
            <>
              <AdminPasswordResetQueue />

              <AdminOperatorAudit />

              {/* AI Threat Assessment */}
              <ThreatAssessment confidenceScore={confidenceScore} onLockdown={triggerLockdown} />

              {/* Security Log */}
              <SecurityLog logs={logs} />
            </>
          )}

          {/* Footer info */}
          <div className="flex items-center justify-between text-[10px] font-mono-data text-muted-foreground/50 uppercase tracking-wider pt-4">
            <span>Session: 4h 23m</span>
            <span>Mode: {strictMode ? "Strict (High Security)" : "Convenience (High Usability)"}</span>
            <span>Encryption: AES-256-GCM</span>
            <span>Node: SOC-Primary</span>
          </div>
        </main>
      </motion.div>
    </>
  );
};

export default Dashboard;
