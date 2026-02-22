"use client";

import { useEffect, useState } from "react";

type PoiColorOpt = { label: string; value: string };

export type PoiNavMessageType = "pre" | "enter" | "exit";

export type PoiNavMessage = {
  id: string;
  type: PoiNavMessageType;
  text: string;
  distanceM?: number;
};

export type PoiForm = {
  name: string;
  type: string;
  radiusM: string;
  color: string;
  sizePx: string;
  navMessages: PoiNavMessage[];
};

const typeLabel: Record<PoiNavMessageType, string> = {
  pre: "Previo (antes de entrar)",
  enter: "Al ingresar al radio",
  exit: "Al salir del radio",
};

function uid() {
  return Math.random().toString(36).slice(2) + Date.now().toString(36);
}

export default function PoiModal({
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
  colors: PoiColorOpt[];
  value: PoiForm;
  onChange: (patch: Partial<PoiForm>) => void;
  onCancel: () => void;
  onSave: () => void;
}) {
  const [editorOpen, setEditorOpen] = useState(false);

  const [draftType, setDraftType] = useState<PoiNavMessageType>("enter");
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
    border: "1px solid #e5e7eb",
    borderRadius: 10,
    outline: "none",
  } as const;

  const selectStyle = {
    ...inputStyle,
    cursor: "pointer",
    background: "#fff",
  } as const;

  const btn = (primary?: boolean) =>
    ({
      padding: "10px 12px",
      borderRadius: 10,
      border: primary ? "1px solid #111827" : "1px solid #e5e7eb",
      background: primary ? "#111827" : "#fff",
      color: primary ? "#fff" : "#111827",
      cursor: "pointer",
      fontSize: 13,
    }) as const;

  const listBtn = {
    padding: "6px 10px",
    borderRadius: 10,
    border: "1px solid #e5e7eb",
    background: "#fff",
    cursor: "pointer",
    fontSize: 12,
  } as const;

  const navMessages = value.navMessages ?? [];

  const resetEditor = () => {
    setEditingId(null);
    setDraftType("enter");
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

  const startEdit = (m: PoiNavMessage) => {
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

  const canAddType = (t: PoiNavMessageType) => {
    return !navMessages.some((m) => m.type === t && m.id !== editingId);
  };

  const upsert = () => {
    const text = draftText.trim();
    if (!text) return;

    let distanceM: number | undefined = undefined;
    if (draftType === "pre") {
      const d = Number(draftDistance);
      if (!Number.isFinite(d) || d <= 0) return;
      distanceM = d;
    }

    const item: PoiNavMessage = {
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
          width: "min(640px, 100%)",
          background: "#fff",
          borderRadius: 12,
          border: "1px solid #e5e7eb",
          padding: 14,
        }}
      >
        <div style={{ fontSize: 16, fontWeight: 700, marginBottom: 8 }}>Nuevo Punto de Interés</div>

        <div style={{ display: "grid", gap: 10 }}>
          <div style={{ display: "grid", gap: 6 }}>
            <div style={{ fontSize: 12, opacity: 0.8 }}>Nombre</div>
            <input
              value={value.name}
              onChange={(e) => onChange({ name: e.target.value })}
              placeholder="Ej: Parador uno"
              style={inputStyle}
            />
          </div>

          <div style={{ display: "grid", gap: 6 }}>
            <div style={{ fontSize: 12, opacity: 0.8 }}>Tipo</div>
            <select value={value.type} onChange={(e) => onChange({ type: e.target.value })} style={selectStyle}>
                <option value="info">Aviso</option>
                <option value="alert">Alerta</option>
                <option value="critical">Peligro</option>
            </select>
          </div>

          <div style={{ display: "grid", gap: 6 }}>
            <div style={{ fontSize: 12, opacity: 0.8 }}>Radio (metros)</div>
            <input
              value={value.radiusM}
              onChange={(e) => onChange({ radiusM: e.target.value })}
              inputMode="numeric"
              style={inputStyle}
            />
          </div>

          <div style={{ display: "grid", gap: 6 }}>
            <div style={{ fontSize: 12, opacity: 0.8 }}>Color marcador</div>
            <select value={value.color} onChange={(e) => onChange({ color: e.target.value })} style={selectStyle}>
              {colors.map((c) => (
                <option key={c.value} value={c.value}>
                  {c.label}
                </option>
              ))}
            </select>
          </div>

          <div style={{ borderTop: "1px solid #e5e7eb", paddingTop: 10, display: "grid", gap: 10 }}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8 }}>
              <div style={{ fontSize: 13, fontWeight: 700 }}>Mensajes del navegador</div>
              <button type="button" onClick={openAdd} style={listBtn}>
                Agregar mensaje
              </button>
            </div>

            {navMessages.length > 0 && (
              <div style={{ display: "grid", gap: 8 }}>
                {navMessages.map((m) => (
                  <div
                    key={m.id}
                    style={{
                      border: "1px solid #e5e7eb",
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
                        <button type="button" onClick={() => startEdit(m)} style={listBtn}>
                          Editar
                        </button>
                        <button type="button" onClick={() => remove(m.id)} style={listBtn}>
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
              <div style={{ display: "grid", gap: 8, padding: 10, border: "1px solid #e5e7eb", borderRadius: 12 }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 8 }}>
                  <div style={{ fontWeight: 700, fontSize: 13 }}>{editingId ? "Editar mensaje" : "Nuevo mensaje"}</div>
                  <button type="button" onClick={closeEditor} style={listBtn}>
                    Cerrar
                  </button>
                </div>

                <div style={{ display: "grid", gap: 6 }}>
                  <div style={{ fontSize: 12, opacity: 0.8 }}>Tipo de mensaje</div>
                  <select
                    value={draftType}
                    onChange={(e) => setDraftType(e.target.value as PoiNavMessageType)}
                    style={selectStyle}
                  >
                    <option value="pre" disabled={!canAddType("pre")}>
                      Previo (antes de entrar)
                    </option>
                    <option value="enter" disabled={!canAddType("enter")}>
                      Al ingresar al radio
                    </option>
                    <option value="exit" disabled={!canAddType("exit")}>
                      Al salir del radio
                    </option>
                  </select>
                </div>

                {draftType === "pre" && (
                  <div style={{ display: "grid", gap: 6 }}>
                    <div style={{ fontSize: 12, opacity: 0.8 }}>¿Cuántos metros antes?</div>
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
                  <div style={{ fontSize: 12, opacity: 0.8 }}>Texto</div>
                  <input
                    value={draftText}
                    onChange={(e) => setDraftText(e.target.value)}
                    placeholder='Ej: "Parada permitida en Parador uno"'
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

          <div style={{ fontSize: 12, opacity: 0.8 }}>{pendingText}</div>

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
              Guardar POI
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}



