import { useMemo, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { Building2, Eye, EyeOff, LockKeyhole, Shield } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import { toast } from "@/components/ui/use-toast";
import { setAuth } from "@/lib/auth";

function normalizeUsername(raw: string) {
  return raw.trim();
}

export default function Login() {
  const navigate = useNavigate();
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [rememberMe, setRememberMe] = useState(true);
  const [showPassword, setShowPassword] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  const canSubmit = useMemo(() => {
    return normalizeUsername(username).length > 0 && password.length > 0 && !submitting;
  }, [username, password, submitting]);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!canSubmit) {
      toast({
        variant: "destructive",
        title: "Missing credentials",
        description: "Enter your domain username and password to continue.",
      });
      return;
    }

    setSubmitting(true);
    try {
      const resp = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          username: normalizeUsername(username),
          password,
        }),
      });

      const data = (await resp.json().catch(() => ({}))) as any;
      if (!resp.ok || !data?.ok || typeof data?.token !== "string") {
        toast({
          variant: "destructive",
          title: "Sign in failed",
          description: data?.error || "Invalid credentials or server error.",
        });
        return;
      }

      const role = typeof data?.role === "string" ? data.role : "user";
      setAuth({ token: data.token, role, username: normalizeUsername(username) });

      toast({
        title: "Signed in",
        description: role === "admin" ? "Supervisor access granted." : "Operator access granted.",
      });

      navigate("/monitor");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="relative min-h-screen overflow-hidden bg-background">
      <div className="pointer-events-none absolute inset-0">
        <div className="absolute -top-36 left-1/2 h-[38rem] w-[38rem] -translate-x-1/2 rounded-full bg-gradient-to-br from-primary/25 via-violet-500/10 to-cyan-400/15 blur-3xl" />
        <div className="absolute -bottom-40 -left-40 h-[34rem] w-[34rem] rounded-full bg-gradient-to-tr from-emerald-400/10 via-primary/10 to-sky-400/10 blur-3xl" />
        <div className="absolute right-[-18rem] top-20 h-[28rem] w-[28rem] rounded-full bg-gradient-to-tr from-fuchsia-400/10 via-primary/10 to-blue-400/10 blur-3xl" />
      </div>

      <div className="relative mx-auto flex min-h-screen max-w-6xl items-center justify-center px-4 py-10">
        <div className="grid w-full items-center gap-10 lg:grid-cols-2">
          <div className="hidden lg:block">
            <div className="inline-flex items-center gap-2 rounded-full border bg-card/60 px-3 py-1 text-sm text-muted-foreground shadow-sm backdrop-blur">
              <Shield className="h-4 w-4 text-primary" />
              SHIELD-ID Secure Access
            </div>

            <h1 className="mt-6 text-balance text-4xl font-semibold tracking-tight">
              Access the SHIELD-ID Security Monitoring Platform.
            </h1>
            <p className="mt-4 max-w-xl text-pretty text-base leading-relaxed text-muted-foreground">
              SHIELD-ID provides enterprise-grade access control through authenticated identity verification and
              continuous behavioral risk assessment. Sign in with your authorized organizational account to continue.
            </p>

            <div className="mt-8 grid max-w-xl gap-4 rounded-2xl border bg-card/60 p-5 shadow-sm backdrop-blur">
              <div className="flex items-start gap-3">
                <div className="mt-0.5 inline-flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10 text-primary">
                  <Building2 className="h-5 w-5" />
                </div>
                <div>
                  <div className="font-medium">Enterprise identity access</div>
                  <div className="text-sm text-muted-foreground">Use your corporate account credentials to authenticate securely.</div>
                </div>
              </div>
              <Separator />
              <div className="flex items-start gap-3">
                <div className="mt-0.5 inline-flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10 text-primary">
                  <LockKeyhole className="h-5 w-5" />
                </div>
                <div>
                  <div className="font-medium">Security-first architecture</div>
                  <div className="text-sm text-muted-foreground">
                    Encrypted transport, controlled session handling, and role-based authorization are enforced at sign-in.
                  </div>
                </div>
              </div>
            </div>
          </div>

          <Card className="mx-auto w-full max-w-md border bg-card/70 shadow-xl backdrop-blur supports-[backdrop-filter]:bg-card/60">
            <CardHeader className="space-y-1">
              <CardTitle className="flex items-center gap-2">
                <span className="inline-flex h-9 w-9 items-center justify-center rounded-lg bg-primary/10 text-primary">
                  <Shield className="h-5 w-5" />
                </span>
                Login
              </CardTitle>
              <CardDescription>Use your domain account to continue.</CardDescription>
            </CardHeader>

            <form onSubmit={onSubmit}>
              <CardContent className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="username">Domain username</Label>
                  <Input
                    id="username"
                    autoComplete="username"
                    inputMode="text"
                    placeholder="DOMAIN\\username or user@domain.local"
                    value={username}
                    onChange={(e) => setUsername(e.target.value)}
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="password">Password</Label>
                  <div className="relative">
                    <Input
                      id="password"
                      autoComplete="current-password"
                      type={showPassword ? "text" : "password"}
                      placeholder="••••••••••••"
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

                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Checkbox
                      id="remember"
                      checked={rememberMe}
                      onCheckedChange={(v) => setRememberMe(Boolean(v))}
                    />
                    <Label htmlFor="remember" className="text-sm text-muted-foreground">
                      Remember me
                    </Label>
                  </div>
                  <Button type="button" variant="link" className="h-auto p-0 text-sm" asChild>
                    <Link to="/forgot-password">Forgot password?</Link>
                  </Button>
                </div>
              </CardContent>

              <CardFooter className="flex flex-col gap-3">
                <Button type="submit" className="w-full" disabled={!canSubmit}>
                  {submitting ? "Signing in…" : "Sign in"}
                </Button>
                <p className="text-center text-xs text-muted-foreground">
                  By continuing you agree to your organization’s security policy.
                </p>
                <div className="text-center text-sm text-muted-foreground">
                  Don’t have an account?{" "}
                  <Button type="button" variant="link" className="h-auto p-0 text-sm" onClick={() => navigate("/signup")}>
                    Sign up
                  </Button>
                </div>
              </CardFooter>
            </form>
          </Card>
        </div>
      </div>
    </div>
  );
}

