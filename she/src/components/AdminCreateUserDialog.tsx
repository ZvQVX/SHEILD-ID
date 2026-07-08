import { useMemo, useState } from "react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "@/components/ui/use-toast";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { getAuth } from "@/lib/auth";
import { Switch } from "@/components/ui/switch";

type Props = {
  triggerLabel?: string;
};

export default function AdminCreateUserDialog({ triggerLabel = "Create Employee" }: Props) {
  const auth = getAuth();
  const token = auth?.token ?? "";

  const [open, setOpen] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [givenName, setGivenName] = useState("");
  const [sn, setSn] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [mail, setMail] = useState("");
  /** When on, server adds the new user to the SHIELD supervisor AD group so login JWT is admin. */
  const [grantSupervisor, setGrantSupervisor] = useState(true);

  const canSubmit = useMemo(() => {
    return username.trim().length > 0 && password.length > 0 && !submitting;
  }, [username, password, submitting]);

  async function onCreate() {
    if (!canSubmit) return;
    if (!token) {
      toast({ variant: "destructive", title: "Not signed in", description: "Sign in again to continue." });
      return;
    }

    setSubmitting(true);
    try {
      const resp = await fetch("/api/auth/signup", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          username: username.trim(),
          password,
          givenName: givenName.trim() || undefined,
          sn: sn.trim() || undefined,
          displayName: displayName.trim() || undefined,
          mail: mail.trim() || undefined,
          grantAdmin: grantSupervisor,
        }),
      });

      const data = (await resp.json().catch(() => ({}))) as any;
      if (!resp.ok || !data?.ok) {
        toast({
          variant: "destructive",
          title: "Create failed",
          description: data?.error || "Server rejected the request.",
        });
        return;
      }

      toast({
        title: typeof data?.warning === "string" ? "Employee created (see note)" : "Employee created",
        description:
          typeof data?.warning === "string"
            ? `${String(data.warning)}${typeof data?.user_dn === "string" ? ` — ${data.user_dn}` : ""}`
            : typeof data?.user_dn === "string"
              ? data.user_dn
              : "User created successfully.",
      });
      setOpen(false);
      setUsername("");
      setPassword("");
      setGivenName("");
      setSn("");
      setDisplayName("");
      setMail("");
      setGrantSupervisor(true);
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="secondary" className="h-auto px-3 py-1.5 text-[10px] font-mono-data uppercase tracking-wider">
          {triggerLabel}
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Create employee</DialogTitle>
          <DialogDescription>
            Creates a new AD account in your configured OU. Only signed-in supervisors can use this action.
          </DialogDescription>
        </DialogHeader>

        <div className="grid gap-4">
          <div className="grid gap-2">
            <Label htmlFor="new-username">Username (sAMAccountName)</Label>
            <Input id="new-username" value={username} onChange={(e) => setUsername(e.target.value)} placeholder="newuser1" />
          </div>
          <div className="grid gap-2">
            <Label htmlFor="new-password">Initial password</Label>
            <Input
              id="new-password"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="SomePassw0rd!"
            />
          </div>

          <div className="grid gap-2 sm:grid-cols-2">
            <div className="grid gap-2">
              <Label htmlFor="givenName">Given name</Label>
              <Input id="givenName" value={givenName} onChange={(e) => setGivenName(e.target.value)} />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="sn">Surname</Label>
              <Input id="sn" value={sn} onChange={(e) => setSn(e.target.value)} />
            </div>
          </div>

          <div className="grid gap-2">
            <Label htmlFor="displayName">Display name</Label>
            <Input id="displayName" value={displayName} onChange={(e) => setDisplayName(e.target.value)} />
          </div>
          <div className="grid gap-2">
            <Label htmlFor="mail">Email</Label>
            <Input id="mail" value={mail} onChange={(e) => setMail(e.target.value)} placeholder="user@server.zaid" />
          </div>

          <div className="flex items-center justify-between gap-4 rounded-md border border-border/60 px-3 py-2">
            <div className="space-y-0.5">
              <Label htmlFor="grant-supervisor" className="text-sm font-medium">
                SHIELD supervisor (admin)
              </Label>
              <p className="text-[11px] text-muted-foreground leading-snug">
                Adds the account to your SHIELD supervisor AD group so they get the admin dashboard after sign-in.
                Turn off for a standard operator account.
              </p>
            </div>
            <Switch id="grant-supervisor" checked={grantSupervisor} onCheckedChange={setGrantSupervisor} />
          </div>
        </div>

        <DialogFooter>
          <Button onClick={onCreate} disabled={!canSubmit}>
            {submitting ? "Creating…" : "Create"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

