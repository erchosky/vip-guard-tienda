"use client";

import Image from "next/image";
import { useEffect, useRef, useState } from "react";
import { ArrowLeft, ArrowRight, ImagePlus, Loader2, Star, X } from "lucide-react";
import { cn } from "@/components/ui/cn";

export type UploadedImage = { path: string; url: string; width: number; height: number };
type Pending = { id: string; preview: string; error?: string };

const MAX_SIDE = 1600;
const MAX_SOURCE_BYTES = 25 * 1024 * 1024;

/** Reduce y recomprime en el navegador (WebP, o JPEG en Safari que no genera WebP). */
async function optimize(file: File): Promise<File> {
  if (!file.type.startsWith("image/")) throw new Error("Ese archivo no es una imagen.");
  if (file.size > MAX_SOURCE_BYTES) throw new Error("La foto es demasiado grande (máx. 25 MB).");
  const bitmap = await createImageBitmap(file).catch(() => {
    throw new Error("No se pudo leer la foto. Prueba con JPG o PNG.");
  });
  if (bitmap.width < 32 || bitmap.height < 32) throw new Error("La foto es demasiado pequeña.");
  const scale = Math.min(1, MAX_SIDE / Math.max(bitmap.width, bitmap.height));
  const canvas = document.createElement("canvas");
  canvas.width = Math.round(bitmap.width * scale);
  canvas.height = Math.round(bitmap.height * scale);
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Tu navegador no puede procesar la foto.");
  ctx.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  bitmap.close();
  const toBlob = (type: string, quality: number) => new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, type, quality));
  let blob = await toBlob("image/webp", 0.82);
  if (!blob || blob.type !== "image/webp") blob = await toBlob("image/jpeg", 0.85);
  if (!blob) throw new Error("No se pudo optimizar la foto.");
  if (blob.size > 5 * 1024 * 1024) throw new Error("La foto optimizada sigue pasando de 5 MB.");
  const ext = blob.type === "image/webp" ? "webp" : "jpg";
  return new File([blob], `foto.${ext}`, { type: blob.type });
}

export function ImageUploader({ name, folder, initial = [], multiple = true, max = 12, label, onChange }: { name: string; folder: "products" | "categories" | "brand"; initial?: UploadedImage[]; multiple?: boolean; max?: number; label?: string; onChange?: (images: UploadedImage[]) => void }) {
  const [images, setImages] = useState<UploadedImage[]>(initial);
  const onChangeRef = useRef(onChange);
  onChangeRef.current = onChange;
  useEffect(() => { onChangeRef.current?.(images); }, [images]);
  const [pending, setPending] = useState<Pending[]>([]);
  const inputRef = useRef<HTMLInputElement>(null);
  const limit = multiple ? max : 1;

  async function handle(files: FileList | null) {
    if (!files?.length) return;
    const slots = Math.max(0, limit - (multiple ? images.length : 0));
    const list = Array.from(files).slice(0, multiple ? slots : 1);
    for (const file of list) {
      const id = Math.random().toString(36).slice(2);
      const preview = URL.createObjectURL(file);
      setPending((p) => [...p, { id, preview }]);
      try {
        const optimized = await optimize(file);
        const body = new FormData();
        body.set("file", optimized);
        body.set("folder", folder);
        const res = await fetch("/api/admin/upload", { method: "POST", body });
        const json = await res.json().catch(() => null);
        if (!res.ok || !json?.ok) throw new Error(json?.error?.message ?? "No se pudo subir la foto.");
        const uploaded = json.data as UploadedImage;
        setImages((current) => (multiple ? [...current, uploaded] : [uploaded]));
        setPending((p) => p.filter((x) => x.id !== id));
        URL.revokeObjectURL(preview);
      } catch (error) {
        setPending((p) => p.map((x) => (x.id === id ? { ...x, error: error instanceof Error ? error.message : "Error al subir" } : x)));
      }
    }
    if (inputRef.current) inputRef.current.value = "";
  }

  function move(index: number, delta: number) {
    setImages((current) => {
      const next = [...current];
      const target = index + delta;
      if (target < 0 || target >= next.length) return current;
      [next[index], next[target]] = [next[target], next[index]];
      return next;
    });
  }

  const busy = pending.some((p) => !p.error);
  return (
    <div>
      {label ? <p className="label">{label}</p> : null}
      <input type="hidden" name={name} value={JSON.stringify(images)} />
      {busy ? <input type="hidden" name="__uploading" value="1" /> : null}
      <div className={cn("grid gap-2", multiple ? "grid-cols-3 sm:grid-cols-4" : "max-w-[180px] grid-cols-1")}>
        {images.map((image, index) => (
          <div key={image.path} className="group relative aspect-square overflow-hidden rounded-xl border border-line bg-subtle">
            <Image src={image.url} alt="" fill sizes="200px" className="object-cover" unoptimized />
            {multiple && index === 0 ? <span className="absolute left-1.5 top-1.5 inline-flex items-center gap-1 rounded-full bg-black/60 px-2 py-0.5 text-[10px] font-medium text-white"><Star className="h-3 w-3" />Principal</span> : null}
            <div className="absolute inset-x-1 bottom-1 flex justify-between gap-1">
              {multiple ? (
                <span className="flex gap-1">
                  <button type="button" onClick={() => move(index, -1)} disabled={index === 0} className="grid h-7 w-7 place-items-center rounded-full bg-black/60 text-white disabled:opacity-30" aria-label="Mover a la izquierda"><ArrowLeft className="h-3.5 w-3.5" /></button>
                  <button type="button" onClick={() => move(index, 1)} disabled={index === images.length - 1} className="grid h-7 w-7 place-items-center rounded-full bg-black/60 text-white disabled:opacity-30" aria-label="Mover a la derecha"><ArrowRight className="h-3.5 w-3.5" /></button>
                </span>
              ) : <span />}
              <button type="button" onClick={() => setImages((c) => c.filter((x) => x.path !== image.path))} className="grid h-7 w-7 place-items-center rounded-full bg-black/60 text-white" aria-label="Quitar foto"><X className="h-3.5 w-3.5" /></button>
            </div>
          </div>
        ))}
        {pending.map((p) => (
          <div key={p.id} className="relative aspect-square overflow-hidden rounded-xl border border-line bg-subtle">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={p.preview} alt="" className="h-full w-full object-cover opacity-50" />
            <div className="absolute inset-0 grid place-items-center p-2 text-center">
              {p.error ? (
                <div className="rounded-lg bg-surface/95 p-2 text-[11px] text-danger">
                  {p.error}
                  <button type="button" className="mt-1 block w-full text-muted underline" onClick={() => setPending((list) => list.filter((x) => x.id !== p.id))}>Cerrar</button>
                </div>
              ) : <Loader2 className="h-6 w-6 animate-spin text-fg" />}
            </div>
          </div>
        ))}
        {(multiple ? images.length + pending.filter((p) => !p.error).length < limit : images.length === 0 && pending.length === 0) ? (
          <button type="button" onClick={() => inputRef.current?.click()} className="flex aspect-square flex-col items-center justify-center gap-1 rounded-xl border-2 border-dashed border-line text-muted transition hover:border-accent hover:text-accent">
            <ImagePlus className="h-6 w-6" />
            <span className="text-xs font-medium">{multiple ? "Añadir fotos" : "Subir imagen"}</span>
          </button>
        ) : null}
      </div>
      {multiple ? <p className="hint">La primera es la principal. Hasta {max} fotos; se optimizan solas antes de subir.</p> : null}
      <input ref={inputRef} type="file" accept="image/*" multiple={multiple} className="sr-only" onChange={(e) => void handle(e.target.files)} />
    </div>
  );
}
