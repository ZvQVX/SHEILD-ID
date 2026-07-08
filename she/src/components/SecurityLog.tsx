import { useEffect, useRef } from "react";
import { ScrollArea } from "@/components/ui/scroll-area";

export interface LogEntry {
  timestamp: string;
  level: "INFO" | "WARN" | "ALERT";
  message: string;
}

const levelColors: Record<string, string> = {
  INFO: "text-verified",
  WARN: "text-yellow-400",
  ALERT: "text-alert",
};

const SecurityLog = ({ logs }: { logs: LogEntry[] }) => {
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [logs.length]);

  return (
    <div className="surface-card p-4 h-[200px] flex flex-col">
      <p className="text-[10px] uppercase tracking-widest text-muted-foreground mb-3">Session Security Log</p>
      <ScrollArea className="flex-1 font-mono-data text-[11px] leading-relaxed">
        <div className="space-y-1 pr-4">
          {logs.map((log, i) => (
            <div key={i} className="flex gap-2">
              <span className="text-muted-foreground/50 shrink-0">{log.timestamp}</span>
              <span className={`shrink-0 font-bold ${levelColors[log.level]}`}>[{log.level}]</span>
              <span className="text-foreground/80">{log.message}</span>
            </div>
          ))}
          <div ref={bottomRef} />
        </div>
      </ScrollArea>
    </div>
  );
};

export default SecurityLog;
