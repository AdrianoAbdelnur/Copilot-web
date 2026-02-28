"use client";

import { useRouter } from "next/navigation";
import { useRef, useState } from "react";

export default function KmlPage() {
  const [title, setTitle] = useState("");
  const [fileName, setFileName] = useState("");
  const [size, setSize] = useState(0);
  const [kmlText, setKmlText] = useState("");
  const [saving, setSaving] = useState(false);
  const [modal, setModal] = useState<{
    open: boolean;
    title: string;
    message: string;
    tone: "ok" | "error";
    nextHref?: string;
    confirmLabel?: string;
  }>({
    open: false,
    title: "",
    message: "",
    tone: "ok",
  });
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const router = useRouter();

  const formatBytes = (bytes: number) => {
    if (!bytes) return "0 B";
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
  };

  const onPick = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setFileName(file.name);
    setSize(file.size);

    const text = await file.text();
    setKmlText(text);
  };

  const openModal = (
    titleText: string,
    messageText: string,
    tone: "ok" | "error",
    options?: { nextHref?: string; confirmLabel?: string }
  ) => {
    setModal({
      open: true,
      title: titleText,
      message: messageText,
      tone,
      nextHref: options?.nextHref,
      confirmLabel: options?.confirmLabel,
    });
  };

  const toSpanishMessage = (message: string) => {
    const msg = String(message || "").toLowerCase();
    if (msg.includes("title requerido")) return "El nombre de la ruta es obligatorio.";
    if (msg.includes("not found")) return "No se encontro el recurso solicitado.";
    return "No se pudo guardar la ruta. Intentalo nuevamente.";
  };

  const onSave = async () => {
    if (saving) return;
    if (!title.trim()) {
      openModal("Falta el nombre", "Debes completar el nombre de la ruta antes de guardar.", "error");
      return;
    }
    if (!kmlText.trim()) {
      openModal("Falta el archivo", "Primero selecciona un archivo KML para continuar.", "error");
      return;
    }

    setSaving(true);
    try {
      const res = await fetch("/api/routes", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title, kml: kmlText }),
      });
      const json = await res.json();
      if (!res.ok || !json?.ok) {
        openModal("No se pudo guardar", toSpanishMessage(json?.message || ""), "error");
        return;
      }
      const createdId = String(json?.id ?? "").trim();
      openModal(
        "Ruta guardada",
        "La ruta KML se guardo correctamente. ¿Deseas validar la ruta en el editor activo?",
        "ok",
        createdId ? { nextHref: `/routes/editor?routeId=${createdId}`, confirmLabel: "Si, validar ahora" } : undefined
      );
      setTitle("");
      setFileName("");
      setSize(0);
      setKmlText("");
      if (fileInputRef.current) fileInputRef.current.value = "";
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="min-h-[calc(100vh-57px)] bg-background text-foreground">
      <div className="mx-auto max-w-3xl px-4 py-8 sm:px-6 lg:px-8">
        <header className="mb-6">
          <h1 className="text-2xl font-extrabold tracking-tight sm:text-3xl">Cargar KML</h1>
          <p className="mt-1 text-sm text-slate-500">Importa un archivo y guardalo como ruta cuando estes listo.</p>
        </header>

        <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm sm:p-6">
          <div className="mb-4">
            <label className="mb-2 block text-sm font-medium text-slate-700">Nombre de la ruta</label>
            <input
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="Ej: ruta 1"
              className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm outline-none transition focus:border-[#137fec]"
            />
          </div>

          <div className="flex flex-wrap items-center gap-3">
            <input
              ref={fileInputRef}
              type="file"
              accept=".kml,application/vnd.google-earth.kml+xml,text/xml"
              onChange={onPick}
              className="hidden"
            />
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              className="inline-flex items-center gap-2 rounded-lg border border-slate-200 bg-slate-50 px-4 py-2 text-sm font-semibold text-slate-800 transition hover:bg-slate-100"
            >
              <span className="material-symbols-outlined text-[18px]">upload_file</span>
              Seleccionar archivo
            </button>
            {fileName ? <span className="text-sm text-slate-600">{fileName}</span> : null}
          </div>

          {fileName ? (
            <div className="mt-4 grid gap-2 rounded-xl border border-slate-200 bg-slate-50 p-3 text-sm text-slate-700 sm:grid-cols-2">
              <div>
                <span className="font-semibold">Archivo:</span> {fileName}
              </div>
              <div>
                <span className="font-semibold">Tamano:</span> {formatBytes(size)}
              </div>
            </div>
          ) : null}

          <div className="mt-5">
            <button
              type="button"
              onClick={onSave}
              disabled={!kmlText.trim() || saving}
              className="inline-flex items-center gap-2 rounded-lg border border-[#137fec] bg-[#137fec] px-4 py-2 text-sm font-semibold text-white transition hover:bg-[#126fd0] disabled:cursor-not-allowed disabled:!border-slate-600 disabled:!bg-slate-700 disabled:!text-slate-300"
            >
              <span className="material-symbols-outlined text-[18px]">save</span>
              {saving ? "Guardando..." : "Guardar ruta"}
            </button>
          </div>
        </section>
      </div>

      {modal.open ? (
        <div className="fixed inset-0 z-50 grid place-items-center bg-slate-900/50 px-4">
          <div className="w-full max-w-md rounded-2xl border border-slate-200 bg-white p-5 shadow-xl">
            <div className={`mb-2 text-base font-bold ${modal.tone === "ok" ? "text-emerald-700" : "text-rose-700"}`}>
              {modal.title}
            </div>
            <p className="text-sm text-slate-700">{modal.message}</p>
            <div className="mt-5 flex justify-end gap-2">
              {modal.nextHref ? (
                <button
                  type="button"
                  onClick={() => setModal((prev) => ({ ...prev, open: false }))}
                  className="rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-semibold text-slate-700 transition hover:bg-slate-50"
                >
                  No por ahora
                </button>
              ) : null}
              <button
                type="button"
                onClick={() => {
                  const href = modal.nextHref;
                  setModal((prev) => ({ ...prev, open: false }));
                  if (href) router.push(href);
                }}
                className="rounded-lg bg-slate-900 px-4 py-2 text-sm font-semibold text-white transition hover:bg-slate-800"
              >
                {modal.confirmLabel ?? "Cerrar"}
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
