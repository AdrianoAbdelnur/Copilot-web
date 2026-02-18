export type LatLng = { latitude: number; longitude: number };

export type PolicyZone =
  | {
      id: string;
      type: "speed_limit";
      name: string;
      speedLimitKmh: number;
      polygon: LatLng[];
    }
  | {
      id: string;
      type: "polygon";
      name: string;
      polygon: LatLng[];
    };

export type PolicyPoi = {
  id: string;
  type: "poi";
  name: string;
  message: string;
  radiusM: number;
  point: LatLng;
};

export type PolicyPack = {
  version: 1;
  route: LatLng[];
  zones: PolicyZone[];
  pois: PolicyPoi[];
};
