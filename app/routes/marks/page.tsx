import { Suspense } from "react";
import MarksClient from "./MarksClient";

export default function Page() {
  return (
    <Suspense fallback={<div style={{ padding: 24 }}>Cargando...</div>}>
      <MarksClient />
    </Suspense>
  );
}