import { useMemo, useState, useEffect } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { ArrowLeft, Eye, EyeOff, Shield } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "@/components/ui/use-toast";

export default function ResetPassword() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const [token, setToken] = useState("");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    const q = searchParams.get("token");
    if (q) setToken(q);
  }, [searchParams]);

  const canSubmit = useMemo(() => {
    return token.trim().length > 0 && password.length >= 8 && password === confirm && !submitting;
  }, [token, password, confirm, submitting]);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!canSubmit) {
      toast({
        variant: "destructive",
        title: "Check the form",
        description: "Token required; password at least 8 characters; both fields must match.",
      });
      return;
    }

    setSubmitting(true);
    try {
      const resp = await fetch("/api/auth/reset-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          token: token.trim(),
          new_password: password,
          confirm_password: confirm,
        }),
      });
      const data = (await resp.json().catch(() => ({}))) as { ok?: boolean; error?: string; message?: string };

      if (!resp.ok || !data?.ok) {
        toast({
          variant: "destructive",
          title: "Reset failed",
          description: data?.error || `HTTP ${resp.status}`,
        });
        return;
      }

      toast({
        title: "Password updated",
        description: data.message || "You can sign in now.",
      });
      navigate("/");
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
              Set new password
            </CardTitle>
            <CardDescription>
              Paste your reset token if the link did not fill it automatically. AD may reject passwords that do not meet
              domain complexity rules.
            </CardDescription>
          </CardHeader>

          <form onSubmit={onSubmit}>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="rp-token">Reset token</Label>
                <Input
                  id="rp-token"
                  className="font-mono-data text-xs"
                  placeholder="JWT from email or lab response"
                  value={token}
                  onChange={(e) => setToken(e.target.value)}
                  autoComplete="off"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="rp-pw">New password</Label>
                <div className="relative">
                  <Input
                    id="rp-pw"
                    type={showPassword ? "text" : "password"}
                    autoComplete="new-password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    className="pr-11"
                  />
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    aria-label={showPassword ? "Hide password" : "Show password"}
                    className="absolute right-1 top-1 h-8 w-8 text-muted-foreground hover:text-foreground"
                    onClick={() => setShowPassword((s) => !s)}
                  >
                    {showPassword ? <EyeOff /> : <Eye />}
                  </Button>
                </div>
              </div>
              <div className="space-y-2">
                <Label htmlFor="rp-pw2">Confirm new password</Label>
                <Input
                  id="rp-pw2"
                  type={showPassword ? "text" : "password"}
                  autoComplete="new-password"
                  value={confirm}
                  onChange={(e) => setConfirm(e.target.value)}
                />
              </div>
            </CardContent>
            <CardFooter className="flex flex-col gap-3">
              <Button type="submit" className="w-full" disabled={!canSubmit}>
                {submitting ? "Updating…" : "Update password"}
              </Button>
              <Button type="button" variant="ghost" className="w-full gap-2" asChild>
                <Link to="/forgot-password">
                  <ArrowLeft className="h-4 w-4" />
                  Request a new link
                </Link>
              </Button>
              <Button type="button" variant="ghost" className="w-full" asChild>
                <Link to="/">Back to sign in</Link>
              </Button>
            </CardFooter>
          </form>
        </Card>
      </div>
    </div>
  );
}
