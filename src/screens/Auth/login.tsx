import { useEffect, useState, FormEvent } from "react";
import { useNavigate } from "react-router-dom";
import { isAxiosError } from "axios";
import { ModeToggle } from "../../components/mode-toggle";
import { EyeIcon, EyeOffIcon, ShieldCheck } from "lucide-react";
import efasLogo from "../../assets/eFAS_Logo.png";
import dictLogo from "../../assets/DICT-Logo-Final-2-300x153.png";
import { useAuth } from "./AuthContext";
import { authService } from "./authService";
import Swal from "sweetalert2";

const Login = () => {
  const navigate = useNavigate();

  const { login } = useAuth();

  const [showPassword, setShowPassword] = useState(false);
  const [form, setForm] = useState({ email: "", password: "" });
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (authService.isAuthenticated()) {
      navigate("/admin/dashboard");
    }
  }, []);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setForm({ ...form, [e.target.name]: e.target.value });
    setError(null);
  };

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (!form.email || !form.password) {
      setError("Please fill in all fields.");
      return;
    }
    setIsLoading(true);

    try {
      await login(form.email, form.password);
      Swal.fire({
        icon: "success",
        title: "Welcome back!",
        text: `Logged in as ${form.email}`,
        timer: 1500,
        showConfirmButton: false,
        background: "hsl(var(--background))",
        color: "hsl(var(--foreground))",
      });
      navigate("/admin/dashboard");
    } catch (err) {
      const data = isAxiosError(err) ? err.response?.data : undefined;
      const msg =
        data?.detail ||
        data?.non_field_errors?.[0] ||
        data?.email?.[0] ||
        "Invalid credentials. Please try again.";
      setError(msg);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="relative w-screen h-screen overflow-hidden flex bg-background">

      {/* ── Theme Toggle ─────────────────────────────────── */}
      <div className="absolute right-5 top-5 z-40">
        <ModeToggle />
      </div>

      {/* ── Left Branding Panel (desktop) ───────────────── */}
      <div className="flex lg:hidden flex-col justify-between w-[480px] shrink-0 bg-card border-r border-border relative overflow-hidden p-10">
        {/* subtle dot grid */}
        <div className="absolute inset-0 opacity-[0.04] bg-[radial-gradient(hsl(var(--primary))_1px,transparent_1px)] [background-size:28px_28px] pointer-events-none" />
        {/* glow accent */}
        <div className="absolute -top-32 -left-32 w-80 h-80 rounded-full bg-primary/10 blur-3xl pointer-events-none" />
        <div className="absolute -bottom-32 -right-20 w-96 h-96 rounded-full bg-primary/5 blur-3xl pointer-events-none" />

        {/* DICT logo */}
        <div className="relative z-10">
          <img src={dictLogo} alt="DICT Logo" className="h-16 object-contain" />
        </div>

        {/* Center copy */}
        <div className="relative z-10 flex flex-col gap-6">
          <div className="self-start rounded-xl dark:bg-transparent bg-gray-900 px-4 py-2">
            <img src={efasLogo} alt="eFAS Logo" className="h-16 object-contain" />
          </div>
          <div>
            <h1 className="text-3xl font-bold text-foreground leading-tight">
              Electronic Financial<br />Accountability System
            </h1>
            <p className="text-muted-foreground text-sm mt-3 leading-relaxed max-w-xs">
              Streamlining financial monitoring and reporting for DICT Regional Office 10.
            </p>
          </div>
          <div className="flex flex-col gap-3">
            {[
              "SARO & Sub-ARO Management",
              "NTCA Balance Monitoring",
              "Fund Utilization Tracking",
            ].map((f) => (
              <div key={f} className="flex items-center gap-2.5 text-sm text-muted-foreground">
                <ShieldCheck size={15} className="text-primary shrink-0" />
                {f}
              </div>
            ))}
          </div>
        </div>

        {/* Footer */}
        <p className="relative z-10 text-[11px] text-muted-foreground">
          © {new Date().getFullYear()} DICT Regional Office 10. All rights reserved.
        </p>
      </div>

      {/* ── Right Login Panel ────────────────────────────── */}
      <div className="flex-1 flex flex-col items-center justify-center px-6 relative">
        {/* Mobile only: top logo area */}
        <div className="hidden lg:flex flex-col items-center gap-3 mb-8">
          <div className="rounded-xl dark:bg-transparent bg-gray-900 px-4 py-2">
            <img src={efasLogo} alt="eFAS Logo" className="h-12 object-contain" />
          </div>
          <p className="text-muted-foreground text-xs text-center">
            DICT Regional Office 10
          </p>
        </div>

        {/* subtle background grid */}
        <div className="absolute inset-0 opacity-[0.03] bg-[radial-gradient(hsl(var(--primary))_1px,transparent_1px)] [background-size:32px_32px] pointer-events-none" />

        <div className="relative z-10 w-full max-w-[400px]">
          <div className="mb-7">
            <h2 className="text-2xl font-bold text-foreground">Welcome back</h2>
            <p className="text-muted-foreground text-sm mt-1">Sign in to your eFAS account</p>
          </div>

          <form
            onSubmit={handleSubmit}
            className="bg-card border border-border rounded-2xl px-8 py-8 flex flex-col gap-5 shadow-xl shadow-black/10 dark:shadow-black/40"
          >
            {error && (
              <div className="bg-destructive/10 border border-destructive/30 text-destructive text-sm rounded-lg px-4 py-2.5 flex items-start gap-2">
                <span className="mt-0.5 shrink-0">⚠</span>
                {error}
              </div>
            )}

            {/* Email */}
            <div className="flex flex-col gap-1.5">
              <label htmlFor="email" className="text-sm font-medium text-foreground">Email address</label>
              <input
                id="email"
                name="email"
                type="email"
                required
                autoComplete="email"
                value={form.email}
                onChange={handleChange}
                placeholder="you@dict.gov.ph"
                className="w-full rounded-lg bg-background border border-input px-3.5 py-2.5 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary focus:border-transparent transition"
              />
            </div>

            {/* Password */}
            <div className="flex flex-col gap-1.5">
              <label htmlFor="password" className="text-sm font-medium text-foreground">Password</label>
              <div className="relative">
                <input
                  id="password"
                  name="password"
                  type={showPassword ? "text" : "password"}
                  required
                  autoComplete="current-password"
                  value={form.password}
                  onChange={handleChange}
                  placeholder="Enter your password"
                  className="w-full rounded-lg bg-background border border-input px-3.5 py-2.5 pr-11 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary focus:border-transparent transition"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword((p) => !p)}
                  className="absolute right-3.5 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition"
                >
                  {showPassword ? <EyeOffIcon size={16} /> : <EyeIcon size={16} />}
                </button>
              </div>
            </div>

            <button
              type="submit"
              disabled={isLoading}
              className="w-full bg-primary hover:bg-primary/90 active:scale-[0.98] text-primary-foreground font-medium text-sm rounded-lg py-2.5 transition-all disabled:opacity-60 disabled:cursor-not-allowed shadow-lg shadow-primary/20"
            >
              {isLoading ? (
                <span className="flex items-center justify-center gap-2">
                  <span className="h-4 w-4 rounded-full border-2 border-primary-foreground/30 border-t-primary-foreground animate-spin" />
                  Signing in…
                </span>
              ) : "Sign In"}
            </button>
          </form>

          <p className="text-center text-xs text-muted-foreground mt-5">
            DICT Regional Office 10 &mdash; eFAS v1
          </p>
        </div>
      </div>
    </div>
  );
};

export default Login;
