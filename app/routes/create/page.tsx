import Link from "next/link";

export default function CreateRouteModePage() {
  return (
    <div className="min-h-[calc(100vh-57px)] bg-background text-foreground">
      <div className="mx-auto max-w-5xl px-4 py-8 sm:px-6 lg:px-8">
        <header className="mb-6 rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
          <div className="mb-2 inline-flex items-center gap-2 rounded-full bg-blue-50 px-3 py-1 text-xs font-semibold text-blue-700">
            Crear ruta
          </div>
          <h1 className="text-2xl font-extrabold tracking-tight sm:text-3xl">Elegi el modo de carga</h1>
          <p className="mt-1 text-sm text-slate-500">
            Podes crear una ruta importando un archivo KML o dibujandola en el RouteBuilder.
          </p>
        </header>

        <section className="grid gap-6 md:grid-cols-2">
          <article className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
            <div className="mb-4 inline-flex h-11 w-11 items-center justify-center rounded-xl bg-indigo-50 text-indigo-600">
              <span className="material-symbols-outlined text-xl">route</span>
            </div>
            <h2 className="text-lg font-bold tracking-tight">Crear con RouteBuilder</h2>
            <p className="mt-1 min-h-12 text-sm text-slate-500">
              Defini inicio, anchors y fin sobre el mapa para construir y ajustar la ruta manualmente.
            </p>
            <Link
              href="/routeBuilder"
              className="mt-5 inline-flex w-full items-center justify-center gap-2 rounded-lg bg-slate-900 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-slate-800"
            >
              <span className="material-symbols-outlined text-base">arrow_forward</span>
              Ir a RouteBuilder
            </Link>
          </article>

          <article className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
            <div className="mb-4 inline-flex h-11 w-11 items-center justify-center rounded-xl bg-blue-50 text-blue-600">
              <span className="material-symbols-outlined text-xl">upload_file</span>
            </div>
            <h2 className="text-lg font-bold tracking-tight">Cargar por KML</h2>
            <p className="mt-1 min-h-12 text-sm text-slate-500">
              Subi un archivo KML para crear la ruta de forma rapida y guardarla en el sistema.
            </p>
            <Link
              href="/kml"
              className="mt-5 inline-flex w-full items-center justify-center gap-2 rounded-lg bg-[#137fec] px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-[#126fd0]"
            >
              <span className="material-symbols-outlined text-base">arrow_forward</span>
              Ir a carga KML
            </Link>
          </article>
        </section>
      </div>
    </div>
  );
}
