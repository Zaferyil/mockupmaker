import { useState } from "react";
import { Lock, Mail, AlertCircle, Eye, EyeOff } from "lucide-react";
import { login } from "./auth";

const ACCENT = {
  coral: "#FF5A36",
  teal: "#00C2A8",
  violet: "#7B61FF",
};

export function LoginPage({ onLoginSuccess }) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [rememberMe, setRememberMe] = useState(false);

  const handleLogin = async (e) => {
    e.preventDefault();
    setError("");
    setIsLoading(true);

    try {
      const user = login(email, password);
      onLoginSuccess(user);
    } catch (err) {
      setError(err.message);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div
      style={{
        minHeight: "100vh",
        background: "linear-gradient(135deg, #667eea 0%, #764ba2 100%)",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        fontFamily: "system-ui, -apple-system, sans-serif",
        padding: "20px",
      }}
    >
      {/* Main Content */}
      <div
        style={{
          width: "100%",
          maxWidth: "500px",
        }}
      >
        {/* Brand Header */}
        <div style={{ textAlign: "center", marginBottom: "48px" }}>
          <div
            style={{
              fontSize: "48px",
              marginBottom: "16px",
            }}
          >
            👕
          </div>
          <h1 style={{ fontSize: "32px", margin: "0 0 8px 0", color: "white", fontWeight: "700" }}>
            MockupMaker
          </h1>
          <p style={{ margin: "0", color: "rgba(255,255,255,0.8)", fontSize: "16px" }}>
            Professional mockup design tool
          </p>
        </div>

        {/* Login Card */}
        <div
          style={{
            background: "white",
            borderRadius: "20px",
            padding: "48px 32px",
            boxShadow: "0 20px 60px rgba(0,0,0,0.3)",
            marginBottom: "32px",
          }}
        >
          {/* Welcome Section */}
          <div style={{ textAlign: "center", marginBottom: "32px" }}>
            <h2 style={{ fontSize: "28px", margin: "0 0 8px 0", color: "#1f2937", fontWeight: "700" }}>
              Welcome back 👋
            </h2>
            <p style={{ margin: "0", color: "#6b7280", fontSize: "15px" }}>
              Login to your account to continue
            </p>
          </div>

          {/* Login Form */}
          <form onSubmit={handleLogin}>
            {/* Email Input */}
            <div style={{ marginBottom: "20px" }}>
              <label
                style={{
                  display: "block",
                  fontSize: "13px",
                  fontWeight: "600",
                  marginBottom: "8px",
                  color: "#1f2937",
                }}
              >
                Email
              </label>
              <div style={{ position: "relative" }}>
                <Mail
                  size={18}
                  style={{
                    position: "absolute",
                    left: "14px",
                    top: "50%",
                    transform: "translateY(-50%)",
                    color: ACCENT.violet,
                  }}
                />
                <input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="your@email.com"
                  style={{
                    width: "100%",
                    padding: "12px 14px 12px 44px",
                    border: "1.5px solid #e5e7eb",
                    borderRadius: "12px",
                    fontSize: "15px",
                    boxSizing: "border-box",
                    outline: "none",
                    transition: "all 200ms",
                  }}
                  onFocus={(e) => {
                    e.target.style.borderColor = ACCENT.violet;
                    e.target.style.boxShadow = `0 0 0 3px rgba(123, 97, 255, 0.1)`;
                  }}
                  onBlur={(e) => {
                    e.target.style.borderColor = "#e5e7eb";
                    e.target.style.boxShadow = "none";
                  }}
                />
              </div>
            </div>

            {/* Password Input */}
            <div style={{ marginBottom: "24px" }}>
              <label
                style={{
                  display: "block",
                  fontSize: "13px",
                  fontWeight: "600",
                  marginBottom: "8px",
                  color: "#1f2937",
                }}
              >
                Password
              </label>
              <div style={{ position: "relative" }}>
                <Lock
                  size={18}
                  style={{
                    position: "absolute",
                    left: "14px",
                    top: "50%",
                    transform: "translateY(-50%)",
                    color: ACCENT.violet,
                  }}
                />
                <input
                  type={showPassword ? "text" : "password"}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="••••••••"
                  style={{
                    width: "100%",
                    padding: "12px 44px 12px 44px",
                    border: "1.5px solid #e5e7eb",
                    borderRadius: "12px",
                    fontSize: "15px",
                    boxSizing: "border-box",
                    outline: "none",
                    transition: "all 200ms",
                  }}
                  onFocus={(e) => {
                    e.target.style.borderColor = ACCENT.violet;
                    e.target.style.boxShadow = `0 0 0 3px rgba(123, 97, 255, 0.1)`;
                  }}
                  onBlur={(e) => {
                    e.target.style.borderColor = "#e5e7eb";
                    e.target.style.boxShadow = "none";
                  }}
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  style={{
                    position: "absolute",
                    right: "14px",
                    top: "50%",
                    transform: "translateY(-50%)",
                    background: "none",
                    border: "none",
                    cursor: "pointer",
                    color: ACCENT.violet,
                    padding: "4px",
                  }}
                >
                  {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
                </button>
              </div>
            </div>

            {/* Remember Me & Forgot Password */}
            <div
              style={{
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
                marginBottom: "28px",
              }}
            >
              <label
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: "8px",
                  cursor: "pointer",
                  fontSize: "14px",
                  color: "#374151",
                }}
              >
                <input
                  type="checkbox"
                  checked={rememberMe}
                  onChange={(e) => setRememberMe(e.target.checked)}
                  style={{
                    width: "18px",
                    height: "18px",
                    cursor: "pointer",
                    accentColor: ACCENT.violet,
                  }}
                />
                Remember me
              </label>
              <a
                href="#"
                onClick={(e) => e.preventDefault()}
                style={{
                  fontSize: "14px",
                  color: ACCENT.violet,
                  textDecoration: "none",
                  fontWeight: "500",
                }}
              >
                Forgot password?
              </a>
            </div>

            {/* Error Message */}
            {error && (
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: "12px",
                  padding: "12px 16px",
                  background: "#fee2e2",
                  border: "1px solid #fecaca",
                  borderRadius: "12px",
                  marginBottom: "20px",
                  color: "#991b1b",
                  fontSize: "14px",
                }}
              >
                <AlertCircle size={18} />
                <span>{error}</span>
              </div>
            )}

            {/* Login Button */}
            <button
              type="submit"
              disabled={isLoading || !email || !password}
              style={{
                width: "100%",
                padding: "14px",
                background: ACCENT.violet,
                color: "white",
                border: "none",
                borderRadius: "12px",
                fontSize: "16px",
                fontWeight: "600",
                cursor: isLoading || !email || !password ? "not-allowed" : "pointer",
                opacity: isLoading || !email || !password ? 0.6 : 1,
                transition: "all 200ms",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                gap: "8px",
              }}
              onMouseEnter={(e) => {
                if (!isLoading && email && password) {
                  e.target.style.background = "#6B4FE4";
                }
              }}
              onMouseLeave={(e) => {
                e.target.style.background = ACCENT.violet;
              }}
            >
              <span>→</span>
              {isLoading ? "Logging in..." : "Login"}
            </button>
          </form>

          {/* Divider */}
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: "12px",
              margin: "24px 0",
              color: "#d1d5db",
              fontSize: "14px",
            }}
          >
            <div style={{ flex: 1, height: "1px", background: "#e5e7eb" }} />
            <span>or</span>
            <div style={{ flex: 1, height: "1px", background: "#e5e7eb" }} />
          </div>

          {/* Google Button */}
          <button
            type="button"
            style={{
              width: "100%",
              padding: "14px",
              background: "white",
              border: "1.5px solid #e5e7eb",
              borderRadius: "12px",
              fontSize: "15px",
              fontWeight: "600",
              cursor: "pointer",
              color: "#1f2937",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              gap: "10px",
              transition: "all 200ms",
            }}
            onMouseEnter={(e) => {
              e.target.style.borderColor = ACCENT.violet;
              e.target.style.background = "rgba(123, 97, 255, 0.05)";
            }}
            onMouseLeave={(e) => {
              e.target.style.borderColor = "#e5e7eb";
              e.target.style.background = "white";
            }}
          >
            <span style={{ fontSize: "18px" }}>🔵</span>
            Continue with Google
          </button>
        </div>

        {/* Sign Up Link */}
        <div style={{ textAlign: "center", color: "rgba(255,255,255,0.8)", fontSize: "15px" }}>
          Don't have an account?{" "}
          <a
            href="#"
            onClick={(e) => e.preventDefault()}
            style={{
              color: "white",
              textDecoration: "none",
              fontWeight: "600",
              cursor: "pointer",
            }}
          >
            Create account
          </a>
        </div>
      </div>

      {/* Features Section */}
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(150px, 1fr))",
          gap: "24px",
          marginTop: "48px",
          width: "100%",
          maxWidth: "500px",
          textAlign: "center",
          color: "rgba(255,255,255,0.9)",
        }}
      >
        <div>
          <div style={{ fontSize: "28px", marginBottom: "8px" }}>⚡</div>
          <div style={{ fontWeight: "600", fontSize: "15px", marginBottom: "4px" }}>Fast & Easy</div>
          <div style={{ fontSize: "13px", opacity: 0.8 }}>Create in seconds</div>
        </div>
        <div>
          <div style={{ fontSize: "28px", marginBottom: "8px" }}>🔒</div>
          <div style={{ fontWeight: "600", fontSize: "15px", marginBottom: "4px" }}>Secure</div>
          <div style={{ fontSize: "13px", opacity: 0.8 }}>Your data is safe</div>
        </div>
        <div>
          <div style={{ fontSize: "28px", marginBottom: "8px" }}>☁️</div>
          <div style={{ fontWeight: "600", fontSize: "15px", marginBottom: "4px" }}>Cloud Sync</div>
          <div style={{ fontSize: "13px", opacity: 0.8 }}>Access anywhere</div>
        </div>
      </div>
    </div>
  );
}
