import Link from "next/link";

export default function ForbiddenPage() {
  return (
    <div style={{ minHeight: "100vh", display: "grid", placeItems: "center", padding: 24, fontFamily: "system-ui" }}>
      <div style={{ width: "min(520px, 100%)", border: "1px solid #ddd", borderRadius: 12, padding: 20, background: "#fff" }}>
        <h1 style={{ marginTop: 0 }}>Acceso denegado</h1>
        <p style={{ marginBottom: 14, color: "#4b5563" }}>Tu usuario no tiene permisos para ver esta pantalla.</p>
        <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
          <Link href="/" style={{ padding: "10px 12px", borderRadius: 8, border: "1px solid #111", textDecoration: "none", color: "#111" }}>
            Ir al inicio
          </Link>
          <Link href="/login" style={{ padding: "10px 12px", borderRadius: 8, border: "1px solid #ddd", textDecoration: "none", color: "#111" }}>
            Cambiar sesión
          </Link>
        </div>
      </div>
    </div>
  );
}

