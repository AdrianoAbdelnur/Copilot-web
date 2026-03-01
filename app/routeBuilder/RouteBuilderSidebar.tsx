import type { ReactNode, RefObject } from "react";

type RouteBuilderSidebarProps = {
  collapsed: boolean;
  onToggleCollapsed: () => void;
  statusLabel: string;
  isReady: boolean;
  routeTitle: string;
  origin: string;
  destination: string;
  waypoints: string[];
  routeLoading: boolean;
  routeError: string;
  saveLoading: boolean;
  saveMessage: string;
  saveMessageTone: "ok" | "error" | "";
  originInputRef: RefObject<HTMLInputElement | null>;
  destinationInputRef: RefObject<HTMLInputElement | null>;
  setWaypointInputRef: (index: number, el: HTMLInputElement | null) => void;
  onOriginChange: (value: string) => void;
  onDestinationChange: (value: string) => void;
  onWaypointChange: (index: number, value: string) => void;
  onAddWaypoint: () => void;
  onRemoveWaypoint: (index: number) => void;
  onMoveWaypointUp: (index: number) => void;
  onMoveWaypointDown: (index: number) => void;
  onCalculateRoute: () => void;
  onClearRoute: () => void;
  onRouteTitleChange: (value: string) => void;
  onSaveRoute: () => void;
};

function IconButton({
  title,
  onClick,
  disabled,
  danger = false,
  children,
}: {
  title: string;
  onClick: () => void;
  disabled?: boolean;
  danger?: boolean;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      title={title}
      style={{
        width: 26,
        height: 26,
        borderRadius: 6,
        border: "1px solid var(--border)",
        background: disabled ? "color-mix(in srgb, var(--surface) 88%, var(--background) 12%)" : "var(--surface)",
        color: danger ? "var(--danger)" : disabled ? "var(--muted)" : "var(--foreground)",
        display: "inline-flex",
        alignItems: "center",
        justifyContent: "center",
        padding: 0,
        cursor: disabled ? "default" : "pointer",
      }}
    >
      {children}
    </button>
  );
}

function ChevronUpIcon() {
  return (
    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path d="M6 14l6-6 6 6" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function ChevronDownIcon() {
  return (
    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path d="M6 10l6 6 6-6" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function CloseIcon() {
  return (
    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path d="M7 7l10 10M17 7L7 17" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" />
    </svg>
  );
}

function PanelChevronIcon({ collapsed }: { collapsed: boolean }) {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      {collapsed ? (
        <path d="M10 6l6 6-6 6" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" />
      ) : (
        <path d="M14 6l-6 6 6 6" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" />
      )}
    </svg>
  );
}

export default function RouteBuilderSidebar({
  collapsed,
  onToggleCollapsed,
  statusLabel,
  isReady,
  routeTitle,
  origin,
  destination,
  waypoints,
  routeLoading,
  routeError,
  saveLoading,
  saveMessage,
  saveMessageTone,
  originInputRef,
  destinationInputRef,
  setWaypointInputRef,
  onOriginChange,
  onDestinationChange,
  onWaypointChange,
  onAddWaypoint,
  onRemoveWaypoint,
  onMoveWaypointUp,
  onMoveWaypointDown,
  onCalculateRoute,
  onClearRoute,
  onRouteTitleChange,
  onSaveRoute,
}: RouteBuilderSidebarProps) {
  if (collapsed) {
    return (
      <aside
        style={{
          borderRight: "1px solid var(--border)",
          background: "var(--surface)",
          position: "relative",
          zIndex: 3,
          height: "100%",
          minHeight: 0,
          display: "grid",
          gridTemplateRows: "auto 1fr",
          alignItems: "start",
        }}
      >
        <div style={{ display: "flex", justifyContent: "center", padding: 8, borderBottom: "1px solid var(--border)" }}>
          <IconButton title="Mostrar panel" onClick={onToggleCollapsed}>
            <PanelChevronIcon collapsed />
          </IconButton>
        </div>
        <div style={{ writingMode: "vertical-rl", transform: "rotate(180deg)", fontSize: 11, color: "var(--muted)", padding: "8px 0", textAlign: "center" }}>
          Route Builder
        </div>
      </aside>
    );
  }

  return (
    <aside
      style={{
        borderRight: "1px solid var(--border)",
        background: "var(--surface)",
        position: "relative",
        zIndex: 3,
        display: "grid",
        gridTemplateRows: "auto minmax(0, 1fr)",
        height: "100%",
        minHeight: 0,
      }}
    >
      <div style={{ padding: 10, borderBottom: "1px solid var(--border)" }}>
        <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 8 }}>
          <div style={{ flex: 1 }}>
            <input
              value={routeTitle}
              onChange={(e) => onRouteTitleChange(e.target.value)}
              placeholder="Mapa sin titulo"
              style={{
                width: "100%",
                fontSize: 16,
                lineHeight: 1.15,
                marginBottom: 4,
                color: "var(--foreground)",
                fontWeight: 600,
                border: "1px solid var(--border)",
                borderRadius: 6,
                background: "var(--surface)",
                padding: "6px 8px",
              }}
            />
            <div style={{ fontSize: 11, color: "var(--muted)" }}>{statusLabel}</div>
          </div>
          <IconButton title="Ocultar panel" onClick={onToggleCollapsed}>
            <PanelChevronIcon collapsed={false} />
          </IconButton>
        </div>
      </div>

      <div style={{ padding: 8, display: "grid", alignContent: "start", gap: 8, overflowY: "auto", minHeight: 0 }}>
        <div style={{ border: "1px solid var(--border)", borderRadius: 8, padding: 8, background: "var(--surface)" }}>
          <div style={{ fontSize: 11, color: "var(--muted)", marginBottom: 4 }}>Inicio</div>
          <input
            ref={originInputRef}
            value={origin}
            onChange={(e) => onOriginChange(e.target.value)}
            placeholder="Direccion de inicio"
            style={{
              width: "100%",
              padding: "6px 8px",
              borderRadius: 6,
              border: "1px solid var(--border)",
              background: "var(--surface)",
              color: "var(--foreground)",
              fontSize: 13,
            }}
          />
        </div>

        {waypoints.map((value, index) => (
          <div key={index} style={{ border: "1px solid var(--border)", borderRadius: 8, padding: 8, background: "var(--surface)" }}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8, marginBottom: 4 }}>
              <div style={{ fontSize: 11, color: "var(--muted)" }}>Waypoint {index + 1}</div>
              <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
                <IconButton title="Subir waypoint" onClick={() => onMoveWaypointUp(index)} disabled={index === 0}>
                  <ChevronUpIcon />
                </IconButton>
                <IconButton
                  title="Bajar waypoint"
                  onClick={() => onMoveWaypointDown(index)}
                  disabled={index === waypoints.length - 1}
                >
                  <ChevronDownIcon />
                </IconButton>
                <IconButton title="Quitar waypoint" onClick={() => onRemoveWaypoint(index)} danger>
                  <CloseIcon />
                </IconButton>
              </div>
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "1fr auto", gap: 8 }}>
              <input
                ref={(el) => setWaypointInputRef(index, el)}
                value={value}
                onChange={(e) => onWaypointChange(index, e.target.value)}
                placeholder="Direccion intermedia"
                style={{
                  padding: "6px 8px",
                  borderRadius: 6,
                  border: "1px solid var(--border)",
                  background: "var(--surface)",
                  color: "var(--foreground)",
                  fontSize: 13,
                }}
              />
              <div style={{ width: 24 }} />
            </div>
          </div>
        ))}

        <button
          type="button"
          onClick={onAddWaypoint}
          disabled={!isReady}
          style={{
            justifySelf: "start",
            border: "none",
            background: "transparent",
            color: isReady ? "#2563eb" : "#94a3b8",
            padding: 0,
            fontSize: 12,
            cursor: isReady ? "pointer" : "default",
            textDecoration: "underline",
          }}
        >
          + Agregar waypoint
        </button>

        <div style={{ border: "1px solid var(--border)", borderRadius: 8, padding: 8, background: "var(--surface)" }}>
          <div style={{ fontSize: 11, color: "var(--muted)", marginBottom: 4 }}>Fin</div>
          <input
            ref={destinationInputRef}
            value={destination}
            onChange={(e) => onDestinationChange(e.target.value)}
            placeholder="Direccion de destino"
            style={{
              width: "100%",
              padding: "6px 8px",
              borderRadius: 6,
              border: "1px solid var(--border)",
              background: "var(--surface)",
              color: "var(--foreground)",
              fontSize: 13,
            }}
          />
        </div>

        <div style={{ display: "grid", gap: 6 }}>
          <button
            type="button"
            onClick={onCalculateRoute}
            disabled={!isReady || routeLoading}
            style={{
              padding: "7px 10px",
              borderRadius: 6,
              border: "1px solid #1d4ed8",
              background: "#2563eb",
              color: "#fff",
              fontSize: 13,
            }}
          >
            {routeLoading ? "Calculando..." : "Trazar ruta"}
          </button>
          <button
            type="button"
            onClick={onClearRoute}
            disabled={!isReady}
            style={{
              padding: "7px 10px",
              borderRadius: 6,
              border: "1px solid var(--border)",
              background: "var(--surface)",
              color: "var(--foreground)",
              fontSize: 12,
            }}
          >
            Limpiar ruta
          </button>
          <button
            type="button"
            onClick={onSaveRoute}
            disabled={!isReady || saveLoading}
            style={{
              padding: "7px 10px",
              borderRadius: 6,
              border: "1px solid #0f766e",
              background: "#0d9488",
              color: "#fff",
              fontSize: 12,
              opacity: !isReady || saveLoading ? 0.65 : 1,
              cursor: !isReady || saveLoading ? "default" : "pointer",
            }}
          >
            {saveLoading ? "Guardando..." : "Guardar ruta"}
          </button>
          {routeError ? <div style={{ color: "#b91c1c", fontSize: 12 }}>{routeError}</div> : null}
          {saveMessage ? (
            <div style={{ color: saveMessageTone === "ok" ? "#0f766e" : "#b91c1c", fontSize: 12 }}>{saveMessage}</div>
          ) : null}
        </div>
      </div>
    </aside>
  );
}
