import { useCallback, useEffect, useState } from "react";
import { Download } from "lucide-react";
import { ScrollArea } from "@/components/ui/scroll-area";
import { toast } from "@/components/ui/use-toast";
import { getAuth } from "@/lib/auth";

type AuditRow = { plain: string; error: string };

export default function AdminOperatorAudit() {
  const [entries, setEntries] = useState<AuditRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [fetchError, setFetchError] = useState<string | null>(null);

  const load = useCallback(async () => {
    const auth = getAuth();
    if (!auth?.token) return;
    setLoading(true);
    setFetchError(null);
    try {
      const resp = await fetch("/api/admin/audit-log?limit=400", {
        headers: { Authorization: `Bearer ${auth.token}` },
      });
      const data = (await resp.json().catch(() => ({}))) as { ok?: boolean; entries?: AuditRow[]; error?: string };
      if (!resp.ok || !data?.ok || !Array.isArray(data.entries)) {
        setFetchError(data?.error || `HTTP ${resp.status}`);
        return;
      }
      setEntries(data.entries);
    } catch {
      setFetchError("Network error");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
    const id = setInterval(() => void load(), 8000);
    return () => clearInterval(id);
  }, [load]);

  const exportCsv = useCallback(() => {
    const BOM = "\uFEFF";
    const escape = (s: string) => `"${String(s).replace(/"/g, '""')}"`;
    const header = "Index,Status,Message\r\n";
    const rows = entries
      .map((e, i) => {
        const status = e.error ? "ERROR" : "OK";
        const message = e.error ? e.error || "decrypt_failed" : e.plain;
        return `${i + 1},${status},${escape(message)}`;
      })
      .join("\r\n");
    const csv = BOM + header + rows;
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `shield-id-operator-audit-${new Date().toISOString().slice(0, 19).replace(/:/g, "-")}.csv`;
    a.click();
    URL.revokeObjectURL(url);
    toast({
      title: "Audit exported",
      description: `${entries.length} row(s) saved as CSV (UTF-8).`,
    });
  }, [entries]);

  return (
    <div className="surface-card p-4 flex flex-col min-h-[220px]">
      <div className="flex items-center justify-between mb-3 gap-2 flex-wrap">
        <p className="text-[10px] uppercase tracking-widest text-muted-foreground">Operator audit (all sessions)</p>
        <div className="flex items-center gap-1.5">
          <button
            type="button"
            onClick={exportCsv}
            title="Download current audit lines as CSV"
            className="text-[10px] font-mono-data uppercase tracking-wider text-muted-foreground hover:text-foreground transition-colors px-2 py-1 rounded bg-secondary flex items-center gap-1"
          >
            <Download className="w-3 h-3" />
            Export
          </button>
          <button
            type="button"
            onClick={() => void load()}
            disabled={loading}
            className="text-[10px] font-mono-data uppercase tracking-wider text-muted-foreground hover:text-foreground transition-colors px-2 py-1 rounded bg-secondary disabled:opacity-50"
          >
            {loading ? "Refreshing…" : "Refresh"}
          </button>
        </div>
      </div>
      {fetchError && (
        <p className="text-[11px] font-mono-data text-alert mb-2">{fetchError}</p>
      )}
      <ScrollArea className="flex-1 font-mono-data text-[11px] leading-relaxed max-h-[280px]">
        <div className="space-y-1 pr-4">
          {entries.length === 0 && !fetchError && (
            <p className="text-muted-foreground/70">No audit lines yet. Sign in as an operator to generate LOGIN and telemetry rows.</p>
          )}
          {entries.map((e, i) => (
            <div key={i} className="text-foreground/85 break-all">
              {e.error ? <span className="text-alert">[decrypt failed]</span> : e.plain}
            </div>
          ))}
        </div>
      </ScrollArea>
    </div>
  );
}
