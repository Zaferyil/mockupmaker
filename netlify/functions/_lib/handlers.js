/**
 * HTTP uçlarının gövdesi. Depolama `db` üzerinden veriliyor, böylece testte
 * sahte bir depo takılabiliyor.
 *
 * db arayüzü:
 *   loadUsers()      -> Promise<user[]>
 *   saveUsers(users) -> Promise<void>
 *   loadSecret()     -> Promise<string>   (jeton imzalama anahtarı)
 */
import {
  makeUser,
  publicUser,
  findByEmail,
  verifyPassword,
  signToken,
  verifyToken,
  normalizeEmail,
} from "./core.js";

const json = (body, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });

/** Authorization başlığındaki jetonu çözer; geçersizse null. */
async function authenticate(req, db) {
  const header = req.headers.get("authorization") ?? "";
  const token = header.startsWith("Bearer ") ? header.slice(7) : "";
  return verifyToken(token, await db.loadSecret());
}

export function makeHandlers(db) {
  /** POST /api/login — e-posta + şifre karşılığında oturum jetonu. */
  async function login(req) {
    if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);

    let body;
    try {
      body = await req.json();
    } catch {
      return json({ error: "Invalid request body" }, 400);
    }

    const users = await db.loadUsers();
    const user = findByEmail(users, body?.email);

    // Kullanıcı yoksa da şifre yanlışsa da aynı cevap: hangi e-postaların
    // kayıtlı olduğu denemeyle öğrenilemesin.
    if (!user || !verifyPassword(body?.password, user.salt, user.hash)) {
      return json({ error: "Invalid email or password" }, 401);
    }

    const secret = await db.loadSecret();
    const safe = publicUser(user);
    return json({
      user: safe,
      token: signToken({ id: safe.id, email: safe.email, isadmin: safe.isadmin }, secret),
    });
  }

  /** GET/POST/DELETE /api/users — hepsi admin jetonu ister. */
  async function users(req) {
    const session = await authenticate(req, db);
    if (!session) return json({ error: "Unauthorized" }, 401);
    if (!session.isadmin) return json({ error: "Admin access required" }, 403);

    const stored = await db.loadUsers();

    if (req.method === "GET") {
      return json(stored.map(publicUser));
    }

    if (req.method === "POST") {
      let body;
      try {
        body = await req.json();
      } catch {
        return json({ error: "Invalid request body" }, 400);
      }

      const email = normalizeEmail(body?.email);
      const name = String(body?.name ?? "").trim();
      const password = String(body?.password ?? "");

      if (!email || !name) return json({ error: "Email and name are required" }, 400);
      if (!email.includes("@")) return json({ error: "Invalid email address" }, 400);
      if (password.length < 6) {
        return json({ error: "Password must be at least 6 characters" }, 400);
      }
      if (findByEmail(stored, email)) {
        return json({ error: "That email is already registered" }, 409);
      }

      const created = makeUser({ email, name, password, isadmin: body?.isadmin === true });
      await db.saveUsers([...stored, created]);
      return json(publicUser(created), 201);
    }

    if (req.method === "DELETE") {
      const id = new URL(req.url).searchParams.get("id");
      const target = stored.find((u) => u.id === id);

      if (!target) return json({ error: "User not found" }, 404);
      // Son admin silinirse panele bir daha kimse giremez.
      if (target.isadmin) return json({ error: "Admin users cannot be deleted" }, 403);

      await db.saveUsers(stored.filter((u) => u.id !== id));
      return json({ ok: true });
    }

    return json({ error: "Method not allowed" }, 405);
  }

  return { login, users };
}
