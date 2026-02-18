import { XMLParser } from "fast-xml-parser";
import { PolicyPack } from "./types";

const asArray = <T,>(v: T | T[] | undefined | null): T[] => {
  if (!v) return [];
  return Array.isArray(v) ? v : [v];
};

const parseCoordString = (s: string) => {
  return s
    .trim()
    .split(/\s+/)
    .map((chunk) => chunk.trim())
    .filter(Boolean)
    .map((chunk) => {
      const [lng, lat] = chunk.split(",").map(Number);
      return { latitude: lat, longitude: lng };
    });
};

const extractSpeedLimit = (name: string) => {
  const m = name.match(/(\d+(?:\.\d+)?)\s*km\/h/i) || name.match(/(\d+(?:\.\d+)?)/);
  if (!m) return null;
  const n = Number(m[1]);
  return Number.isFinite(n) ? n : null;
};

const collectPlacemarks = (node: any): any[] => {
  if (!node || typeof node !== "object") return [];
  let out: any[] = [];
  if (node.Placemark) out.push(...asArray(node.Placemark));
  for (const k of Object.keys(node)) out.push(...collectPlacemarks(node[k]));
  return out;
};

export const parseKmlToPolicyPack = (xml: string): PolicyPack => {
  const parser = new XMLParser({ ignoreAttributes: false });
  const obj = parser.parse(xml);
  const root = obj.kml ?? obj;

  const placemarks = collectPlacemarks(root);

  let route: { latitude: number; longitude: number }[] = [];
  const zones: any[] = [];
  const pois: any[] = [];

  for (const pm of placemarks) {
    const name = String(pm.name ?? "").trim();

    if (pm.LineString?.coordinates) {
      const coords = parseCoordString(String(pm.LineString.coordinates));
      if (coords.length) route = coords;
    }

    if (pm.Polygon?.outerBoundaryIs?.LinearRing?.coordinates) {
      const polygon = parseCoordString(String(pm.Polygon.outerBoundaryIs.LinearRing.coordinates));
      const limit = extractSpeedLimit(name);

      zones.push(
        limit
          ? {
              id: `zone_${zones.length + 1}`,
              type: "speed_limit",
              name: name || `Zona ${zones.length + 1}`,
              speedLimitKmh: limit,
              polygon,
            }
          : {
              id: `zone_${zones.length + 1}`,
              type: "polygon",
              name: name || `Zona ${zones.length + 1}`,
              polygon,
            }
      );
    }

    if (pm.Point?.coordinates) {
      const [one] = parseCoordString(String(pm.Point.coordinates));
      if (one) {
        pois.push({
          id: `poi_${pois.length + 1}`,
          type: "poi",
          name: name || `POI ${pois.length + 1}`,
          message: name || "",
          radiusM: 60,
          point: one,
        });
      }
    }
  }

  return { version: 1, route, zones, pois };
};
