import { deleteLibraryItem } from "../api";
import { desktop } from "../desktop";
import type { LibraryEntry } from "./types";

/**
 * Page-side "Borrar": the file goes to the Windows Recycle Bin (through
 * Electron), then the library forgets it. Throws with a message for the
 * user if either half fails; the entry stays if the file couldn't be moved.
 */
export async function removeFromLibrary(entry: LibraryEntry): Promise<void> {
  const bridge = desktop();
  if (!bridge) throw new Error("Solo se puede borrar desde la app de escritorio.");
  if (!(await bridge.trashItem(entry.filePath))) {
    throw new Error("No se pudo mandar el archivo a la Papelera. Puede que esté abierto en otro programa.");
  }
  try {
    await deleteLibraryItem(entry.id);
  } catch {
    throw new Error("El archivo está en la Papelera, pero no se pudo quitar de la biblioteca.");
  }
}

/**
 * "Borrar" for several songs: one at a time, carrying on past failures.
 * `before` runs ahead of each one (to stop it if it's playing). Returns
 * how many went and the first error, if any failed.
 */
export async function removeManyFromLibrary(
  entries: LibraryEntry[],
  before: (entry: LibraryEntry) => void,
): Promise<{ removed: number; failed: number; firstError: string | null }> {
  let removed = 0;
  let firstError: string | null = null;
  for (const entry of entries) {
    try {
      before(entry);
      await removeFromLibrary(entry);
      removed++;
    } catch (err) {
      firstError ??= err instanceof Error ? err.message : "No se pudo borrar.";
    }
  }
  return { removed, failed: entries.length - removed, firstError };
}

/** "3 canciones" / "1 canción" */
export function songCount(n: number): string {
  return `${n} canci${n === 1 ? "ón" : "ones"}`;
}
