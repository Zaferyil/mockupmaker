import { useState, useEffect } from "react";
import { X, Plus, Trash2, Users } from "lucide-react";
import { USERS, getAllUsers, addUser, removeUser } from "./users";

const ACCENT = {
  coral: "#FF5A36",
  teal: "#00C2A8",
  violet: "#7B61FF",
  yellow: "#FFC93C",
};

export function AdminPanel({ onClose }) {
  const [users, setUsers] = useState(getAllUsers());
  const [email, setEmail] = useState("");
  const [name, setName] = useState("");
  const [password, setPassword] = useState("password123");
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  const handleAddUser = (e) => {
    e.preventDefault();
    setError("");
    setSuccess("");

    if (!email || !name) {
      setError("Email ve ad gerekli");
      return;
    }

    if (USERS[email]) {
      setError("Bu email zaten kayıtlı");
      return;
    }

    addUser(email, name, password);
    setUsers(getAllUsers());
    setSuccess(`${name} başarıyla eklendi!`);
    setEmail("");
    setName("");
    setPassword("password123");

    setTimeout(() => setSuccess(""), 3000);
  };

  const handleDeleteUser = (userEmail) => {
    if (
      window.confirm(
        `${userEmail} kullanıcısını silmek istediğine emin misin?`
      )
    ) {
      removeUser(userEmail);
      setUsers(getAllUsers());
      setSuccess(`${userEmail} silindi`);
      setTimeout(() => setSuccess(""), 3000);
    }
  };

  return (
    <div
      style={{
        position: "fixed",
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        background: "rgba(0,0,0,0.5)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        zIndex: 1000,
      }}
      onClick={onClose}
    >
      <div
        style={{
          background: "white",
          borderRadius: "16px",
          maxWidth: "600px",
          width: "100%",
          maxHeight: "90vh",
          overflow: "auto",
          boxShadow: "0 20px 60px rgba(0,0,0,0.3)",
        }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            padding: "24px",
            borderBottom: "1px solid #e5e7eb",
            background: "linear-gradient(135deg, #667eea 0%, #764ba2 100%)",
            color: "white",
          }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
            <Users size={24} />
            <h2 style={{ margin: 0, fontSize: "20px", fontWeight: "600" }}>
              Admin Paneli - Kullanıcı Yönetimi
            </h2>
          </div>
          <button
            onClick={onClose}
            style={{
              background: "rgba(255,255,255,0.2)",
              border: "none",
              color: "white",
              borderRadius: "6px",
              cursor: "pointer",
              padding: "6px",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            <X size={20} />
          </button>
        </div>

        {/* Content */}
        <div style={{ padding: "24px" }}>
          {/* Add User Form */}
          <div
            style={{
              background: "#f9fafb",
              borderRadius: "12px",
              padding: "20px",
              marginBottom: "24px",
              border: "1px solid #e5e7eb",
            }}
          >
            <h3 style={{ margin: "0 0 16px 0", color: "#1f2937" }}>
              Yeni Kullanıcı Ekle
            </h3>

            <form onSubmit={handleAddUser}>
              {/* Email */}
              <div style={{ marginBottom: "12px" }}>
                <label
                  style={{
                    display: "block",
                    fontSize: "13px",
                    fontWeight: "500",
                    marginBottom: "4px",
                    color: "#374151",
                  }}
                >
                  Email
                </label>
                <input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="ornek@email.com"
                  style={{
                    width: "100%",
                    padding: "8px 12px",
                    border: "1px solid #d1d5db",
                    borderRadius: "6px",
                    fontSize: "13px",
                    boxSizing: "border-box",
                    outline: "none",
                  }}
                  onFocus={(e) => (e.target.style.borderColor = ACCENT.violet)}
                  onBlur={(e) => (e.target.style.borderColor = "#d1d5db")}
                />
              </div>

              {/* Name */}
              <div style={{ marginBottom: "12px" }}>
                <label
                  style={{
                    display: "block",
                    fontSize: "13px",
                    fontWeight: "500",
                    marginBottom: "4px",
                    color: "#374151",
                  }}
                >
                  Ad Soyad
                </label>
                <input
                  type="text"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="Müşteri Adı"
                  style={{
                    width: "100%",
                    padding: "8px 12px",
                    border: "1px solid #d1d5db",
                    borderRadius: "6px",
                    fontSize: "13px",
                    boxSizing: "border-box",
                    outline: "none",
                  }}
                  onFocus={(e) => (e.target.style.borderColor = ACCENT.violet)}
                  onBlur={(e) => (e.target.style.borderColor = "#d1d5db")}
                />
              </div>

              {/* Password */}
              <div style={{ marginBottom: "12px" }}>
                <label
                  style={{
                    display: "block",
                    fontSize: "13px",
                    fontWeight: "500",
                    marginBottom: "4px",
                    color: "#374151",
                  }}
                >
                  Şifre
                </label>
                <input
                  type="text"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="password123"
                  style={{
                    width: "100%",
                    padding: "8px 12px",
                    border: "1px solid #d1d5db",
                    borderRadius: "6px",
                    fontSize: "13px",
                    boxSizing: "border-box",
                    outline: "none",
                  }}
                  onFocus={(e) => (e.target.style.borderColor = ACCENT.violet)}
                  onBlur={(e) => (e.target.style.borderColor = "#d1d5db")}
                />
              </div>

              {/* Error */}
              {error && (
                <div
                  style={{
                    padding: "10px 12px",
                    background: "#fee2e2",
                    border: "1px solid #fecaca",
                    borderRadius: "6px",
                    color: "#991b1b",
                    fontSize: "13px",
                    marginBottom: "12px",
                  }}
                >
                  {error}
                </div>
              )}

              {/* Success */}
              {success && (
                <div
                  style={{
                    padding: "10px 12px",
                    background: "#dcfce7",
                    border: "1px solid #bbf7d0",
                    borderRadius: "6px",
                    color: "#166534",
                    fontSize: "13px",
                    marginBottom: "12px",
                  }}
                >
                  ✓ {success}
                </div>
              )}

              {/* Submit Button */}
              <button
                type="submit"
                style={{
                  width: "100%",
                  padding: "10px",
                  background: ACCENT.violet,
                  color: "white",
                  border: "none",
                  borderRadius: "6px",
                  fontSize: "13px",
                  fontWeight: "600",
                  cursor: "pointer",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  gap: "6px",
                }}
              >
                <Plus size={16} />
                Kullanıcı Ekle
              </button>
            </form>
          </div>

          {/* Users List */}
          <div>
            <h3 style={{ margin: "0 0 12px 0", color: "#1f2937" }}>
              Kayıtlı Kullanıcılar ({users.length})
            </h3>

            <div
              style={{
                display: "grid",
                gridTemplateColumns: "repeat(auto-fill, minmax(280px, 1fr))",
                gap: "12px",
              }}
            >
              {users.map((user) => (
                <div
                  key={user.email}
                  style={{
                    background: "#fff",
                    border: "1px solid #e5e7eb",
                    borderRadius: "8px",
                    padding: "12px",
                  }}
                >
                  <div
                    style={{
                      display: "flex",
                      justifyContent: "space-between",
                      alignItems: "start",
                      marginBottom: "8px",
                    }}
                  >
                    <div>
                      <div
                        style={{
                          fontWeight: "600",
                          color: "#111827",
                          fontSize: "14px",
                        }}
                      >
                        {user.name}
                      </div>
                      <div style={{ fontSize: "12px", color: "#6b7280" }}>
                        {user.email}
                      </div>
                    </div>
                    {user.role === "admin" && (
                      <span
                        style={{
                          padding: "2px 8px",
                          background: ACCENT.violet,
                          color: "white",
                          borderRadius: "4px",
                          fontSize: "11px",
                          fontWeight: "600",
                        }}
                      >
                        Admin
                      </span>
                    )}
                  </div>

                  <div style={{ fontSize: "12px", color: "#9ca3af", marginBottom: "10px" }}>
                    ID: {user.id}
                  </div>

                  {user.email !== "zafer@example.com" && (
                    <button
                      onClick={() => handleDeleteUser(user.email)}
                      style={{
                        width: "100%",
                        padding: "6px",
                        background: "#fee2e2",
                        border: "1px solid #fecaca",
                        color: "#991b1b",
                        borderRadius: "4px",
                        fontSize: "12px",
                        fontWeight: "500",
                        cursor: "pointer",
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                        gap: "4px",
                      }}
                    >
                      <Trash2 size={14} />
                      Sil
                    </button>
                  )}
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
