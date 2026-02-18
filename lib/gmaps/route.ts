export function toLatLng(p: any) {
  const num = (v: any) => {
    const n = typeof v === "string" ? Number(v) : v;
    return Number.isFinite(n) ? n : null;
  };

  let lat: number | null = null;
  let lng: number | null = null;

  if (Array.isArray(p) && p.length >= 2) {
    lat = num(p[0]);
    lng = num(p[1]);
  } else if (p && typeof p === "object") {
    lat = num(p.lat ?? p.latitude ?? p.y);
    lng = num(p.lng ?? p.longitude ?? p.x);
  }

  if (lat === null || lng === null) return null;

  if (Math.abs(lat) > 90 && Math.abs(lng) <= 90) {
    const t = lat;
    lat = lng;
    lng = t;
  }

  if (Math.abs(lat) > 90 || Math.abs(lng) > 180) return null;
  return { lat, lng };
}

export function normalizeDensePath(dense: any[]) {
  const route = dense
    .map((p: any) => {
      const lat = p?.lat ?? p?.latitude ?? p?.y ?? (Array.isArray(p) ? p[0] : null);
      const lng = p?.lng ?? p?.longitude ?? p?.x ?? (Array.isArray(p) ? p[1] : null);
      const latitude = typeof lat === "string" ? Number(lat) : lat;
      const longitude = typeof lng === "string" ? Number(lng) : lng;
      if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) return null;
      if (Math.abs(latitude) > 90 || Math.abs(longitude) > 180) return null;
      return { latitude, longitude };
    })
    .filter(Boolean) as { latitude: number; longitude: number }[];

  const path = dense.map(toLatLng).filter(Boolean) as { lat: number; lng: number }[];

  return { route, path };
}

export function sliceRouteByIdx(route: { latitude: number; longitude: number }[], aIdx: number, bIdx: number) {
  const from = Math.min(aIdx, bIdx);
  const to = Math.max(aIdx, bIdx);
  const pts = route.slice(from, to + 1);
  return pts.map((p) => ({ lat: p.latitude, lng: p.longitude }));
}
