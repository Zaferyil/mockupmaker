import { useState, useEffect } from "react";
import { X, Plus, Trash2, Users } from "lucide-react";
import { getAllUsers, addUser, removeUser } from "./users";

const ACCENT = {
  coral: "#FF5A36",
  teal: "#00C2A8",
  violet: "#7B61FF",
  yellow: "#FFC93C",
};

// Kept here rather than imported from App.jsx: AdminPanel is imported *by*
// App.jsx, so pulling the studio's dictionary back in would close an import
// cycle. These strings are only ever used by this panel.
const T = {
  en: {
    title: "Admin Panel — User Management",
    addUser: "Add New User",
    email: "Email",
    emailPlaceholder: "name@email.com",
    fullName: "Full Name",
    namePlaceholder: "Customer name",
    password: "Password",
    submit: "Add User",
    registered: "Registered Users",
    delete: "Delete",
    needEmailAndName: "Email and name are required",
    alreadyRegistered: "That email is already registered",
    added: (n) => `${n} added successfully!`,
    removed: (e) => `${e} removed`,
    confirmDelete: (e) => `Delete the user ${e}?`,
    close: "Close",
  },
  tr: {
    title: "Admin Paneli — Kullanıcı Yönetimi",
    addUser: "Yeni Kullanıcı Ekle",
    email: "Email",
    emailPlaceholder: "ornek@email.com",
    fullName: "Ad Soyad",
    namePlaceholder: "Müşteri Adı",
    password: "Şifre",
    submit: "Kullanıcı Ekle",
    registered: "Kayıtlı Kullanıcılar",
    delete: "Sil",
    needEmailAndName: "Email ve ad gerekli",
    alreadyRegistered: "Bu email zaten kayıtlı",
    added: (n) => `${n} başarıyla eklendi!`,
    removed: (e) => `${e} silindi`,
    confirmDelete: (e) => `${e} kullanıcısını silmek istediğine emin misin?`,
    close: "Kapat",
  },
  de: {
    title: "Admin-Panel — Benutzerverwaltung",
    addUser: "Neuen Benutzer anlegen",
    email: "E-Mail",
    emailPlaceholder: "name@email.com",
    fullName: "Name",
    namePlaceholder: "Name des Kunden",
    password: "Passwort",
    submit: "Benutzer anlegen",
    registered: "Registrierte Benutzer",
    delete: "Löschen",
    needEmailAndName: "E-Mail und Name sind erforderlich",
    alreadyRegistered: "Diese E-Mail ist bereits registriert",
    added: (n) => `${n} wurde angelegt!`,
    removed: (e) => `${e} wurde gelöscht`,
    confirmDelete: (e) => `Benutzer ${e} wirklich löschen?`,
    close: "Schließen",
  },
};

export function AdminPanel({ onClose, lang = "en" }) {
  const t = T[lang] ?? T.en;
  const [users, setUsers] = useState([]);
  const [email, setEmail] = useState("");
  const [name, setName] = useState("");
  const [password, setPassword] = useState("password123");
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [isLoading, setIsLoading] = useState(true);

  // Load users on mount
  useEffect(() => {
    loadUsers();
  }, []);

  const loadUsers = async () => {
    try {
      setIsLoading(true);
      const allUsers = await getAllUsers();
      setUsers(allUsers);
    } catch (err) {
      console.error("Error loading users:", err);
      setError("Error loading users");
    } finally {
      setIsLoading(false);
    }
  };

  const handleAddUser = async (e) => {
    e.preventDefault();
    setError("");
    setSuccess("");

    if (!email || !name) {
      setError(t.needEmailAndName);
      return;
    }

    try {
      // Check if user already exists
      const existingUsers = users.filter(u => u.email === email);
      if (existingUsers.length > 0) {
        setError(t.alreadyRegistered);
        return;
      }

      // Add user to Firestore
      await addUser(email, name, { password });

      // Reload users list
      await loadUsers();

      setSuccess(t.added(name));
      setEmail("");
      setName("");
      setPassword("password123");

      setTimeout(() => setSuccess(""), 3000);
    } catch (err) {
      console.error("Error adding user:", err);
      setError(err.message || "Error adding user");
    }
  };

  const handleDeleteUser = async (userId, userEmail) => {
    if (window.confirm(t.confirmDelete(userEmail))) {
      try {
        await removeUser(userId);
        await loadUsers();
        setSuccess(t.removed(userEmail));
        setTimeout(() => setSuccess(""), 3000);
      } catch (err) {
        console.error("Error deleting user:", err);
        setError("Error deleting user");
      }
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
              {t.title}
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
            <X size={20} aria-label={t.close} />
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
              {t.addUser}
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
                  {t.email}
                </label>
                <input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder={t.emailPlaceholder}
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
                  {t.fullName}
                </label>
                <input
                  type="text"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder={t.namePlaceholder}
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
                  {t.password}
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
                {t.submit}
              </button>
            </form>
          </div>

          {/* Users List */}
          <div>
            <h3 style={{ margin: "0 0 12px 0", color: "#1f2937" }}>
              {t.registered} ({users.length})
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
                    {user.isadmin && (
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

                  {!user.isadmin && (
                    <button
                      onClick={() => handleDeleteUser(user.id, user.email)}
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
                      {t.delete}
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
