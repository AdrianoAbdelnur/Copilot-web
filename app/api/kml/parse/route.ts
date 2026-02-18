import { z } from "zod";
import { parseKmlToPolicyPack } from "@/lib/policy/parseKml";

export const runtime = "nodejs";

const BodySchema = z.object({
  kml: z.string().min(1),
});

export async function POST(req: Request) {
  const body = BodySchema.parse(await req.json());

  const policyPack = parseKmlToPolicyPack(body.kml);

  return Response.json({
    ok: true,
    summary: {
      routePoints: policyPack.route.length,
      zones: policyPack.zones.length,
      pois: policyPack.pois.length,
    },
    policyPack,
  });
}
