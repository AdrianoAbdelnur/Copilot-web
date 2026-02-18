import Link from "next/link";

export default function Home() {
  return (
    <div style={styles.page}>
      <div style={styles.card}>
        <h1 style={styles.title}>Panel</h1>
        <p style={styles.subtitle}>Elegí a dónde querés ir</p>

        <div style={styles.row}>
          <Link href="/kml" style={{ ...styles.btn, ...styles.btnPrimary }}>
            KML
          </Link>

          <Link href="/routes" style={{ ...styles.btn, ...styles.btnSecondary }}>
            Routes
          </Link>
        </div>
      </div>
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  page: {
    minHeight: "100vh",
    display: "grid",
    placeItems: "center",
    background: "#f4f4f5",
    fontFamily: "system-ui",
    padding: 24,
  },
  card: {
    width: "min(520px, 100%)",
    background: "#fff",
    border: "1px solid #e4e4e7",
    borderRadius: 16,
    padding: 24,
    boxShadow: "0 10px 30px rgba(0,0,0,0.06)",
  },
  title: { margin: 0, fontSize: 22, fontWeight: 800, color: "#111827" },
  subtitle: { margin: "8px 0 18px", color: "#6b7280" },
  row: { display: "flex", gap: 12, flexWrap: "wrap" },
  btn: {
    padding: "12px 16px",
    borderRadius: 12,
    textDecoration: "none",
    fontWeight: 700,
    display: "inline-flex",
    alignItems: "center",
    justifyContent: "center",
    minWidth: 140,
  },
  btnPrimary: { background: "#111827", color: "#fff" },
  btnSecondary: { background: "#fff", color: "#111827", border: "1px solid #d1d5db" },
};
