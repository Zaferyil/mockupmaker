import { useState } from "react";
import { Lock, Mail, AlertCircle } from "lucide-react";
import { login } from "./auth";
import { USERS } from "./users";

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

  const demoAccounts = Object.entries(USERS).map(([email, user]) => ({
    email,
    password: user.password,
    name: user.name,
  }));

  return (
    <div
      style={{
        minHeight: "100vh",
        background: "linear-gradient(135deg, #667eea 0%, #764ba2 100%)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        fontFamily: "system-ui, -apple-system, sans-serif",
      }}
    >
      <div
        style={{
          background: "white",
          borderRadius: "16px",
          padding: "48px",
          maxWidth: "400px",
          width: "100%",
          boxShadow: "0 20px 60px rgba(0,0,0,0.3)",
        }}
      >
        {/* Header */}
        <div style={{ textAlign: "center", marginBottom: "32px" }}>
          <div
            style={{
              fontSize: "48px",
              marginBottom: "12px",
            }}
          >
            👕
          </div>
          <h1 style={{ fontSize: "28px", margin: "0 0 8px 0", color: "#1f2937" }}>
            MockupMaker
          </h1>
          <p style={{ margin: "0", color: "#6b7280", fontSize: "14px" }}>
            Professional mockup design tool
          </p>
        </div>

        {/* Login Form */}
        <form onSubmit={handleLogin}>
          {/* Email Input */}
          <div style={{ marginBottom: "16px" }}>
            <label
              style={{
                display: "block",
                fontSize: "14px",
                fontWeight: "500",
                marginBottom: "6px",
                color: "#374151",
              }}
            >
              Email
            </label>
            <div style={{ position: "relative" }}>
              <Mail
                size={18}
                style={{
                  position: "absolute",
                  left: "12px",
                  top: "12px",
                  color: "#9ca3af",
                }}
              />
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="your@email.com"
                style={{
                  width: "100%",
                  padding: "10px 12px 10px 40px",
                  border: "1px solid #d1d5db",
                  borderRadius: "8px",
                  fontSize: "14px",
                  boxSizing: "border-box",
                  outline: "none",
                }}
                onFocus={(e) => (e.target.style.borderColor = ACCENT.violet)}
                onBlur={(e) => (e.target.style.borderColor = "#d1d5db")}
              />
            </div>
          </div>

          {/* Password Input */}
          <div style={{ marginBottom: "20px" }}>
            <label
              style={{
                display: "block",
                fontSize: "14px",
                fontWeight: "500",
                marginBottom: "6px",
                color: "#374151",
              }}
            >
              Password
            </label>
            <div style={{ position: "relative" }}>
              <Lock
                size={18}
                style={{
                  position: "absolute",
                  left: "12px",
                  top: "12px",
                  color: "#9ca3af",
                }}
              />
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••"
                style={{
                  width: "100%",
                  padding: "10px 12px 10px 40px",
                  border: "1px solid #d1d5db",
                  borderRadius: "8px",
                  fontSize: "14px",
                  boxSizing: "border-box",
                  outline: "none",
                }}
                onFocus={(e) => (e.target.style.borderColor = ACCENT.violet)}
                onBlur={(e) => (e.target.style.borderColor = "#d1d5db")}
              />
            </div>
          </div>

          {/* Error Message */}
          {error && (
            <div
              style={{
                display: "flex",
                alignItems: "center",
                gap: "8px",
                padding: "12px",
                background: "#fee2e2",
                border: "1px solid #fecaca",
                borderRadius: "8px",
                marginBottom: "16px",
                color: "#991b1b",
                fontSize: "14px",
              }}
            >
              <AlertCircle size={16} />
              {error}
            </div>
          )}

          {/* Login Button */}
          <button
            type="submit"
            disabled={isLoading || !email || !password}
            style={{
              width: "100%",
              padding: "12px",
              background: ACCENT.violet,
              color: "white",
              border: "none",
              borderRadius: "8px",
              fontSize: "16px",
              fontWeight: "600",
              cursor: isLoading || !email || !password ? "not-allowed" : "pointer",
              opacity: isLoading || !email || !password ? 0.5 : 1,
              transition: "opacity 200ms",
            }}
          >
            {isLoading ? "Logging in..." : "Login"}
          </button>
        </form>

        {/* Divider */}
        <div
          style={{
            height: "1px",
            background: "#e5e7eb",
            margin: "24px 0",
          }}
        />

        {/* Demo Accounts */}
        <div style={{ marginBottom: "20px" }}>
          <p
            style={{
              fontSize: "13px",
              fontWeight: "600",
              color: "#6b7280",
              margin: "0 0 12px 0",
              textTransform: "uppercase",
              letterSpacing: "0.5px",
            }}
          >
            Demo Accounts
          </p>
          <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
            {demoAccounts.map((account) => (
              <button
                key={account.email}
                type="button"
                onClick={() => {
                  setEmail(account.email);
                  setPassword(account.password);
                }}
                style={{
                  padding: "10px 12px",
                  background: "#f3f4f6",
                  border: "1px solid #e5e7eb",
                  borderRadius: "8px",
                  cursor: "pointer",
                  fontSize: "13px",
                  textAlign: "left",
                  transition: "all 200ms",
                }}
                onMouseEnter={(e) => {
                  e.target.style.background = "#e5e7eb";
                  e.target.style.borderColor = ACCENT.teal;
                }}
                onMouseLeave={(e) => {
                  e.target.style.background = "#f3f4f6";
                  e.target.style.borderColor = "#e5e7eb";
                }}
              >
                <div style={{ fontWeight: "600", color: "#111827" }}>
                  {account.name}
                </div>
                <div style={{ fontSize: "12px", color: "#9ca3af" }}>
                  {account.email}
                </div>
              </button>
            ))}
          </div>
        </div>

        {/* Footer */}
        <p
          style={{
            fontSize: "12px",
            color: "#9ca3af",
            textAlign: "center",
            margin: "0",
          }}
        >
          Demo version • All accounts use demo data
        </p>
      </div>
    </div>
  );
}
