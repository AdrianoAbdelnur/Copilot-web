"use client";

import { useSearchParams } from "next/navigation";
import RouteEditorMap from "@/components/map/RouteEditorMap";

export default function MarksClient() {
  const sp = useSearchParams();
  const routeId = sp.get("routeId") ?? "";

  if (!routeId) return <div style={{ padding: 24 }}>Falta routeId</div>;

  return <RouteEditorMap routeId={routeId} />;
}
