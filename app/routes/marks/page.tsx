import { Suspense } from "react";
import MarksClient from "./MarksClient";
import { esText } from "@/lib/i18n/es";

export default function Page() {
  return (
    <Suspense fallback={<div className="p-6 text-sm text-slate-500">{esText.marksPage.loadingEditor}</div>}>
      <MarksClient />
    </Suspense>
  );
}

