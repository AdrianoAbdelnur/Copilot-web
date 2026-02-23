"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setLoading(true);

    try {
      const res = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password }),
      });

      const data = await res.json();

      if (!res.ok) {
        setError(data?.message || "Error al iniciar sesión");
        return;
      }

      const token = data?.token;
      if (!token) {
        setError("No llegó token");
        return;
      }

      localStorage.setItem("token", token);
      document.cookie = `token=${encodeURIComponent(token)}; Path=/; Max-Age=${60 * 60 * 24 * 7}; SameSite=Lax`;

      router.push("/");
    } catch {
      setError("Error de red");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={{ maxWidth: 420, margin: "40px auto", padding: 16 }}>
      <h1 style={{ fontSize: 28, fontWeight: 700, marginBottom: 16 }}>Iniciar sesión</h1>

      <form onSubmit={onSubmit} style={{ display: "flex", flexDirection: "column", gap: 10 }}>
        <input
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="Email"
          type="email"
          autoComplete="email"
          style={{ padding: 12, borderRadius: 10, border: "1px solid #333" }}
        />

        <input
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          placeholder="Contraseña"
          type="password"
          autoComplete="current-password"
          style={{ padding: 12, borderRadius: 10, border: "1px solid #333" }}
        />

        <button
          disabled={loading}
          type="submit"
          style={{ padding: 12, borderRadius: 10, border: "1px solid #333", cursor: "pointer" }}
        >
          {loading ? "Ingresando..." : "Entrar"}
        </button>

        {error && <div style={{ marginTop: 6, color: "tomato" }}>{error}</div>}
      </form>

      <div style={{ marginTop: 14 }}>
        <button
          onClick={() => router.push("/register")}
          style={{ background: "transparent", border: "none", color: "#6aa7ff", cursor: "pointer", padding: 0 }}
        >
          Crear cuenta
        </button>
      </div>
    </div>
  );
}

