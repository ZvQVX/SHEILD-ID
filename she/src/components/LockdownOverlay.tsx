import { motion, AnimatePresence } from "framer-motion";
import { ShieldOff, X } from "lucide-react";

const LockdownOverlay = ({ active, onDismiss }: { active: boolean; onDismiss: () => void }) => (
  <AnimatePresence>
    {active && (
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        className="fixed inset-0 z-[100] bg-background/98 flex flex-col items-center justify-center"
      >
        <motion.div
          initial={{ scale: 0.9, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          transition={{ delay: 0.1, type: "spring", damping: 20 }}
          className="flex flex-col items-center text-center"
        >
          <ShieldOff className="w-16 h-16 text-alert mb-6 animate-pulse" />
          <h1 className="text-4xl md:text-6xl font-mono-data font-bold text-alert tracking-tighter mb-4">
            SYSTEM SECURED
          </h1>
          <p className="text-lg font-mono-data text-alert/60 uppercase tracking-[0.3em] mb-10">
            Biometric Mismatch Detected
          </p>
          <motion.button
            onClick={onDismiss}
            className="px-8 py-3 border border-foreground/20 text-muted-foreground font-mono-data text-xs uppercase tracking-wider rounded hover:bg-secondary transition-colors flex items-center gap-2"
            whileTap={{ scale: 0.97 }}
          >
            <X className="w-3.5 h-3.5" />
            Release Lock
          </motion.button>
        </motion.div>
      </motion.div>
    )}
  </AnimatePresence>
);

export default LockdownOverlay;
