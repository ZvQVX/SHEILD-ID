import { useCallback, useEffect, useState } from "react";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Button } from "@/components/ui/button";
import { toast } from "@/components/ui/use-toast";
import { getAuth } from "@/lib/auth";
import { Copy, Trash2 } from "lucide-react";

type Row = {
  id: string;
  sam: string;
  token: string;
  reset_url: string;
  requested_at: string;
};

async function copyText(label: string, text: string) {
  try {
    await navigator.clipboard.writeText(text);
    toast({ title: "Copied", description: `${label} copied to clipboard.` });
  } catch {
    toast({ variant: "destructive", title: "Copy failed", description: "Your browser blocked clipboard access." });
  }
}

export default function AdminPasswordResetQueue() {
  const [items, setItems] = useState<Row[]>([]);
  const [loading, setLoading] = useState(false);

  const load = useCallback(async () => {
    const auth = getAuth();
    if (!auth?.token) return;
    setLoading(true);
    try {
      const resp = await fetch("/api/admin/password-reset-queue", {
        headers: { Authorization: `Bearer ${auth.token}` },
      });
      const data = (await resp.json().catch(() => ({}))) as { ok?: boolean; items?: Row[]; error?: string };
      if (!resp.ok || !data?.ok || !Array.isArray(data.items)) {
        setItems([]);
        return;
      }
      setItems(data.items);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
    const id = setInterval(() => void load(), 7000);
    return () => clearInterval(id);
  }, [load]);

  const dismiss = async (rid: string) => {
    const auth = getAuth();
    if (!auth?.token) return;
    const resp = await fetch(`/api/admin/password-reset-queue/${encodeURIComponent(rid)}`, {
      method: "DELETE",
      headers: { Authorization: `Bearer ${auth.token}` },
    });
    const data = (await resp.json().catch(() => ({}))) as { ok?: boolean; error?: string };
    if (!resp.ok || !data?.ok) {
      toast({ variant: "destructive", title: "Dismiss failed", description: data?.error || `HTTP ${resp.status}` });
      return;
    }
    toast({ title: "Removed", description: "Entry cleared from the queue." });
    void load();
  };

  return (
    <div className="surface-card p-4 flex flex-col min-h-[160px]">
      <div className="flex items-center justify-between mb-3 gap-2">
        <p className="text-[10px] uppercase tracking-widest text-muted-foreground">Password reset queue</p>
        <Button
          type="button"
          variant="secondary"
          size="sm"
          className="h-7 text-[10px] font-mono-data uppercase"
          disabled={loading}
          onClick={() => void load()}
        >
          {loading ? "Loading…" : "Refresh"}
        </Button>
      </div>
      <p className="text-[11px] text-muted-foreground mb-3">
        Operators request resets on the forgot-password page. Copy the token (or full URL) and give it to the user
        out-of-band. Entries clear automatically after a successful reset.
      </p>
      <ScrollArea className="max-h-[320px]">
        <div className="space-y-3 pr-3">
          {items.length === 0 && (
            <p className="text-[11px] font-mono-data text-muted-foreground">No pending reset requests.</p>
          )}
          {items.map((row) => (
            <div key={row.id} className="rounded-lg border border-foreground/10 bg-background/40 p-3 space-y-2">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <span className="text-xs font-mono-data text-foreground">
                  <span className="text-muted-foreground">User</span> {row.sam}
                </span>
                <span className="text-[10px] font-mono-data text-muted-foreground">{row.requested_at}</span>
              </div>
              <div className="flex flex-wrap gap-2">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="h-8 gap-1.5 text-[10px]"
                  onClick={() => void copyText("Token", row.token)}
                >
                  <Copy className="h-3 w-3" />
                  Copy token
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="h-8 gap-1.5 text-[10px]"
                  onClick={() => void copyText("Reset URL", row.reset_url)}
                >
                  <Copy className="h-3 w-3" />
                  Copy URL
                </Button>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="h-8 gap-1.5 text-[10px] text-muted-foreground"
                  onClick={() => void dismiss(row.id)}
                >
                  <Trash2 className="h-3 w-3" />
                  Dismiss
                </Button>
              </div>
              <p className="text-[10px] font-mono-data break-all text-muted-foreground/90 leading-relaxed">{row.token}</p>
            </div>
          ))}
        </div>
      </ScrollArea>
    </div>
  );
}
