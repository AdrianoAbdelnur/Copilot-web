"use client";

import { useEffect, useMemo, useState } from "react";

type UserItem = {
  _id: string;
  firstName: string;
  lastName: string;
  email: string;
  role: string;
  isDeleted?: boolean;
  validatedMail?: boolean;
  authorizedTransport?: boolean;
  createdAt?: string;
};

type UserForm = {
  firstName: string;
  lastName: string;
  email: string;
  password: string;
  role: string;
  validatedMail: boolean;
  authorizedTransport: boolean;
};

const ROLE_OPTIONS = ["user", "driver", "dispatcher", "manager", "admin", "superadmin"];

function roleLabel(role: string) {
  if (role === "user") return "usuario";
  if (role === "driver") return "chofer";
  if (role === "dispatcher") return "despachador";
  if (role === "manager") return "manager";
  if (role === "admin") return "admin";
  if (role === "superadmin") return "superadmin";
  return role;
}

function authHeaders(): HeadersInit {
  if (typeof window === "undefined") return {};
  const local = localStorage.getItem("token") || "";
  const cookieToken =
    document.cookie
      .split(";")
      .map((p) => p.trim())
      .find((p) => p.startsWith("token="))
      ?.split("=")[1] || "";
  const token = local || decodeURIComponent(cookieToken);
  return token ? { Authorization: token } : {};
}

function emptyForm(): UserForm {
  return {
    firstName: "",
    lastName: "",
    email: "",
    password: "",
    role: "user",
    validatedMail: false,
    authorizedTransport: false,
  };
}

export default function AdminPage() {
  const [tab, setTab] = useState<"users" | "roles">("users");
  const [items, setItems] = useState<UserItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [msg, setMsg] = useState("");
  const [error, setError] = useState("");

  const [search, setSearch] = useState("");
  const [roleFilter, setRoleFilter] = useState("");
  const [includeDeleted, setIncludeDeleted] = useState(false);
  const [page, setPage] = useState(1);
  const [limit, setLimit] = useState(20);
  const [total, setTotal] = useState(0);
  const [pagesCount, setPagesCount] = useState(1);

  const [createForm, setCreateForm] = useState<UserForm>(emptyForm());
  const [selectedId, setSelectedId] = useState("");
  const [editForm, setEditForm] = useState<UserForm>(emptyForm());
  const [editIsDeleted, setEditIsDeleted] = useState(false);
  const [confirmAction, setConfirmAction] = useState<null | "delete" | "restore">(null);

  const selectedUser = useMemo(() => items.find((u) => u._id === selectedId) || null, [items, selectedId]);

  const loadUsers = async (nextPage = page) => {
    setLoading(true);
    setMsg("");
    setError("");

    try {
      const params = new URLSearchParams();
      params.set("page", String(nextPage));
      params.set("limit", String(limit));
      if (search.trim()) params.set("search", search.trim());
      if (roleFilter.trim()) params.set("role", roleFilter.trim());
      if (includeDeleted) params.set("includeDeleted", "true");

      const res = await fetch(`/api/admin/users?${params.toString()}`, { headers: authHeaders() });
      const json = await res.json().catch(() => ({}));
      if (res.status === 401) {
        setError("Sesión no autenticada. Iniciá sesión nuevamente en /login.");
        setItems([]);
        return;
      }
      if (res.status === 403) {
        setError("Tu usuario no tiene permisos de admin para este panel.");
        setItems([]);
        return;
      }
      if (!res.ok || !json?.ok) {
        setError(json?.error || "No se pudo listar usuarios.");
        setItems([]);
        return;
      }

      setItems(json.items || []);
      setTotal(Number(json.total || 0));
      setPagesCount(Math.max(Number(json.pagesCount || 1), 1));
      setPage(Number(json.page || nextPage));
    } catch {
      setError("Error de red listando usuarios.");
    } finally {
      setLoading(false);
    }
  };

  const onSelectUser = (u: UserItem) => {
    setSelectedId(u._id);
    setEditForm({
      firstName: u.firstName || "",
      lastName: u.lastName || "",
      email: u.email || "",
      password: "",
      role: u.role || "user",
      validatedMail: Boolean(u.validatedMail),
      authorizedTransport: Boolean(u.authorizedTransport),
    });
    setEditIsDeleted(Boolean(u.isDeleted));
  };

  const createUser = async () => {
    setError("");
    setMsg("");

    if (!createForm.firstName || !createForm.lastName || !createForm.email || !createForm.password) {
      setError("Completá nombre, apellido, email y contraseña.");
      return;
    }

    const res = await fetch("/api/admin/users", {
      method: "POST",
      headers: { "Content-Type": "application/json", ...authHeaders() },
      body: JSON.stringify(createForm),
    });

    const json = await res.json().catch(() => ({}));
    if (!res.ok || !json?.ok) {
      setError(json?.error || "No se pudo crear usuario.");
      return;
    }

    setCreateForm(emptyForm());
    setMsg("Usuario creado.");
    await loadUsers(page);
  };

  const updateUser = async () => {
    if (!selectedId) return;

    setError("");
    setMsg("");

    const payload: Record<string, any> = {
      firstName: editForm.firstName,
      lastName: editForm.lastName,
      email: editForm.email,
      role: editForm.role,
      validatedMail: editForm.validatedMail,
      authorizedTransport: editForm.authorizedTransport,
      isDeleted: editIsDeleted,
    };

    if (editForm.password.trim()) payload.password = editForm.password;

    const res = await fetch(`/api/admin/users/${selectedId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json", ...authHeaders() },
      body: JSON.stringify(payload),
    });

    const json = await res.json().catch(() => ({}));
    if (!res.ok || !json?.ok) {
      setError(json?.error || "No se pudo actualizar usuario.");
      return;
    }

    setMsg("Usuario actualizado.");
    setEditForm((prev) => ({ ...prev, password: "" }));
    await loadUsers(page);
  };

  const softDeleteUser = async () => {
    if (!selectedId) return;

    setError("");
    setMsg("");

    const res = await fetch(`/api/admin/users/${selectedId}`, {
      method: "DELETE",
      headers: authHeaders(),
    });
    const json = await res.json().catch(() => ({}));
    if (!res.ok || !json?.ok) {
      setError(json?.error || "No se pudo eliminar usuario.");
      return;
    }

    setMsg("Usuario eliminado (borrado lógico).");
    await loadUsers(page);
  };

  const restoreUser = async () => {
    if (!selectedId) return;

    const res = await fetch(`/api/admin/users/${selectedId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json", ...authHeaders() },
      body: JSON.stringify({ isDeleted: false }),
    });
    const json = await res.json().catch(() => ({}));
    if (!res.ok || !json?.ok) {
      setError(json?.error || "No se pudo restaurar usuario.");
      return;
    }

    setMsg("Usuario restaurado.");
    setEditIsDeleted(false);
    await loadUsers();
  };

  useEffect(() => {
    loadUsers(1);
  }, []);

  return (
    <div style={{ padding: 20, fontFamily: "system-ui" }}>
      <h1 style={{ margin: 0 }}>Administración</h1>
      <div style={{ marginTop: 8, opacity: 0.8 }}>Panel de administración</div>

      <div style={{ display: "flex", gap: 8, marginTop: 12 }}>
        <button onClick={() => setTab("users")} style={{ padding: "8px 12px", borderRadius: 8, border: "1px solid #ddd", background: tab === "users" ? "#111" : "#fff", color: tab === "users" ? "#fff" : "#111" }}>
          Usuarios
        </button>
        <button onClick={() => setTab("roles")} style={{ padding: "8px 12px", borderRadius: 8, border: "1px solid #ddd", background: tab === "roles" ? "#111" : "#fff", color: tab === "roles" ? "#fff" : "#111" }}>
          Roles
        </button>
      </div>

      {tab === "roles" ? (
        <div style={{ marginTop: 14, border: "1px solid #ddd", borderRadius: 12, padding: 12 }}>
          <h2 style={{ marginTop: 0 }}>Gestión de Roles</h2>
          <div>Los roles se administran desde el editor de usuario en la pestaña Usuarios.</div>
          <div style={{ marginTop: 8, fontSize: 13, opacity: 0.8 }}>Roles sugeridos: {ROLE_OPTIONS.map(roleLabel).join(", ")}</div>
        </div>
      ) : null}

      {tab === "users" ? (
        <>
          <div style={{ marginTop: 14, border: "1px solid #ddd", borderRadius: 12, padding: 12 }}>
            <h2 style={{ marginTop: 0 }}>Filtros</h2>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 220px 180px auto", gap: 8, alignItems: "center" }}>
              <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Buscar por nombre o email" style={{ padding: 10, borderRadius: 8 }} />
              <select value={roleFilter} onChange={(e) => setRoleFilter(e.target.value)} style={{ padding: 10, borderRadius: 8 }}>
                <option value="">Todos los roles</option>
                {ROLE_OPTIONS.map((r) => (
                  <option key={r} value={r}>{roleLabel(r)}</option>
                ))}
              </select>
              <label style={{ display: "flex", alignItems: "center", gap: 6 }}>
                <input type="checkbox" checked={includeDeleted} onChange={(e) => setIncludeDeleted(e.target.checked)} />
                incluir eliminados
              </label>
              <button onClick={() => loadUsers(1)} disabled={loading} style={{ padding: "10px 12px", borderRadius: 8, border: "1px solid #ddd" }}>
                {loading ? "Cargando..." : "Aplicar"}
              </button>
            </div>
            <div style={{ display: "flex", gap: 8, alignItems: "center", marginTop: 8 }}>
              <span style={{ fontSize: 13, opacity: 0.8 }}>Por página:</span>
              <select
                value={String(limit)}
                onChange={(e) => {
                  const v = Number(e.target.value) || 20;
                  setLimit(v);
                  setTimeout(() => loadUsers(1), 0);
                }}
                style={{ padding: 8, borderRadius: 8 }}
              >
                <option value="10">10</option>
                <option value="20">20</option>
                <option value="50">50</option>
                <option value="100">100</option>
              </select>
              <span style={{ fontSize: 13, opacity: 0.8 }}>
                Total: {total} | Página {page} de {pagesCount}
              </span>
            </div>
          </div>

          <div style={{ display: "grid", gridTemplateColumns: "1.1fr 1fr", gap: 14, marginTop: 14 }}>
            <section style={{ border: "1px solid #ddd", borderRadius: 12, padding: 12 }}>
              <h2 style={{ marginTop: 0 }}>Usuarios</h2>
              <div style={{ maxHeight: 420, overflow: "auto", display: "grid", gap: 8 }}>
                {items.map((u) => (
                  <button key={u._id} onClick={() => onSelectUser(u)} style={{ textAlign: "left", padding: 10, borderRadius: 8, border: selectedId === u._id ? "1px solid #111" : "1px solid #ddd", background: selectedId === u._id ? "#f1f5f9" : "#fff", cursor: "pointer" }}>
                    <div style={{ fontWeight: 700 }}>{u.firstName} {u.lastName}</div>
                    <div style={{ fontSize: 12, opacity: 0.8 }}>{u.email}</div>
                    <div style={{ fontSize: 12, opacity: 0.8 }}>rol: {roleLabel(u.role)} {u.isDeleted ? "| eliminado" : ""}</div>
                  </button>
                ))}
                {items.length === 0 ? <div style={{ opacity: 0.7 }}>Sin usuarios.</div> : null}
              </div>
              <div style={{ display: "flex", gap: 8, marginTop: 8 }}>
                <button
                  onClick={() => loadUsers(Math.max(1, page - 1))}
                  disabled={loading || page <= 1}
                  style={{ padding: "8px 10px", borderRadius: 8 }}
                >
                  Anterior
                </button>
                <button
                  onClick={() => loadUsers(Math.min(pagesCount, page + 1))}
                  disabled={loading || page >= pagesCount}
                  style={{ padding: "8px 10px", borderRadius: 8 }}
                >
                  Siguiente
                </button>
              </div>
            </section>

            <section style={{ border: "1px solid #ddd", borderRadius: 12, padding: 12 }}>
              <h2 style={{ marginTop: 0 }}>Crear usuario</h2>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
                <input value={createForm.firstName} onChange={(e) => setCreateForm((p) => ({ ...p, firstName: e.target.value }))} placeholder="Nombre" style={{ padding: 10, borderRadius: 8 }} />
                <input value={createForm.lastName} onChange={(e) => setCreateForm((p) => ({ ...p, lastName: e.target.value }))} placeholder="Apellido" style={{ padding: 10, borderRadius: 8 }} />
                <input value={createForm.email} onChange={(e) => setCreateForm((p) => ({ ...p, email: e.target.value }))} placeholder="Email" style={{ padding: 10, borderRadius: 8 }} />
                <input type="password" value={createForm.password} onChange={(e) => setCreateForm((p) => ({ ...p, password: e.target.value }))} placeholder="Contraseña" style={{ padding: 10, borderRadius: 8 }} />
                <select value={createForm.role} onChange={(e) => setCreateForm((p) => ({ ...p, role: e.target.value }))} style={{ padding: 10, borderRadius: 8 }}>
                  {ROLE_OPTIONS.map((r) => <option key={r} value={r}>{roleLabel(r)}</option>)}
                </select>
                <div style={{ display: "flex", gap: 12, alignItems: "center" }}>
                  <label><input type="checkbox" checked={createForm.validatedMail} onChange={(e) => setCreateForm((p) => ({ ...p, validatedMail: e.target.checked }))} /> mail validado</label>
                  <label><input type="checkbox" checked={createForm.authorizedTransport} onChange={(e) => setCreateForm((p) => ({ ...p, authorizedTransport: e.target.checked }))} /> transporte autorizado</label>
                </div>
              </div>
              <button onClick={createUser} style={{ marginTop: 8, padding: "10px 12px", borderRadius: 8, border: "1px solid #111", background: "#111", color: "#fff" }}>
                Crear usuario
              </button>

              <h3 style={{ marginTop: 18 }}>Editar usuario</h3>
              {!selectedUser ? <div style={{ opacity: 0.7 }}>Seleccioná un usuario de la lista.</div> : null}
              {selectedUser ? (
                <>
                  <div style={{ fontSize: 12, opacity: 0.8, marginBottom: 6 }}>ID: {selectedUser._id}</div>
                  <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
                    <input value={editForm.firstName} onChange={(e) => setEditForm((p) => ({ ...p, firstName: e.target.value }))} placeholder="Nombre" style={{ padding: 10, borderRadius: 8 }} />
                    <input value={editForm.lastName} onChange={(e) => setEditForm((p) => ({ ...p, lastName: e.target.value }))} placeholder="Apellido" style={{ padding: 10, borderRadius: 8 }} />
                    <input value={editForm.email} onChange={(e) => setEditForm((p) => ({ ...p, email: e.target.value }))} placeholder="Email" style={{ padding: 10, borderRadius: 8 }} />
                    <input type="password" value={editForm.password} onChange={(e) => setEditForm((p) => ({ ...p, password: e.target.value }))} placeholder="Nueva contraseña (opcional)" style={{ padding: 10, borderRadius: 8 }} />
                    <select value={editForm.role} onChange={(e) => setEditForm((p) => ({ ...p, role: e.target.value }))} style={{ padding: 10, borderRadius: 8 }}>
                      {ROLE_OPTIONS.map((r) => <option key={r} value={r}>{roleLabel(r)}</option>)}
                    </select>
                    <div style={{ display: "flex", gap: 12, alignItems: "center" }}>
                      <label><input type="checkbox" checked={editForm.validatedMail} onChange={(e) => setEditForm((p) => ({ ...p, validatedMail: e.target.checked }))} /> mail validado</label>
                      <label><input type="checkbox" checked={editForm.authorizedTransport} onChange={(e) => setEditForm((p) => ({ ...p, authorizedTransport: e.target.checked }))} /> transporte autorizado</label>
                      <label><input type="checkbox" checked={editIsDeleted} onChange={(e) => setEditIsDeleted(e.target.checked)} /> eliminado</label>
                    </div>
                  </div>

                  <div style={{ display: "flex", gap: 8, marginTop: 8, flexWrap: "wrap" }}>
                    <button onClick={updateUser} style={{ padding: "10px 12px", borderRadius: 8, border: "1px solid #111", background: "#111", color: "#fff" }}>Guardar cambios</button>
                    <button onClick={() => setConfirmAction("delete")} style={{ padding: "10px 12px", borderRadius: 8, border: "1px solid #991b1b", background: "#991b1b", color: "#fff" }}>Eliminar (soft)</button>
                    <button onClick={() => setConfirmAction("restore")} style={{ padding: "10px 12px", borderRadius: 8, border: "1px solid #166534", background: "#166534", color: "#fff" }}>Restaurar</button>
                  </div>
                </>
              ) : null}
            </section>
          </div>

          {msg ? <div style={{ marginTop: 10, color: "#166534" }}>{msg}</div> : null}
          {error ? <div style={{ marginTop: 10, color: "#b91c1c" }}>{error}</div> : null}
        </>
      ) : null}
      {confirmAction ? (
        <div
          style={{
            position: "fixed",
            inset: 0,
            background: "rgba(0,0,0,0.35)",
            display: "grid",
            placeItems: "center",
            zIndex: 1000,
          }}
        >
          <div style={{ width: "min(460px, 92vw)", background: "#fff", borderRadius: 12, padding: 16, border: "1px solid #ddd" }}>
            <h3 style={{ marginTop: 0 }}>
              {confirmAction === "delete" ? "Confirmar eliminación" : "Confirmar restauración"}
            </h3>
            <div style={{ fontSize: 14, opacity: 0.85 }}>
              {confirmAction === "delete"
                ? "Se marcará el usuario como eliminado (borrado lógico)."
                : "Se reactivará el usuario removiendo el flag de eliminado."}
            </div>
            <div style={{ display: "flex", gap: 8, justifyContent: "flex-end", marginTop: 14 }}>
              <button onClick={() => setConfirmAction(null)} style={{ padding: "8px 10px", borderRadius: 8 }}>
                Cancelar
              </button>
              <button
                onClick={async () => {
                  if (confirmAction === "delete") await softDeleteUser();
                  if (confirmAction === "restore") await restoreUser();
                  setConfirmAction(null);
                }}
                style={{ padding: "8px 10px", borderRadius: 8, border: "1px solid #111", background: "#111", color: "#fff" }}
              >
                Confirmar
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}




