import { motion } from "framer-motion";
import { Brain, ShieldAlert } from "lucide-react";

interface ThreatAssessmentProps {
  confidenceScore: number;
  onLockdown: () => void;
}

const ThreatAssessment = ({ confidenceScore, onLockdown }: ThreatAssessmentProps) => {
  const getColor = () => {
    if (confidenceScore >= 80) return "text-verified";
    if (confidenceScore >= 50) return "text-yellow-400";
    return "text-alert";
  };

  const getBarColor = () => {
    if (confidenceScore >= 80) return "bg-verified";
    if (confidenceScore >= 50) return "bg-yellow-400";
    return "bg-alert";
  };

  return (
    <div className="surface-card p-6">
      <div className="flex items-center gap-2 mb-4">
        <Brain className="w-3.5 h-3.5 text-muted-foreground" />
        <p className="text-[10px] uppercase tracking-widest text-muted-foreground">AI-Driven Threat Assessment</p>
      </div>
      <div className="flex items-baseline gap-2 mb-3">
        <span className={`text-3xl font-mono-data font-bold ${getColor()}`}>
          {confidenceScore.toFixed(1)}%
        </span>
        <span className="text-sm font-mono-data text-muted-foreground">confidence</span>
      </div>
      <div className="h-1.5 bg-muted/30 rounded-full overflow-hidden mb-4">
        <motion.div
          className={`h-full rounded-full ${getBarColor()}`}
          animate={{ width: `${confidenceScore}%` }}
          transition={{ duration: 0.5 }}
        />
      </div>
      <motion.button
        onClick={onLockdown}
        className="w-full px-4 py-2 bg-alert/10 border border-alert/20 text-alert font-mono-data text-[10px] uppercase tracking-wider rounded hover:bg-alert/20 transition-colors flex items-center justify-center gap-2"
        whileTap={{ scale: 0.97 }}
      >
        <ShieldAlert className="w-3.5 h-3.5" />
        Initiate Lockdown
      </motion.button>
    </div>
  );
};

export default ThreatAssessment;
