"use client";

import { useEffect, useState } from "react";
import { getAuthHeaders } from "@/lib/clientSession";

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
  memberships?: Array<{
    companyId?: string | { _id?: string; name?: string };
    tenantRole?: string;
    status?: string;
  }>;
};

type UserForm = {
  firstName: string;
  lastName: string;
  email: string;
  password: string;
  role: string;
  tenantRole: "member" | "dispatcher" | "manager" | "admin";
  validatedMail: boolean;
  authorizedTransport: boolean;
};

type CompanyItem = {
  _id: string;
  name: string;
  createdAt?: string;
};

type CompanyBrandingForm = {
  logoUrl: string;
  faviconUrl: string;
  appName: string;
  welcomeMessage: string;
  themeMode: "light" | "dark" | "auto";
  colors: {
    primary: string;
    secondary: string;
    accent: string;
    background: string;
    text: string;
  };
};

const ROLE_OPTIONS = ["user", "driver", "dispatcher", "manager", "admin", "superadmin"];
const TENANT_ROLE_OPTIONS: Array<UserForm["tenantRole"]> = ["member", "dispatcher", "manager", "admin"];

function roleLabel(role: string) {
  if (role === "user") return "usuario";
  if (role === "driver") return "chofer";
  if (role === "dispatcher") return "despachador";
  if (role === "manager") return "manager";
  if (role === "admin") return "admin";
  if (role === "superadmin") return "superadmin";
  return role;
}

function emptyForm(): UserForm {
  return {
    firstName: "",
    lastName: "",
    email: "",
    password: "",
    role: "user",
    tenantRole: "member",
    validatedMail: false,
    authorizedTransport: false,
  };
}

function emptyBrandingForm(): CompanyBrandingForm {
  return {
    logoUrl: "",
    faviconUrl: "",
    appName: "",
    welcomeMessage: "",
    themeMode: "auto",
    colors: {
      primary: "#0369A1",
      secondary: "#0F172A",
      accent: "#14B8A6",
      background: "#F1F5F9",
      text: "#0F172A",
    },
  };
}

export default function AdminPage() {
  const [tab, setTab] = useState<"users" | "roles" | "companies">("users");
  const [items, setItems] = useState<UserItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [msg, setMsg] = useState("");
  const [error, setError] = useState("");
  const [companyItems, setCompanyItems] = useState<CompanyItem[]>([]);
  const [companyLoading, setCompanyLoading] = useState(false);
  const [companyName, setCompanyName] = useState("");
  const [selectedCompanyId, setSelectedCompanyId] = useState("");
  const [brandingForm, setBrandingForm] = useState<CompanyBrandingForm>(emptyBrandingForm());
  const [brandingLoading, setBrandingLoading] = useState(false);
  const [assignableUsers, setAssignableUsers] = useState<UserItem[]>([]);
  const [assignableLoading, setAssignableLoading] = useState(false);
  const [selectedAssignUserId, setSelectedAssignUserId] = useState("");
  const [assignTenantRole, setAssignTenantRole] = useState<UserForm["tenantRole"]>("member");

  const [search, setSearch] = useState("");
  const [roleFilter, setRoleFilter] = useState("");
  const [companyFilter, setCompanyFilter] = useState("");
  const [includeDeleted, setIncludeDeleted] = useState(false);
  const [page, setPage] = useState(1);
  const [limit, setLimit] = useState(20);
  const [total, setTotal] = useState(0);
  const [pagesCount, setPagesCount] = useState(1);
  const [viewerIsSuperAdmin, setViewerIsSuperAdmin] = useState(false);

  const [createForm, setCreateForm] = useState<UserForm>(emptyForm());
  const [createCompanyId, setCreateCompanyId] = useState("");
  const [selectedId, setSelectedId] = useState("");
  const [editForm, setEditForm] = useState<UserForm>(emptyForm());
  const [editIsDeleted, setEditIsDeleted] = useState(false);
  const [confirmAction, setConfirmAction] = useState<null | "delete" | "restore">(null);
  const [userModal, setUserModal] = useState<{ open: boolean; mode: "create" | "edit" }>({
    open: false,
    mode: "create",
  });

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
      if (companyFilter.trim()) params.set("companyId", companyFilter.trim());
      if (includeDeleted) params.set("includeDeleted", "true");

      const res = await fetch(`/api/admin/users?${params.toString()}`, { headers: getAuthHeaders() });
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
      setViewerIsSuperAdmin(Boolean(json?.viewer?.isSuperAdmin));
    } catch {
      setError("Error de red listando usuarios.");
    } finally {
      setLoading(false);
    }
  };

  const companyLabelsForUser = (u: UserItem): string[] => {
    const raw = Array.isArray(u.memberships) ? u.memberships : [];
    const labels: string[] = [];
    for (const m of raw) {
      if (!m || String(m.status || "active").toLowerCase() === "inactive") continue;
      const companyId = m.companyId;
      if (typeof companyId === "string" && companyId.trim()) {
        labels.push(companyId.trim());
        continue;
      }
      const name = typeof companyId === "object" && companyId ? String(companyId.name || "").trim() : "";
      const id = typeof companyId === "object" && companyId ? String(companyId._id || "").trim() : "";
      labels.push(name || id);
    }
    return Array.from(new Set(labels.filter(Boolean)));
  };

  const onSelectUser = (u: UserItem) => {
    setSelectedId(u._id);
    setEditForm({
      firstName: u.firstName || "",
      lastName: u.lastName || "",
      email: u.email || "",
      password: "",
      role: u.role || "user",
      tenantRole: "member",
      validatedMail: Boolean(u.validatedMail),
      authorizedTransport: Boolean(u.authorizedTransport),
    });
    setEditIsDeleted(Boolean(u.isDeleted));
  };

  const openCreateUserModal = () => {
    setCreateForm(emptyForm());
    if (viewerIsSuperAdmin) {
      setCreateCompanyId((prev) => prev || companyItems[0]?._id || "");
    }
    setUserModal({ open: true, mode: "create" });
  };

  const openEditUserModal = (u: UserItem) => {
    onSelectUser(u);
    setUserModal({ open: true, mode: "edit" });
  };

  const closeUserModal = () => {
    setUserModal((prev) => ({ ...prev, open: false }));
  };

  const loadCompanies = async (options?: { silentForbidden?: boolean }) => {
    setCompanyLoading(true);
    setError("");
    setMsg("");

    try {
      const res = await fetch("/api/companies", { headers: getAuthHeaders() });
      const json = await res.json().catch(() => ({}));
      if (res.status === 401) {
        setError("Sesion no autenticada. Inicia sesion nuevamente en /login.");
        setCompanyItems([]);
        return;
      }
      if (res.status === 403) {
        if (!options?.silentForbidden) {
          setError("Tu usuario no tiene permisos de admin para crear companias.");
        }
        setCompanyItems([]);
        return;
      }
      if (!res.ok || !json?.ok) {
        setError(json?.error || "No se pudo listar companias.");
        setCompanyItems([]);
        return;
      }
      const nextItems = (json.items || []) as CompanyItem[];
      setCompanyItems(nextItems);
      if (nextItems.length && !selectedCompanyId) {
        setSelectedCompanyId(nextItems[0]._id);
      }
      if (!nextItems.length) {
        setSelectedCompanyId("");
        setBrandingForm(emptyBrandingForm());
      }
    } catch {
      setError("Error de red listando companias.");
      setCompanyItems([]);
    } finally {
      setCompanyLoading(false);
    }
  };

  const createCompany = async () => {
    setError("");
    setMsg("");
    const name = companyName.trim();
    if (!name) {
      setError("Ingresa un nombre de compania.");
      return;
    }

    setCompanyLoading(true);
    try {
      const res = await fetch("/api/companies", {
        method: "POST",
        headers: { "Content-Type": "application/json", ...getAuthHeaders() },
        body: JSON.stringify({ name }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok || !json?.ok) {
        setError(json?.error || "No se pudo crear la compania.");
        return;
      }

      setCompanyName("");
      if (json?.item?._id) {
        setSelectedCompanyId(String(json.item._id));
      }
      setMsg("Compania creada.");
      await loadCompanies();
    } catch {
      setError("Error de red creando compania.");
    } finally {
      setCompanyLoading(false);
    }
  };

  const loadCompanyBranding = async (companyId: string) => {
    if (!companyId) return;
    setBrandingLoading(true);
    setError("");
    setMsg("");
    try {
      const res = await fetch(`/api/admin/companies/${companyId}/branding`, {
        headers: getAuthHeaders(),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok || !json?.ok || !json?.item) {
        setError(json?.error || "No se pudo cargar el branding de la compania.");
        setBrandingForm(emptyBrandingForm());
        return;
      }
      const item = json.item as CompanyBrandingForm;
      setBrandingForm({
        logoUrl: item.logoUrl || "",
        faviconUrl: item.faviconUrl || "",
        appName: item.appName || "",
        welcomeMessage: item.welcomeMessage || "",
        themeMode: item.themeMode || "auto",
        colors: {
          primary: item.colors?.primary || "#0369A1",
          secondary: item.colors?.secondary || "#0F172A",
          accent: item.colors?.accent || "#14B8A6",
          background: item.colors?.background || "#F1F5F9",
          text: item.colors?.text || "#0F172A",
        },
      });
    } catch {
      setError("Error de red cargando branding.");
      setBrandingForm(emptyBrandingForm());
    } finally {
      setBrandingLoading(false);
    }
  };

  const saveCompanyBranding = async () => {
    if (!selectedCompanyId) {
      setError("Selecciona una compania.");
      return;
    }
    setBrandingLoading(true);
    setError("");
    setMsg("");
    try {
      const payload = {
        logoUrl: brandingForm.logoUrl.trim(),
        faviconUrl: brandingForm.faviconUrl.trim(),
        appName: brandingForm.appName.trim(),
        welcomeMessage: brandingForm.welcomeMessage.trim(),
        themeMode: brandingForm.themeMode,
        colors: {
          primary: brandingForm.colors.primary.toUpperCase(),
          secondary: brandingForm.colors.secondary.toUpperCase(),
          accent: brandingForm.colors.accent.toUpperCase(),
          background: brandingForm.colors.background.toUpperCase(),
          text: brandingForm.colors.text.toUpperCase(),
        },
      };
      const res = await fetch(`/api/admin/companies/${selectedCompanyId}/branding`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json", ...getAuthHeaders() },
        body: JSON.stringify(payload),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok || !json?.ok || !json?.item) {
        setError(json?.error || "No se pudo guardar el branding.");
        return;
      }
      setMsg("Branding guardado.");
      const item = json.item as CompanyBrandingForm;
      setBrandingForm({
        logoUrl: item.logoUrl || "",
        faviconUrl: item.faviconUrl || "",
        appName: item.appName || "",
        welcomeMessage: item.welcomeMessage || "",
        themeMode: item.themeMode || "auto",
        colors: {
          primary: item.colors?.primary || "#0369A1",
          secondary: item.colors?.secondary || "#0F172A",
          accent: item.colors?.accent || "#14B8A6",
          background: item.colors?.background || "#F1F5F9",
          text: item.colors?.text || "#0F172A",
        },
      });
    } catch {
      setError("Error de red guardando branding.");
    } finally {
      setBrandingLoading(false);
    }
  };

  const loadAssignableUsers = async () => {
    setAssignableLoading(true);
    try {
      const params = new URLSearchParams();
      params.set("page", "1");
      params.set("limit", "200");
      params.set("includeDeleted", "true");
      const res = await fetch(`/api/admin/users?${params.toString()}`, { headers: getAuthHeaders() });
      const json = await res.json().catch(() => ({}));
      if (!res.ok || !json?.ok) {
        setAssignableUsers([]);
        return;
      }
      const nextItems = (json.items || []) as UserItem[];
      setAssignableUsers(nextItems);
      if (nextItems.length && !selectedAssignUserId) {
        setSelectedAssignUserId(nextItems[0]._id);
      }
    } catch {
      setAssignableUsers([]);
    } finally {
      setAssignableLoading(false);
    }
  };

  const assignUserToCompany = async () => {
    if (!selectedCompanyId) {
      setError("Selecciona una compania.");
      return;
    }
    if (!selectedAssignUserId) {
      setError("Selecciona un usuario a asignar.");
      return;
    }

    setError("");
    setMsg("");
    setAssignableLoading(true);
    try {
      const currentRes = await fetch(`/api/admin/memberships?userId=${selectedAssignUserId}`, {
        headers: getAuthHeaders(),
      });
      const currentJson = await currentRes.json().catch(() => ({}));
      if (!currentRes.ok || !currentJson?.ok || !currentJson?.item) {
        setError(currentJson?.error || "No se pudieron leer las membresias del usuario.");
        return;
      }

      const currentMemberships = Array.isArray(currentJson.item.memberships)
        ? (currentJson.item.memberships as Array<Record<string, unknown>>)
        : [];

      const map = new Map<string, { companyId: string; tenantRole: string; status: "active" | "inactive" }>();
      for (const row of currentMemberships) {
        const companyId = String(row.companyId || "").trim();
        if (!companyId) continue;
        const tenantRole = String(row.tenantRole || "member").trim().toLowerCase();
        const status = String(row.status || "active").trim().toLowerCase() === "inactive" ? "inactive" : "active";
        map.set(companyId, { companyId, tenantRole, status });
      }
      map.set(selectedCompanyId, {
        companyId: selectedCompanyId,
        tenantRole: assignTenantRole,
        status: "active",
      });

      const payload = {
        userId: selectedAssignUserId,
        defaultCompanyId: selectedCompanyId,
        memberships: [...map.values()],
      };

      const patchRes = await fetch("/api/admin/memberships", {
        method: "PATCH",
        headers: { "Content-Type": "application/json", ...getAuthHeaders() },
        body: JSON.stringify(payload),
      });
      const patchJson = await patchRes.json().catch(() => ({}));
      if (!patchRes.ok || !patchJson?.ok) {
        setError(patchJson?.error || "No se pudo asignar el usuario a la compania.");
        return;
      }

      setMsg("Usuario asignado a la compania.");
      await loadAssignableUsers();
    } catch {
      setError("Error de red asignando usuario a compania.");
    } finally {
      setAssignableLoading(false);
    }
  };

  const createUser = async () => {
    setError("");
    setMsg("");

    if (!createForm.firstName || !createForm.lastName || !createForm.email || !createForm.password) {
      setError("Completá nombre, apellido, email y contraseña.");
      return;
    }

    const payload: Record<string, unknown> = { ...createForm };
    if (viewerIsSuperAdmin) {
      if (!createCompanyId) {
        setError("Selecciona la compania para el nuevo usuario.");
        return;
      }
      payload.defaultCompanyId = createCompanyId;
      payload.memberships = [
        {
          companyId: createCompanyId,
          tenantRole: createForm.tenantRole,
          status: "active",
        },
      ];
    }

    const res = await fetch("/api/admin/users", {
      method: "POST",
      headers: { "Content-Type": "application/json", ...getAuthHeaders() },
      body: JSON.stringify(payload),
    });

    const json = await res.json().catch(() => ({}));
    if (!res.ok || !json?.ok) {
      setError(json?.error || "No se pudo crear usuario.");
      return;
    }

    setCreateForm(emptyForm());
    setCreateCompanyId("");
    setMsg("Usuario creado.");
    closeUserModal();
    await loadUsers(page);
  };

  const updateUser = async (targetId?: string) => {
    const userId = targetId || selectedId;
    if (!userId) return;

    setError("");
    setMsg("");

    const payload: {
      firstName: string;
      lastName: string;
      email: string;
      role: string;
      validatedMail: boolean;
      authorizedTransport: boolean;
      isDeleted: boolean;
      password?: string;
    } = {
      firstName: editForm.firstName,
      lastName: editForm.lastName,
      email: editForm.email,
      role: editForm.role,
      validatedMail: editForm.validatedMail,
      authorizedTransport: editForm.authorizedTransport,
      isDeleted: editIsDeleted,
    };

    if (editForm.password.trim()) payload.password = editForm.password;

    const res = await fetch(`/api/admin/users/${userId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json", ...getAuthHeaders() },
      body: JSON.stringify(payload),
    });

    const json = await res.json().catch(() => ({}));
    if (!res.ok || !json?.ok) {
      setError(json?.error || "No se pudo actualizar usuario.");
      return;
    }

    setMsg("Usuario actualizado.");
    setEditForm((prev) => ({ ...prev, password: "" }));
    closeUserModal();
    await loadUsers(page);
  };

  const softDeleteUser = async (targetId?: string) => {
    const userId = targetId || selectedId;
    if (!userId) return;

    setError("");
    setMsg("");

    const res = await fetch(`/api/admin/users/${userId}`, {
      method: "DELETE",
      headers: getAuthHeaders(),
    });
    const json = await res.json().catch(() => ({}));
    if (!res.ok || !json?.ok) {
      setError(json?.error || "No se pudo eliminar usuario.");
      return;
    }

    setMsg("Usuario eliminado (borrado lógico).");
    await loadUsers(page);
  };

  const restoreUser = async (targetId?: string) => {
    const userId = targetId || selectedId;
    if (!userId) return;

    const res = await fetch(`/api/admin/users/${userId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json", ...getAuthHeaders() },
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

  useEffect(() => {
    if (tab === "companies") {
      loadCompanies();
      loadAssignableUsers();
      return;
    }
    if (tab === "users" && viewerIsSuperAdmin) {
      loadCompanies({ silentForbidden: true });
    }
  }, [tab, viewerIsSuperAdmin]);

  useEffect(() => {
    if (tab !== "companies") return;
    if (!selectedCompanyId) return;
    void loadCompanyBranding(selectedCompanyId);
  }, [selectedCompanyId, tab]);

  const fieldStyle = {
    padding: 10,
    borderRadius: 8,
    border: "1px solid #64748b",
    background: "#1f2937",
    color: "#e2e8f0",
  };
  const optionStyle = {
    background: "#0f172a",
    color: "#e2e8f0",
  };

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
        <button onClick={() => setTab("companies")} style={{ padding: "8px 12px", borderRadius: 8, border: "1px solid #ddd", background: tab === "companies" ? "#111" : "#fff", color: tab === "companies" ? "#fff" : "#111" }}>
          Companias
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
            <div style={{ display: "grid", gridTemplateColumns: viewerIsSuperAdmin ? "1fr 200px 220px 180px auto" : "1fr 220px 180px auto", gap: 8, alignItems: "center" }}>
              <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Buscar por nombre o email" style={fieldStyle} />
              <select value={roleFilter} onChange={(e) => setRoleFilter(e.target.value)} style={fieldStyle}>
                <option value="" style={optionStyle}>Todos los roles</option>
                {ROLE_OPTIONS.map((r) => (
                  <option key={r} value={r} style={optionStyle}>{roleLabel(r)}</option>
                ))}
              </select>
              {viewerIsSuperAdmin ? (
                <select value={companyFilter} onChange={(e) => setCompanyFilter(e.target.value)} style={fieldStyle}>
                  <option value="" style={optionStyle}>Todas las companias</option>
                  {companyItems.map((c) => (
                    <option key={c._id} value={c._id} style={optionStyle}>{c.name}</option>
                  ))}
                </select>
              ) : null}
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
                style={{ ...fieldStyle, padding: 8 }}
              >
                <option value="10" style={optionStyle}>10</option>
                <option value="20" style={optionStyle}>20</option>
                <option value="50" style={optionStyle}>50</option>
                <option value="100" style={optionStyle}>100</option>
              </select>
              <span style={{ fontSize: 13, opacity: 0.8 }}>
                Total: {total} | Página {page} de {pagesCount}
              </span>
              <button
                onClick={openCreateUserModal}
                style={{ marginLeft: "auto", padding: "8px 10px", borderRadius: 8, border: "1px solid #111", background: "#111", color: "#fff" }}
              >
                Crear usuario
              </button>
            </div>
          </div>

          <section style={{ border: "1px solid #ddd", borderRadius: 12, padding: 12, marginTop: 14 }}>
            <h2 style={{ marginTop: 0 }}>Usuarios</h2>
            <div style={{ maxHeight: 520, overflow: "auto", display: "grid", gap: 8 }}>
              {items.map((u) => (
                <div
                  key={u._id}
                  style={{
                    textAlign: "left",
                    padding: 10,
                    borderRadius: 8,
                    border: "1px solid var(--border)",
                    background: "var(--surface)",
                    color: "var(--foreground)",
                  }}
                >
                  <div style={{ display: "flex", justifyContent: "space-between", gap: 12, alignItems: "flex-start" }}>
                    <div style={{ minWidth: 0, flex: 1 }}>
                      <div style={{ fontWeight: 700, color: "var(--foreground)" }}>{u.firstName} {u.lastName}</div>
                      <div style={{ fontSize: 12, color: "var(--muted)" }}>{u.email}</div>
                      <div style={{ fontSize: 12, color: "var(--muted)" }}>rol: {roleLabel(u.role)} {u.isDeleted ? "| eliminado" : ""}</div>
                      {viewerIsSuperAdmin ? (
                        <div style={{ marginTop: 6, display: "flex", gap: 6, flexWrap: "wrap" }}>
                          {companyLabelsForUser(u).length ? (
                            companyLabelsForUser(u).map((label) => (
                              <span
                                key={`${u._id}-${label}`}
                                style={{
                                  fontSize: 11,
                                  padding: "2px 8px",
                                  borderRadius: 999,
                                  border: "1px solid var(--border)",
                                  background: "var(--background)",
                                  color: "var(--foreground)",
                                }}
                              >
                                {label}
                              </span>
                            ))
                          ) : (
                            <span style={{ fontSize: 11, color: "var(--muted)" }}>sin compania</span>
                          )}
                        </div>
                      ) : null}
                    </div>
                    <div style={{ display: "flex", gap: 8, marginLeft: "auto", flexShrink: 0 }}>
                      <button onClick={() => openEditUserModal(u)} style={{ padding: "8px 10px", borderRadius: 8, border: "1px solid #111", background: "#111", color: "#fff" }}>
                        Editar
                      </button>
                      {u.isDeleted ? (
                        <button
                          onClick={async () => {
                            setSelectedId(u._id);
                            await restoreUser(u._id);
                          }}
                          style={{ padding: "8px 10px", borderRadius: 8, border: "1px solid #166534", background: "#166534", color: "#fff" }}
                        >
                          Restaurar
                        </button>
                      ) : (
                        <button
                          onClick={() => {
                            setSelectedId(u._id);
                            setConfirmAction("delete");
                          }}
                          style={{ padding: "8px 10px", borderRadius: 8, border: "1px solid #991b1b", background: "#991b1b", color: "#fff" }}
                        >
                          Eliminar
                        </button>
                      )}
                    </div>
                  </div>
                </div>
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

          {msg ? <div style={{ marginTop: 10, color: "#166534" }}>{msg}</div> : null}
          {error ? <div style={{ marginTop: 10, color: "#b91c1c" }}>{error}</div> : null}
        </>
      ) : null}
      {tab === "companies" ? (
        <div style={{ marginTop: 14, border: "1px solid #ddd", borderRadius: 12, padding: 12 }}>
          <h2 style={{ marginTop: 0 }}>Companias</h2>
          <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
            <input
              value={companyName}
              onChange={(e) => setCompanyName(e.target.value)}
              placeholder="Nombre de compania"
              style={{ ...fieldStyle, minWidth: 280 }}
            />
            <button
              onClick={createCompany}
              disabled={companyLoading}
              style={{ padding: "10px 12px", borderRadius: 8, border: "1px solid #111", background: "#111", color: "#fff" }}
            >
              Crear compania
            </button>
            <button
              onClick={() => void loadCompanies()}
              disabled={companyLoading}
              style={{ padding: "10px 12px", borderRadius: 8, border: "1px solid #ddd" }}
            >
              {companyLoading ? "Cargando..." : "Refrescar"}
            </button>
          </div>

          <div style={{ marginTop: 14, borderTop: "1px solid #eee", paddingTop: 10 }}>
            <div style={{ fontSize: 13, opacity: 0.8, marginBottom: 8 }}>
              Total: {companyItems.length}
            </div>
            <div style={{ display: "grid", gap: 8 }}>
              {companyItems.map((c) => (
                <button
                  key={c._id}
                  onClick={() => setSelectedCompanyId(c._id)}
                  style={{
                    border: selectedCompanyId === c._id ? "1px solid #38bdf8" : "1px solid #475569",
                    borderRadius: 8,
                    padding: 10,
                    background: selectedCompanyId === c._id ? "#1e3a5f" : "#0f172a",
                    color: "#e2e8f0",
                    textAlign: "left",
                    cursor: "pointer",
                  }}
                >
                  <div style={{ fontWeight: 700, color: "#e2e8f0" }}>{c.name}</div>
                  <div style={{ fontSize: 12, color: "#94a3b8" }}>ID: {c._id}</div>
                </button>
              ))}
              {companyItems.length === 0 ? <div style={{ opacity: 0.7 }}>Sin companias.</div> : null}
            </div>
          </div>

          {selectedCompanyId ? (
            <div style={{ marginTop: 14, borderTop: "1px solid #eee", paddingTop: 10 }}>
              <h3 style={{ marginTop: 0 }}>Asignar usuario a compania</h3>
              <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap", marginBottom: 10 }}>
                <select
                  value={selectedAssignUserId}
                  onChange={(e) => setSelectedAssignUserId(e.target.value)}
                  style={{ ...fieldStyle, minWidth: 280 }}
                >
                  {assignableUsers.map((u) => (
                    <option key={u._id} value={u._id} style={optionStyle}>
                      {u.firstName} {u.lastName} - {u.email}
                    </option>
                  ))}
                </select>
                <select
                  value={assignTenantRole}
                  onChange={(e) => setAssignTenantRole(e.target.value as UserForm["tenantRole"])}
                  style={fieldStyle}
                >
                  {TENANT_ROLE_OPTIONS.map((r) => (
                    <option key={r} value={r} style={optionStyle}>{r}</option>
                  ))}
                </select>
                <button
                  onClick={assignUserToCompany}
                  disabled={assignableLoading}
                  style={{ padding: "10px 12px", borderRadius: 8, border: "1px solid #111", background: "#111", color: "#fff" }}
                >
                  {assignableLoading ? "Asignando..." : "Asignar"}
                </button>
                <button
                  onClick={loadAssignableUsers}
                  disabled={assignableLoading}
                  style={{ padding: "10px 12px", borderRadius: 8, border: "1px solid #ddd" }}
                >
                  Refrescar usuarios
                </button>
              </div>

              <h3 style={{ marginTop: 0 }}>Branding de compania</h3>
              <div style={{ fontSize: 12, opacity: 0.8, marginBottom: 8 }}>Company ID: {selectedCompanyId}</div>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
                <input
                  value={brandingForm.appName}
                  onChange={(e) => setBrandingForm((p) => ({ ...p, appName: e.target.value }))}
                  placeholder="Nombre de app (opcional)"
                  style={fieldStyle}
                />
                <select
                  value={brandingForm.themeMode}
                  onChange={(e) =>
                    setBrandingForm((p) => ({ ...p, themeMode: e.target.value as CompanyBrandingForm["themeMode"] }))
                  }
                  style={fieldStyle}
                >
                  <option value="auto" style={optionStyle}>auto</option>
                  <option value="light" style={optionStyle}>light</option>
                  <option value="dark" style={optionStyle}>dark</option>
                </select>
                <input
                  value={brandingForm.logoUrl}
                  onChange={(e) => setBrandingForm((p) => ({ ...p, logoUrl: e.target.value }))}
                  placeholder="Logo URL"
                  style={fieldStyle}
                />
                <input
                  value={brandingForm.faviconUrl}
                  onChange={(e) => setBrandingForm((p) => ({ ...p, faviconUrl: e.target.value }))}
                  placeholder="Favicon URL"
                  style={fieldStyle}
                />
                <input
                  value={brandingForm.welcomeMessage}
                  onChange={(e) => setBrandingForm((p) => ({ ...p, welcomeMessage: e.target.value }))}
                  placeholder="Mensaje de bienvenida"
                  style={{ ...fieldStyle, gridColumn: "1 / span 2" }}
                />
              </div>

              <div style={{ display: "grid", gridTemplateColumns: "repeat(5, minmax(120px, 1fr))", gap: 8, marginTop: 8 }}>
                <input
                  value={brandingForm.colors.primary}
                  onChange={(e) =>
                    setBrandingForm((p) => ({ ...p, colors: { ...p.colors, primary: e.target.value } }))
                  }
                  placeholder="#RRGGBB"
                  title="primary"
                  style={fieldStyle}
                />
                <input
                  value={brandingForm.colors.secondary}
                  onChange={(e) =>
                    setBrandingForm((p) => ({ ...p, colors: { ...p.colors, secondary: e.target.value } }))
                  }
                  placeholder="#RRGGBB"
                  title="secondary"
                  style={fieldStyle}
                />
                <input
                  value={brandingForm.colors.accent}
                  onChange={(e) =>
                    setBrandingForm((p) => ({ ...p, colors: { ...p.colors, accent: e.target.value } }))
                  }
                  placeholder="#RRGGBB"
                  title="accent"
                  style={fieldStyle}
                />
                <input
                  value={brandingForm.colors.background}
                  onChange={(e) =>
                    setBrandingForm((p) => ({ ...p, colors: { ...p.colors, background: e.target.value } }))
                  }
                  placeholder="#RRGGBB"
                  title="background"
                  style={fieldStyle}
                />
                <input
                  value={brandingForm.colors.text}
                  onChange={(e) =>
                    setBrandingForm((p) => ({ ...p, colors: { ...p.colors, text: e.target.value } }))
                  }
                  placeholder="#RRGGBB"
                  title="text"
                  style={fieldStyle}
                />
              </div>

              <div style={{ display: "flex", gap: 8, marginTop: 10 }}>
                <button
                  onClick={saveCompanyBranding}
                  disabled={brandingLoading}
                  style={{ padding: "10px 12px", borderRadius: 8, border: "1px solid #111", background: "#111", color: "#fff" }}
                >
                  {brandingLoading ? "Guardando..." : "Guardar branding"}
                </button>
                <button
                  onClick={() => void loadCompanyBranding(selectedCompanyId)}
                  disabled={brandingLoading}
                  style={{ padding: "10px 12px", borderRadius: 8, border: "1px solid #ddd" }}
                >
                  Recargar branding
                </button>
              </div>
            </div>
          ) : null}
          {msg ? <div style={{ marginTop: 10, color: "#166534" }}>{msg}</div> : null}
          {error ? <div style={{ marginTop: 10, color: "#b91c1c" }}>{error}</div> : null}
        </div>
      ) : null}
      {userModal.open ? (
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
          <div style={{ width: "min(760px, 92vw)", background: "var(--surface)", borderRadius: 12, padding: 16, border: "1px solid var(--border)" }}>
            <h3 style={{ marginTop: 0 }}>{userModal.mode === "create" ? "Crear usuario" : "Editar usuario"}</h3>

            {userModal.mode === "create" ? (
              <>
                {viewerIsSuperAdmin ? (
                  <div style={{ marginBottom: 8 }}>
                    <div style={{ fontSize: 12, color: "#94a3b8", marginBottom: 4 }}>Compania asignada</div>
                    <select
                      value={createCompanyId}
                      onChange={(e) => setCreateCompanyId(e.target.value)}
                      style={{ ...fieldStyle, width: "100%" }}
                    >
                      <option value="" style={optionStyle}>Seleccionar compania...</option>
                      {companyItems.map((c) => (
                        <option key={c._id} value={c._id} style={optionStyle}>{c.name}</option>
                      ))}
                    </select>
                  </div>
                ) : null}
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
                  <input value={createForm.firstName} onChange={(e) => setCreateForm((p) => ({ ...p, firstName: e.target.value }))} placeholder="Nombre" style={fieldStyle} />
                  <input value={createForm.lastName} onChange={(e) => setCreateForm((p) => ({ ...p, lastName: e.target.value }))} placeholder="Apellido" style={fieldStyle} />
                  <input value={createForm.email} onChange={(e) => setCreateForm((p) => ({ ...p, email: e.target.value }))} placeholder="Email" style={fieldStyle} />
                  <input type="password" value={createForm.password} onChange={(e) => setCreateForm((p) => ({ ...p, password: e.target.value }))} placeholder="Contraseña" style={fieldStyle} />
                  <select value={createForm.role} onChange={(e) => setCreateForm((p) => ({ ...p, role: e.target.value }))} style={fieldStyle}>
                    {ROLE_OPTIONS.map((r) => <option key={r} value={r} style={optionStyle}>{roleLabel(r)}</option>)}
                  </select>
                  <select value={createForm.tenantRole} onChange={(e) => setCreateForm((p) => ({ ...p, tenantRole: e.target.value as UserForm["tenantRole"] }))} style={fieldStyle}>
                    {TENANT_ROLE_OPTIONS.map((r) => <option key={r} value={r} style={optionStyle}>tenant: {r}</option>)}
                  </select>
                </div>
                <div style={{ display: "flex", gap: 12, alignItems: "center", marginTop: 8 }}>
                  <label><input type="checkbox" checked={createForm.validatedMail} onChange={(e) => setCreateForm((p) => ({ ...p, validatedMail: e.target.checked }))} /> mail validado</label>
                  <label><input type="checkbox" checked={createForm.authorizedTransport} onChange={(e) => setCreateForm((p) => ({ ...p, authorizedTransport: e.target.checked }))} /> transporte autorizado</label>
                </div>
                <div style={{ display: "flex", gap: 8, justifyContent: "flex-end", marginTop: 14 }}>
                  <button onClick={closeUserModal} style={{ padding: "8px 10px", borderRadius: 8 }}>Cancelar</button>
                  <button onClick={createUser} style={{ padding: "8px 10px", borderRadius: 8, border: "1px solid #111", background: "#111", color: "#fff" }}>Crear usuario</button>
                </div>
              </>
            ) : (
              <>
                <div style={{ fontSize: 12, opacity: 0.8, marginBottom: 6 }}>ID: {selectedId || "-"}</div>
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
                  <input value={editForm.firstName} onChange={(e) => setEditForm((p) => ({ ...p, firstName: e.target.value }))} placeholder="Nombre" style={fieldStyle} />
                  <input value={editForm.lastName} onChange={(e) => setEditForm((p) => ({ ...p, lastName: e.target.value }))} placeholder="Apellido" style={fieldStyle} />
                  <input value={editForm.email} onChange={(e) => setEditForm((p) => ({ ...p, email: e.target.value }))} placeholder="Email" style={fieldStyle} />
                  <input type="password" value={editForm.password} onChange={(e) => setEditForm((p) => ({ ...p, password: e.target.value }))} placeholder="Nueva contraseña (opcional)" style={fieldStyle} />
                  <select value={editForm.role} onChange={(e) => setEditForm((p) => ({ ...p, role: e.target.value }))} style={fieldStyle}>
                    {ROLE_OPTIONS.map((r) => <option key={r} value={r} style={optionStyle}>{roleLabel(r)}</option>)}
                  </select>
                  <div style={{ display: "flex", gap: 12, alignItems: "center" }}>
                    <label><input type="checkbox" checked={editForm.validatedMail} onChange={(e) => setEditForm((p) => ({ ...p, validatedMail: e.target.checked }))} /> mail validado</label>
                    <label><input type="checkbox" checked={editForm.authorizedTransport} onChange={(e) => setEditForm((p) => ({ ...p, authorizedTransport: e.target.checked }))} /> transporte autorizado</label>
                    <label><input type="checkbox" checked={editIsDeleted} onChange={(e) => setEditIsDeleted(e.target.checked)} /> eliminado</label>
                  </div>
                </div>
                <div style={{ display: "flex", gap: 8, justifyContent: "flex-end", marginTop: 14 }}>
                  <button onClick={closeUserModal} style={{ padding: "8px 10px", borderRadius: 8 }}>Cancelar</button>
                  <button onClick={() => updateUser(selectedId)} style={{ padding: "8px 10px", borderRadius: 8, border: "1px solid #111", background: "#111", color: "#fff" }}>Guardar cambios</button>
                </div>
              </>
            )}
          </div>
        </div>
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





