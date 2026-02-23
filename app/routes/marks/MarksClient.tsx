"use client";

import dynamic from "next/dynamic";
import { useSearchParams } from "next/navigation";
import OperationsShell from "@/components/layout/OperationsShell";
import { Card, CardContent } from "@/components/ui/Card";
import { EmptyState } from "@/components/ui/EmptyState";
import { esText } from "@/lib/i18n/es";

const RouteEditorMap = dynamic(() => import("@/components/map/RouteEditorMap"), {
  ssr: false,
  loading: () => <div className="h-[72vh] animate-pulse rounded-lg bg-slate-100" />,
});

export default function MarksClient() {
  const sp = useSearchParams();
  const routeId = sp.get("routeId") ?? "";

  return (
    <OperationsShell
      title={esText.marksPage.title}
      subtitle={esText.marksPage.subtitle}
      nav={[
        { href: "/", label: esText.nav.home },
        { href: "/routes", label: esText.nav.routes, current: true },
        { href: "/trips", label: esText.nav.trips },
        { href: "/admin", label: esText.nav.admin },
      ]}
    >
      <Card>
        <CardContent>
          {!routeId ? (
            <EmptyState
              title={esText.marksPage.missingRouteId}
              description={esText.marksPage.missingRouteIdDescription}
            />
          ) : (
            <RouteEditorMap routeId={routeId} />
          )}
        </CardContent>
      </Card>
    </OperationsShell>
  );
}

