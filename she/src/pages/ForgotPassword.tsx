import { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { ArrowLeft, Shield } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "@/components/ui/use-toast";

export default function ForgotPassword() {
  const navigate = useNavigate();
  const [username, setUsername] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [done, setDone] = useState(false);

  const canSubmit = useMemo(() => username.trim().length > 0 && !submitting, [username, submitting]);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!canSubmit) return;

    setSubmitting(true);
    try {
      const resp = await fetch("/api/auth/forgot-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username: username.trim() }),
      });
      const data = (await resp.json().catch(() => ({}))) as {
        ok?: boolean;
        error?: string;
        message?: string;
      };

      if (!resp.ok || !data?.ok) {
        toast({
          variant: "destructive",
          title: "Request failed",
          description: data?.error || `HTTP ${resp.status}`,
        });
        return;
      }

      setDone(true);
      toast({
        title: "Next step",
        description: data.message || "Contact your supervisor for a reset code.",
      });
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="relative min-h-screen overflow-hidden bg-background">
      <div className="pointer-events-none absolute inset-0">
        <div className="absolute -top-36 left-1/2 h-[38rem] w-[38rem] -translate-x-1/2 rounded-full bg-gradient-to-br from-primary/25 via-violet-500/10 to-cyan-400/15 blur-3xl" />
      </div>

      <div className="relative mx-auto flex min-h-screen max-w-lg items-center justify-center px-4 py-10">
        <Card className="w-full border bg-card/70 shadow-xl backdrop-blur supports-[backdrop-filter]:bg-card/60">
          <CardHeader className="space-y-1">
            <CardTitle className="flex items-center gap-2">
              <span className="inline-flex h-9 w-9 items-center justify-center rounded-lg bg-primary/10 text-primary">
                <Shield className="h-5 w-5" />
              </span>
              Forgot password
            </CardTitle>
            <CardDescription>
              Submit your domain username. If the account exists, a reset token is queued for your supervisor only—you
              will not see the token in this browser.
            </CardDescription>
          </CardHeader>

          {!done ? (
            <form onSubmit={onSubmit}>
              <CardContent className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="fp-user">Domain username</Label>
                  <Input
                    id="fp-user"
                    autoComplete="username"
                    placeholder="Same as sign-in (e.g. alice or DOMAIN\\alice)"
                    value={username}
                    onChange={(e) => setUsername(e.target.value)}
                  />
                </div>
              </CardContent>
              <CardFooter className="flex flex-col gap-3">
                <Button type="submit" className="w-full" disabled={!canSubmit}>
                  {submitting ? "Submitting…" : "Request reset (supervisor approval)"}
                </Button>
                <Button type="button" variant="ghost" className="w-full gap-2" onClick={() => navigate("/")}>
                  <ArrowLeft className="h-4 w-4" />
                  Back to sign in
                </Button>
              </CardFooter>
            </form>
          ) : (
            <CardContent className="space-y-4">
              <p className="text-sm text-muted-foreground leading-relaxed">
                If an account exists for that name, your supervisor has the reset token in the SHIELD-ID supervisor
                dashboard (and may receive an email if the server is configured for it). Ask them for the code, then
                open <span className="text-foreground font-mono-data text-xs">/reset-password</span> from the link
                they give you, or paste the token there.
              </p>
              <Button type="button" className="w-full" variant="secondary" onClick={() => navigate("/reset-password")}>
                I have a token — set new password
              </Button>
              <Button type="button" variant="outline" className="w-full" onClick={() => navigate("/")}>
                Return to sign in
              </Button>
            </CardContent>
          )}
        </Card>
      </div>
    </div>
  );
}
