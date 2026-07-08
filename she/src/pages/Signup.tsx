import { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Shield } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Progress } from "@/components/ui/progress";
import { toast } from "@/components/ui/use-toast";

function getPasswordRules(pw: string) {
  const v = pw ?? "";
  return {
    minLength: v.length >= 12,
    upper: /[A-Z]/.test(v),
    lower: /[a-z]/.test(v),
    digit: /\d/.test(v),
    special: /[^A-Za-z0-9]/.test(v),
  };
}

function passwordScore(pw: string) {
  const r = getPasswordRules(pw);
  const parts = [r.minLength, r.upper, r.lower, r.digit, r.special];
  const ok = parts.filter(Boolean).length;
  return Math.round((ok / parts.length) * 100);
}

export default function Signup() {
  const navigate = useNavigate();
  const [submitting, setSubmitting] = useState(false);
  const [lastError, setLastError] = useState<string | null>(null);
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [givenName, setGivenName] = useState("");
  const [sn, setSn] = useState("");
  const [mail, setMail] = useState("");

  const rules = useMemo(() => getPasswordRules(password), [password]);
  const score = useMemo(() => passwordScore(password), [password]);

  const canSubmit = useMemo(() => {
    const strong =
      rules.minLength && rules.upper && rules.lower && rules.digit && rules.special && password === confirmPassword;
    return username.trim().length > 0 && strong && !submitting;
  }, [username, password, confirmPassword, submitting, rules]);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!canSubmit) {
      toast({
        variant: "destructive",
        title: "Weak password",
        description: "Use a stronger password and make sure both fields match.",
      });
      return;
    }

    setSubmitting(true);
    setLastError(null);
    try {
      const resp = await fetch("/api/auth/self-signup", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          username: username.trim(),
          password,
          givenName: givenName.trim() || undefined,
          sn: sn.trim() || undefined,
          mail: mail.trim() || undefined,
        }),
      });

      const data = (await resp.json().catch(() => ({}))) as any;
      if (!resp.ok || !data?.ok) {
        const msg = (data?.error as string) || "Server rejected the request.";
        setLastError(msg);
        toast({
          variant: "destructive",
          title: "Sign up failed",
          description: msg,
        });
        return;
      }

      toast({
        title: "Account created",
        description: "Your account was created. You can now sign in.",
      });
      navigate("/");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="relative min-h-screen overflow-hidden bg-background">
      <div className="relative mx-auto flex min-h-screen max-w-6xl items-center justify-center px-4 py-10">
        <Card className="mx-auto w-full max-w-md border bg-card/70 shadow-xl backdrop-blur supports-[backdrop-filter]:bg-card/60">
          <CardHeader className="space-y-1">
            <CardTitle className="flex items-center gap-2">
              <span className="inline-flex h-9 w-9 items-center justify-center rounded-lg bg-primary/10 text-primary">
                <Shield className="h-5 w-5" />
              </span>
              Sign up
            </CardTitle>
            <CardDescription>Create your account (if self-signup is enabled).</CardDescription>
          </CardHeader>

          <form onSubmit={onSubmit}>
            <CardContent className="space-y-4">
              {lastError && (
                <div className="rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive">
                  {lastError}
                </div>
              )}
              <div className="space-y-2">
                <Label htmlFor="username">Username</Label>
                <Input id="username" value={username} onChange={(e) => setUsername(e.target.value)} placeholder="zaid" />
              </div>
              <div className="space-y-2">
                <Label htmlFor="password">Password</Label>
                <Input
                  id="password"
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="At least 12 chars, mixed types"
                />
                <div className="space-y-2">
                  <Progress value={score} className="h-2" />
                  <div className="text-xs text-muted-foreground">
                    Must include:{" "}
                    <span className={rules.minLength ? "text-foreground" : ""}>12+ chars</span>,{" "}
                    <span className={rules.upper ? "text-foreground" : ""}>A‑Z</span>,{" "}
                    <span className={rules.lower ? "text-foreground" : ""}>a‑z</span>,{" "}
                    <span className={rules.digit ? "text-foreground" : ""}>0‑9</span>,{" "}
                    <span className={rules.special ? "text-foreground" : ""}>symbol</span>
                  </div>
                </div>
              </div>
              <div className="space-y-2">
                <Label htmlFor="confirmPassword">Confirm password</Label>
                <Input
                  id="confirmPassword"
                  type="password"
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  placeholder="Re-type password"
                />
                {confirmPassword.length > 0 && confirmPassword !== password && (
                  <div className="text-xs text-destructive">Passwords do not match.</div>
                )}
              </div>
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-2">
                  <Label htmlFor="givenName">Given name</Label>
                  <Input id="givenName" value={givenName} onChange={(e) => setGivenName(e.target.value)} />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="sn">Surname</Label>
                  <Input id="sn" value={sn} onChange={(e) => setSn(e.target.value)} />
                </div>
              </div>
              <div className="space-y-2">
                <Label htmlFor="mail">Email</Label>
                <Input id="mail" value={mail} onChange={(e) => setMail(e.target.value)} placeholder="zaid@server.zaid" />
              </div>
            </CardContent>

            <CardFooter className="flex flex-col gap-3">
              <Button type="submit" className="w-full" disabled={!canSubmit}>
                {submitting ? "Creating…" : "Create account"}
              </Button>
              <Button type="button" variant="link" className="h-auto p-0 text-sm" onClick={() => navigate("/")}>
                Back to login
              </Button>
            </CardFooter>
          </form>
        </Card>
      </div>
    </div>
  );
}

