"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

export default function RegisterPage() {
  const router = useRouter();
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [ok, setOk] = useState<string | null>(null);

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setOk(null);
    setLoading(true);

    try {
      const res = await fetch("/api/auth/register", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ firstName, lastName, email, password }),
      });

      const data = await res.json();

      if (!res.ok) {
        setError(data?.message || "Error al registrarse");
        return;
      }

      setOk("Cuenta creada. Ahora podés iniciar sesión.");
      setTimeout(() => router.push("/login"), 600);
    } catch {
      setError("Error de red");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={{ maxWidth: 420, margin: "40px auto", padding: 16 }}>
      <h1 style={{ fontSize: 28, fontWeight: 700, marginBottom: 16 }}>Crear cuenta</h1>

      <form onSubmit={onSubmit} style={{ display: "flex", flexDirection: "column", gap: 10 }}>
        <input value={firstName} onChange={(e) => setFirstName(e.target.value)} placeholder="Nombre" style={{ padding: 12, borderRadius: 10, border: "1px solid #333" }} />
        <input value={lastName} onChange={(e) => setLastName(e.target.value)} placeholder="Apellido" style={{ padding: 12, borderRadius: 10, border: "1px solid #333" }} />
        <input value={email} onChange={(e) => setEmail(e.target.value)} placeholder="Email" type="email" autoComplete="email" style={{ padding: 12, borderRadius: 10, border: "1px solid #333" }} />
        <input value={password} onChange={(e) => setPassword(e.target.value)} placeholder="Contraseña" type="password" autoComplete="new-password" style={{ padding: 12, borderRadius: 10, border: "1px solid #333" }} />

        <button disabled={loading} type="submit" style={{ padding: 12, borderRadius: 10, border: "1px solid #333", cursor: "pointer" }}>
          {loading ? "Creando..." : "Crear cuenta"}
        </button>

        {error && <div style={{ marginTop: 6, color: "tomato" }}>{error}</div>}
        {ok && <div style={{ marginTop: 6, color: "green" }}>{ok}</div>}
      </form>

      <div style={{ marginTop: 14 }}>
        <button onClick={() => router.push("/login")} style={{ background: "transparent", border: "none", color: "#6aa7ff", cursor: "pointer", padding: 0 }}>
          Ya tengo cuenta
        </button>
      </div>
    </div>
  );
}

