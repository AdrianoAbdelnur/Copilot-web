import { XMLParser } from "fast-xml-parser";
import { PolicyPackSchema, type PolicyPack } from "@/lib/policies/schema";

function asArray<T>(v: T | T[] | undefined | null): T[] {
  if (!v) return [];
  return Array.isArray(v) ? v : [v];
}

function pickExtendedData(obj: any, key: string) {
  const ext = obj?.ExtendedData;
  const data = asArray(ext?.Data);
  for (const d of data) {
    const name = d?.["@_name"] ?? d?.name;
    if (name === key) return d?.value ?? d?.Value ?? d?.["value"];
  }
  return undefined;
}

function parseCoordsText(text: string) {
  return text
    .trim()
    .split(/\s+/)
    .map((triplet) => {
      const [lngStr, latStr] = triplet.split(",");
      const lat = Number(latStr);
      const lng = Number(lngStr);
      return { lat, lng };
    })
    .filter((p) => Number.isFinite(p.lat) && Number.isFinite(p.lng));
}

function findAllPlacemarks(node: any): any[] {
  if (!node || typeof node !== "object") return [];
  const res: any[] = [];
  if (node.Placemark) res.push(...asArray(node.Placemark));
  for (const k of Object.keys(node)) {
    res.push(...findAllPlacemarks(node[k]));
  }
  return res;
}

export function compileKmlToPolicyPack(kmlText: string): PolicyPack {
  const parser = new XMLParser({
    ignoreAttributes: false,
    attributeNamePrefix: "@_"
  });

  const parsed = parser.parse(kmlText);
  const root = parsed?.kml ?? parsed;
  const doc = root?.Document ?? root?.kml?.Document ?? root;

  const placemarks = findAllPlacemarks(doc);

  const linePlacemarks = placemarks.filter((p) => p?.LineString?.coordinates);
  if (!linePlacemarks.length) {
    throw new Error("KML sin LineString (ruta)");
  }

  const mainLine = parseCoordsText(linePlacemarks[0].LineString.coordinates);
  const routeName = linePlacemarks[0]?.name;

  const segments = linePlacemarks.slice(1).map((p, i) => {
    const line = parseCoordsText(p.LineString.coordinates);
    const speedLimitKmhRaw = pickExtendedData(p, "speedLimitKmh");
    const speedLimitKmh = speedLimitKmhRaw ? Number(speedLimitKmhRaw) : undefined;

    return {
      id: String(p?.["@_id"] ?? p?.id ?? `seg-${i + 1}`),
      name: p?.name,
      line,
      speedLimitKmh: Number.isFinite(speedLimitKmh) ? speedLimitKmh : undefined
    };
  });

  const polyPlacemarks = placemarks.filter(
    (p) => p?.Polygon?.outerBoundaryIs?.LinearRing?.coordinates
  );

  const geofences = polyPlacemarks.map((p, i) => {
    const coordsText = p.Polygon.outerBoundaryIs.LinearRing.coordinates;
    const polygon = parseCoordsText(coordsText);
    const speedLimitKmhRaw = pickExtendedData(p, "speedLimitKmh");
    const speedLimitKmh = speedLimitKmhRaw ? Number(speedLimitKmhRaw) : undefined;

    return {
      id: String(p?.["@_id"] ?? p?.id ?? `fence-${i + 1}`),
      name: p?.name,
      polygon,
      speedLimitKmh: Number.isFinite(speedLimitKmh) ? speedLimitKmh : undefined
    };
  });

  const pointPlacemarks = placemarks.filter((p) => p?.Point?.coordinates);

  const points = pointPlacemarks.map((p, i) => {
    const coords = parseCoordsText(p.Point.coordinates);
    const point = coords[0];
    const type = pickExtendedData(p, "type") ?? "custom";
    const radiusMRaw = pickExtendedData(p, "radiusM");
    const radiusM = radiusMRaw ? Number(radiusMRaw) : undefined;
    const message = pickExtendedData(p, "message");

    return {
      id: String(p?.["@_id"] ?? p?.id ?? `pt-${i + 1}`),
      name: p?.name,
      type: String(type),
      point,
      radiusM: Number.isFinite(radiusM) ? radiusM : undefined,
      message: message ? String(message) : undefined
    };
  });

  const pack = {
    version: 1,
    route: {
      name: routeName,
      line: mainLine
    },
    segments,
    geofences,
    points
  };

  return PolicyPackSchema.parse(pack);
}
