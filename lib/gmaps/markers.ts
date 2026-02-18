export const setMarkerOff = (m: any) => {
  if (!m) return;
  if (typeof m.setMap === "function") m.setMap(null);
  else if ("map" in m) m.map = null;
};

export const makeDotMarker = ({
  map,
  position,
  title,
  color,
  sizePx,
}: {
  map: any;
  position: { lat: number; lng: number };
  title: string;
  color: string;
  sizePx: number;
}) => {
  return new window.google.maps.Marker({
    map,
    position,
    title,
    icon: {
      path: window.google.maps.SymbolPath.CIRCLE,
      fillColor: color,
      fillOpacity: 1,
      strokeColor: "#ffffff",
      strokeWeight: 3,
      scale: Math.max(6, Math.round(sizePx / 2)),
    },
  });
};
