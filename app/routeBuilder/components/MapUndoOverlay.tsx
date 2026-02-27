"use client";

type MapUndoOverlayProps = {
  visible: boolean;
  onUndo: () => void;
};

export default function MapUndoOverlay({ visible, onUndo }: MapUndoOverlayProps) {
  if (!visible) return null;

  return (
    <button
      type="button"
      onClick={onUndo}
      style={{
        position: "absolute",
        top: "50%",
        right: 10,
        transform: "translateY(-50%)",
        zIndex: 5,
        display: "inline-flex",
        alignItems: "center",
        gap: 6,
        padding: "7px 11px",
        borderRadius: 999,
        border: "1px solid #cbd5e1",
        background: "rgba(255,255,255,0.98)",
        color: "#0f172a",
        fontSize: 12,
        fontWeight: 600,
        boxShadow: "0 6px 18px rgba(15,23,42,0.14)",
        backdropFilter: "blur(4px)",
        cursor: "pointer",
      }}
    >
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" aria-hidden="true">
        <path
          d="M8 7H5v3"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
        <path
          d="M5 10a8 8 0 1 0 2.34-5.66L5 7"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
      Deshacer
    </button>
  );
}
