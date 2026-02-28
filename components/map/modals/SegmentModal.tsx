"use client";

import { useEffect, useState } from "react";

type ColorOpt = { label: string; value: string };

export type SegmentNavMessageType = "pre" | "inside" | "exit";

export type SegmentNavMessage = {
  id: string;
  type: SegmentNavMessageType;
  text: string;
  distanceM?: number;
};

export type SegmentForm = {
  name: string;
  type: string;
  maxSpeed: string;
  note: string;
  widthPx: string;
  color: string;
  navMessages: SegmentNavMessage[];
};

function uid() {
  return Math.random().toString(36).slice(2) + Date.now().toString(36);
}

const typeLabel: Record<SegmentNavMessageType, string> = {
  pre: "Previo (antes de entrar)",
  inside: "Dentro del tramo",
  exit: "Al salir del tramo",
};

export default function SegmentModal({
  open,
  pendingText,
  colors,
  value,
  onChange,
  onCancel,
  onSave,
}: {
  open: boolean;
  pendingText: string;
  colors: ColorOpt[];
  value: SegmentForm;
  onChange: (patch: Partial<SegmentForm>) => void;
  onCancel: () => void;
  onSave: () => void;
}) {
  const [editorOpen, setEditorOpen] = useState(false);
  const [draftType, setDraftType] = useState<SegmentNavMessageType>("inside");
  const [draftText, setDraftText] = useState("");
  const [draftDistance, setDraftDistance] = useState("200");
  const [editingId, setEditingId] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setEditorOpen(false);
        setEditingId(null);
        onCancel();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onCancel]);

  if (!open) return null;

  const inputStyle = {
    padding: "10px 12px",
    border: "1px solid var(--border)",
    borderRadius: 10,
    outline: "none",
    background: "var(--surface)",
    color: "var(--foreground)",
  } as const;

  const selectStyle = {
    ...inputStyle,
    cursor: "pointer",
    background: "var(--surface)",
  } as const;

  const btn = (primary?: boolean) =>
    ({
      padding: "10px 12px",
      borderRadius: 10,
      border: primary ? "1px solid var(--foreground)" : "1px solid var(--border)",
      background: primary ? "var(--foreground)" : "var(--surface)",
      color: primary ? "var(--surface)" : "var(--foreground)",
      cursor: "pointer",
      fontSize: 13,
    }) as const;

  const smallBtn = {
    padding: "6px 10px",
    borderRadius: 10,
    border: "1px solid var(--border)",
    background: "var(--surface)",
    color: "var(--foreground)",
    cursor: "pointer",
    fontSize: 12,
  } as const;

  const navMessages = value.navMessages ?? [];
  const firstAvailableType = (): SegmentNavMessageType => {
    const used = new Set(navMessages.map((m) => m.type));
    if (!used.has("inside")) return "inside";
    if (!used.has("pre")) return "pre";
    if (!used.has("exit")) return "exit";
    return "inside";
  };

  const resetEditor = () => {
    setEditingId(null);
    setDraftType(firstAvailableType());
    setDraftText("");
    setDraftDistance("200");
  };

  const openAdd = () => {
    setEditorOpen(true);
    resetEditor();
  };

  const closeEditor = () => {
    setEditorOpen(false);
    resetEditor();
  };

  const startEdit = (m: SegmentNavMessage) => {
    setEditorOpen(true);
    setEditingId(m.id);
    setDraftType(m.type);
    setDraftText(m.text || "");
    setDraftDistance(String(m.distanceM ?? 200));
  };

  const remove = (id: string) => {
    onChange({ navMessages: navMessages.filter((x) => x.id !== id) });
    if (editingId === id) closeEditor();
  };

  const canAddType = (t: SegmentNavMessageType) => {
    return !navMessages.some((m) => m.type === t && m.id !== editingId);
  };

  const upsert = () => {
    const text = draftText.trim();
    if (!text) return;
    if (!editingId && !canAddType(draftType)) return;

    let distanceM: number | undefined = undefined;
    if (draftType === "pre") {
      const d = Number(draftDistance);
      if (!Number.isFinite(d) || d <= 0) return;
      distanceM = d;
    }

    const item: SegmentNavMessage = {
      id: editingId ?? uid(),
      type: draftType,
      text,
      ...(draftType === "pre" ? { distanceM } : {}),
    };

    const next = editingId
      ? navMessages.map((x) => (x.id === editingId ? item : x))
      : [...navMessages, item];

    onChange({ navMessages: next });
    closeEditor();
  };

  return (
    <div
      style={{
        position: "fixed",
        inset: 0,
        background: "rgba(0,0,0,0.35)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: 16,
        zIndex: 9999,
      }}
    >
      <div
        style={{
          width: "min(720px, 100%)",
          background: "var(--surface)",
          color: "var(--foreground)",
          borderRadius: 12,
          border: "1px solid var(--border)",
          padding: 14,
          maxHeight: "min(88vh, 920px)",
          overflowY: "auto",
        }}
      >
        <div style={{ fontSize: 16, fontWeight: 700, marginBottom: 8 }}>Nuevo Tramo</div>

        <div style={{ display: "grid", gap: 10 }}>
          <div style={{ fontSize: 12, color: "var(--muted)" }}>{pendingText}</div>

          <div style={{ display: "grid", gap: 6 }}>
            <div style={{ fontSize: 12, color: "var(--muted)" }}>Nombre</div>
            <input
              value={value.name}
              onChange={(e) => onChange({ name: e.target.value })}
              placeholder="Ej: Zona urbana"
              style={inputStyle}
            />
          </div>

          <div style={{ display: "grid", gap: 6 }}>
  <div style={{ fontSize: 12, color: "var(--muted)" }}>Tipo</div>
  <select
    value={value.type}
    onChange={(e) => onChange({ type: e.target.value })}
    style={selectStyle}
  >
    <option value="info">Aviso</option>
    <option value="alert">Alerta</option>
    <option value="critical">Peligro</option>
    <option value="velocidad_maxima">Velocidad máxima</option>
  </select>
</div>

          {value.type === "velocidad_maxima" && (
            <div style={{ display: "grid", gap: 6 }}>
              <div style={{ fontSize: 12, color: "var(--muted)" }}>Velocidad máxima</div>
              <input
                value={value.maxSpeed}
                onChange={(e) => onChange({ maxSpeed: e.target.value })}
                inputMode="numeric"
                style={inputStyle}
              />
            </div>
          )}

          <div style={{ display: "grid", gap: 6 }}>
            <div style={{ fontSize: 12, color: "var(--muted)" }}>Color del tramo</div>
            <select value={value.color} onChange={(e) => onChange({ color: e.target.value })} style={selectStyle}>
              {colors.map((c) => (
                <option key={c.value} value={c.value}>
                  {c.label}
                </option>
              ))}
            </select>
          </div>

          <div style={{ display: "grid", gap: 6 }}>
            <div style={{ fontSize: 12, color: "var(--muted)" }}>Ancho línea (px)</div>
            <input
              value={value.widthPx}
              onChange={(e) => onChange({ widthPx: e.target.value })}
              inputMode="numeric"
              style={inputStyle}
            />
          </div>

          <div style={{ display: "grid", gap: 6 }}>
            <div style={{ fontSize: 12, color: "var(--muted)" }}>Detalle (opcional)</div>
            <input
              value={value.note}
              onChange={(e) => onChange({ note: e.target.value })}
              placeholder="Ej: escuela / loma de burro"
              style={inputStyle}
            />
          </div>

          <div style={{ borderTop: "1px solid var(--border)", paddingTop: 10, display: "grid", gap: 10 }}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8 }}>
              <div style={{ fontSize: 13, fontWeight: 700 }}>Mensajes del navegador</div>
              <button type="button" onClick={openAdd} style={smallBtn}>
                Agregar mensaje
              </button>
            </div>

            {navMessages.length > 0 && (
              <div style={{ display: "grid", gap: 8 }}>
                {navMessages.map((m) => (
                  <div
                    key={m.id}
                    style={{
                      border: "1px solid var(--border)",
                      borderRadius: 12,
                      padding: 10,
                      display: "grid",
                      gap: 6,
                    }}
                  >
                    <div style={{ display: "flex", justifyContent: "space-between", gap: 8, alignItems: "center" }}>
                      <div style={{ fontWeight: 700, fontSize: 13 }}>
                        {typeLabel[m.type]}
                        {m.type === "pre" ? ` · ${m.distanceM ?? 200} m antes` : ""}
                      </div>

                      <div style={{ display: "flex", gap: 8 }}>
                        <button type="button" onClick={() => startEdit(m)} style={smallBtn}>
                          Editar
                        </button>
                        <button type="button" onClick={() => remove(m.id)} style={smallBtn}>
                          Borrar
                        </button>
                      </div>
                    </div>

                    <div style={{ fontSize: 13 }}>{m.text}</div>
                  </div>
                ))}
              </div>
            )}

            {editorOpen && (
              <div style={{ display: "grid", gap: 8, padding: 10, border: "1px solid var(--border)", borderRadius: 12 }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 8 }}>
                  <div style={{ fontWeight: 700, fontSize: 13 }}>{editingId ? "Editar mensaje" : "Nuevo mensaje"}</div>
                  <button type="button" onClick={closeEditor} style={smallBtn}>
                    Cerrar
                  </button>
                </div>

                <div style={{ display: "grid", gap: 6 }}>
                  <div style={{ fontSize: 12, color: "var(--muted)" }}>Tipo de mensaje</div>
                  <select value={draftType} onChange={(e) => setDraftType(e.target.value as SegmentNavMessageType)} style={selectStyle}>
                    <option value="pre" disabled={!canAddType("pre")}>
                      Previo (antes de entrar)
                    </option>
                    <option value="inside" disabled={!canAddType("inside")}>
                      Dentro del tramo
                    </option>
                    <option value="exit" disabled={!canAddType("exit")}>
                      Al salir del tramo
                    </option>
                  </select>
                </div>

                {draftType === "pre" && (
                  <div style={{ display: "grid", gap: 6 }}>
                    <div style={{ fontSize: 12, color: "var(--muted)" }}>¿Cuántos metros antes?</div>
                    <input
                      value={draftDistance}
                      onChange={(e) => setDraftDistance(e.target.value)}
                      inputMode="numeric"
                      style={inputStyle}
                      placeholder="200"
                    />
                  </div>
                )}

                <div style={{ display: "grid", gap: 6 }}>
                  <div style={{ fontSize: 12, color: "var(--muted)" }}>Texto</div>
                  <input
                    value={draftText}
                    onChange={(e) => setDraftText(e.target.value)}
                    placeholder='Ej: "Reducir la velocidad"'
                    style={inputStyle}
                  />
                </div>

                <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
                  <button type="button" onClick={upsert} style={btn(true)}>
                    {editingId ? "Guardar cambios" : "Agregar"}
                  </button>
                </div>
              </div>
            )}
          </div>

          <div style={{ display: "flex", gap: 8, justifyContent: "flex-end", marginTop: 6 }}>
            <button
              onClick={() => {
                closeEditor();
                onCancel();
              }}
              style={btn(false)}
            >
              Cancelar
            </button>
            <button
              onClick={() => {
                closeEditor();
                onSave();
              }}
              style={btn(true)}
            >
              Guardar tramo
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}



