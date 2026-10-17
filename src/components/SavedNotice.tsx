"use client";

import { desktop } from "@/lib/desktop";
import { CATEGORY_LABEL, type Category } from "@/lib/library/types";

/** "✓ Guardado en Música · Mostrar en carpeta" after a download lands in the library. */
export function SavedNotice({ category, filePath, text }: { category: Category; filePath?: string; text?: string }) {
  const bridge = desktop();
  return (
    <p className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-emerald-300/85">
      <span>✓ {text ?? `Guardado en ${CATEGORY_LABEL[category]}`}</span>
      {bridge && (
        <button
          type="button"
          onClick={() => void (filePath ? bridge.showItemInFolder(filePath) : bridge.openLibraryFolder(category))}
          className="font-medium text-white/60 underline-offset-2 transition hover:text-white hover:underline"
        >
          {filePath ? "Mostrar en carpeta" : "Abrir carpeta"}
        </button>
      )}
    </p>
  );
}
