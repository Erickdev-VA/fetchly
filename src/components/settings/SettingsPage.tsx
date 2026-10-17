"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  fetchImport,
  fetchLibraryMove,
  fetchSettings,
  fetchStorage,
  fetchYtDlpVersion,
  moveLibrary,
  setShareableDefault,
  startImport,
  updateYtDlp,
  type AppSettings,
  type ImportProgress,
  type LibraryMove,
  type StorageUsage,
} from "@/lib/api";
import { desktop } from "@/lib/desktop";
import { formatBytes } from "@/lib/format";
import { ErrorBanner } from "../ErrorBanner";
import { ConfirmDialog } from "../library/ConfirmDialog";
import { PageHeader } from "../shell/PageHeader";

const POLL_MS = 700;

/** Mirrors targetRootFor() in lib/library/moveJob.ts, to show where the library will end up. */
function targetRootFor(chosen: string): string {
  const name = chosen.split(/[\\/]/).filter(Boolean).at(-1) ?? "";
  return name.toLowerCase() === "fetchly" ? chosen : `${chosen.replace(/[\\/]+$/, "")}\\Fetchly`;
}

const errorText = (err: unknown, fallback: string) => (err instanceof Error && err.message ? err.message : fallback);

function Section({ title, description, children }: { title: string; description?: string; children: React.ReactNode }) {
  return (
    <section className="rounded-2xl border border-white/[0.07] bg-white/[0.02] p-5">
      <h2 className="text-[15px] font-semibold text-white">{title}</h2>
      {description && <p className="mt-1 text-sm text-white/45">{description}</p>}
      <div className="mt-4">{children}</div>
    </section>
  );
}

function Button({
  children,
  onClick,
  disabled,
  primary,
}: {
  children: React.ReactNode;
  onClick: () => void;
  disabled?: boolean;
  primary?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={`rounded-xl px-3.5 py-2 text-sm font-medium transition disabled:cursor-default disabled:opacity-40 ${
        primary ? "bg-[var(--accent)] font-semibold text-white enabled:hover:brightness-110" : "bg-white/[0.08] text-white/85 enabled:hover:bg-white/[0.14]"
      }`}
    >
      {children}
    </button>
  );
}

function ProgressBar({ value, label }: { value: number; label: string }) {
  return (
    <div className="mt-3">
      <div className="h-1.5 overflow-hidden rounded-full bg-white/10" role="progressbar" aria-valuenow={Math.round(value * 100)} aria-label={label}>
        <div className="h-full rounded-full bg-[var(--accent)] transition-[width] duration-300" style={{ width: `${Math.round(value * 100)}%` }} />
      </div>
      <p className="mt-1.5 text-xs text-white/50">{label}</p>
    </div>
  );
}

/** Repeats `poll` while it says the job is still running. */
function usePolling<T extends { running: boolean }>(poll: (() => Promise<T | null>) | null, onUpdate: (value: T) => void) {
  const onUpdateRef = useRef(onUpdate);
  useEffect(() => {
    onUpdateRef.current = onUpdate;
  });
  useEffect(() => {
    if (!poll) return;
    let live = true;
    let timer = 0;
    const tick = async () => {
      const value = await poll().catch(() => null);
      if (!live) return;
      if (value) onUpdateRef.current(value);
      if (!value || value.running) timer = window.setTimeout(tick, POLL_MS);
    };
    timer = window.setTimeout(tick, POLL_MS);
    return () => {
      live = false;
      window.clearTimeout(timer);
    };
  }, [poll]);
}

/** Ajustes: the library folder, importing, space used, download defaults and versions. */
export function SettingsPage() {
  const bridge = desktop();
  const [info, setInfo] = useState<AppSettings | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [storage, setStorage] = useState<StorageUsage | null>(null);
  const [move, setMove] = useState<LibraryMove | null>(null);
  const [pendingMove, setPendingMove] = useState<string | null>(null);
  const [moveError, setMoveError] = useState<string | null>(null);
  const [importJob, setImportJob] = useState<ImportProgress | null>(null);
  const [importError, setImportError] = useState<string | null>(null);
  const [ytdlp, setYtdlp] = useState<{ version: string | null; checking: boolean; message: string | null }>({
    version: null,
    checking: false,
    message: null,
  });

  const refresh = useCallback(async () => {
    try {
      setInfo(await fetchSettings());
      setLoadError(null);
    } catch (err) {
      setLoadError(errorText(err, "No se pudieron cargar los ajustes."));
    }
    fetchStorage().then(setStorage, () => {});
  }, []);

  useEffect(() => {
    // From a callback rather than the effect body, as react-hooks/set-state-in-effect asks.
    const timer = window.setTimeout(() => {
      void refresh();
      // A move started earlier may still be running (the page was left and came back).
      fetchLibraryMove().then(({ move: current }) => current?.running && setMove(current), () => {});
      fetchYtDlpVersion().then(({ version }) => setYtdlp((s) => ({ ...s, version })), () => {});
    }, 0);
    return () => window.clearTimeout(timer);
  }, [refresh]);

  // --- moving the library ---

  const pollMove = useCallback(() => fetchLibraryMove().then(({ move: current }) => current), []);
  usePolling(move?.running ? pollMove : null, (current) => {
    setMove(current);
    if (!current.running) void refresh();
  });

  const chooseNewFolder = async () => {
    const folder = await bridge?.chooseFolder("library");
    if (folder) setPendingMove(folder);
  };

  const confirmMove = async () => {
    const folder = pendingMove;
    setPendingMove(null);
    if (!folder) return;
    try {
      setMoveError(null);
      setMove((await moveLibrary(folder)).move);
      void refresh();
    } catch (err) {
      setMoveError(errorText(err, "No se pudo cambiar la carpeta."));
    }
  };

  // --- importing ---

  const importId = importJob?.running ? importJob.id : null;
  const pollImport = useCallback(() => (importId ? fetchImport(importId) : Promise.resolve(null)), [importId]);
  usePolling(importId ? pollImport : null, (current) => {
    setImportJob(current);
    if (!current.running) void refresh();
  });

  const chooseImport = async () => {
    const folder = await bridge?.chooseFolder("import");
    if (!folder) return;
    try {
      setImportError(null);
      const id = await startImport(folder);
      setImportJob(await fetchImport(id));
    } catch (err) {
      setImportError(errorText(err, "No se pudo empezar a importar."));
    }
  };

  // --- yt-dlp ---

  const checkYtdlp = async () => {
    setYtdlp((s) => ({ ...s, checking: true, message: null }));
    try {
      const { result, version } = await updateYtDlp();
      const message =
        result === "updated" ? "Se actualizó a la última versión." : result === "current" ? "Ya tienes la última versión." : "No se pudo buscar la actualización. Revisa tu conexión.";
      setYtdlp({ version, checking: false, message });
    } catch {
      setYtdlp((s) => ({ ...s, checking: false, message: "No se pudo buscar la actualización." }));
    }
  };

  const moving = move?.running ?? false;
  const importing = importJob?.running ?? false;
  const totalUsed = storage ? storage.music.bytes + storage.video.bytes : 0;

  return (
    <div className="mx-auto w-full max-w-3xl px-6 py-8">
      <PageHeader title="Ajustes" />
      {loadError && !info && <ErrorBanner message={loadError} />}

      <div className="flex flex-col gap-4">
        <Section title="Carpeta de la biblioteca" description="Aquí se guardan tus canciones y videos, en las carpetas Música y Videos.">
          <p className="break-all rounded-xl bg-black/30 px-3 py-2 font-mono text-[12.5px] text-white/75">{info?.library.path ?? "…"}</p>
          <div className="mt-3 flex flex-wrap gap-2">
            <Button onClick={() => void bridge?.openLibraryFolder("root")} disabled={!bridge}>
              Abrir
            </Button>
            <Button onClick={() => void chooseNewFolder()} disabled={!bridge || moving || importing}>
              Cambiar…
            </Button>
          </div>
          {move && moving && (
            <ProgressBar
              value={move.totalBytes > 0 ? move.movedBytes / move.totalBytes : 0}
              label={`Moviendo ${move.movedFiles} de ${move.totalFiles} archivos · ${formatBytes(move.movedBytes) ?? "0 B"} de ${formatBytes(move.totalBytes) ?? "0 B"}. La música sigue sonando.`}
            />
          )}
          {move && !moving && (
            <div className="mt-3 text-xs">
              {move.error ? (
                <p className="text-red-300">{move.error}</p>
              ) : (
                <p className="text-emerald-300/85">
                  ✓ Biblioteca movida a {move.to} ({move.movedFiles - move.failed.length} archivo{move.movedFiles - move.failed.length === 1 ? "" : "s"}).
                </p>
              )}
              {move.failed.length > 0 && (
                <p className="mt-1 text-amber-300/90">
                  No se pudieron mover {move.failed.length}: {move.failed.slice(0, 5).join(", ")}
                  {move.failed.length > 5 ? "…" : ""}. Siguen funcionando donde estaban.
                </p>
              )}
            </div>
          )}
          {moveError && <p className="mt-3 text-xs text-red-300">{moveError}</p>}
        </Section>

        <Section title="Importar carpeta" description="Copia a tu biblioteca la música y los videos que ya tengas en otra carpeta. Los originales no se tocan.">
          <Button onClick={() => void chooseImport()} disabled={!bridge || importing || moving} primary>
            Importar carpeta…
          </Button>
          {importJob && importing && (
            <ProgressBar
              value={importJob.total > 0 ? importJob.done / importJob.total : 0}
              label={importJob.total > 0 ? `Importando ${importJob.done} de ${importJob.total}…` : "Buscando archivos…"}
            />
          )}
          {importJob && !importing && <ImportResult job={importJob} />}
          {importError && <p className="mt-3 text-xs text-red-300">{importError}</p>}
        </Section>

        <Section title="Espacio usado">
          {storage ? (
            <dl className="grid grid-cols-[auto_1fr] gap-x-6 gap-y-1.5 text-sm">
              <dt className="text-white/50">Música</dt>
              <dd className="text-white/85">
                {formatBytes(storage.music.bytes) ?? "0 B"} · {storage.music.files} archivo{storage.music.files === 1 ? "" : "s"}
              </dd>
              <dt className="text-white/50">Videos</dt>
              <dd className="text-white/85">
                {formatBytes(storage.video.bytes) ?? "0 B"} · {storage.video.files} archivo{storage.video.files === 1 ? "" : "s"}
              </dd>
              <dt className="font-medium text-white/70">Total</dt>
              <dd className="font-medium text-white">{formatBytes(totalUsed) ?? "0 B"}</dd>
              {storage.freeBytes !== null && (
                <>
                  <dt className="text-white/50">Libre en el disco</dt>
                  <dd className="text-white/85">{formatBytes(storage.freeBytes)}</dd>
                </>
              )}
            </dl>
          ) : (
            <p className="text-sm text-white/40">Calculando…</p>
          )}
        </Section>

        <Section title="Descargas">
          <label className="flex cursor-pointer items-start justify-between gap-4">
            <span>
              <span className="block text-sm text-white/85">Compatible con WhatsApp, activado por defecto</span>
              <span className="mt-0.5 block text-xs text-white/45">
                Convierte a H.264/AAC cuando hace falta, para poder enviar el archivo por WhatsApp. Tarda un poco más.
              </span>
            </span>
            <button
              type="button"
              role="switch"
              aria-checked={info?.settings.shareableDefault ?? true}
              disabled={!info}
              onClick={() => {
                if (!info) return;
                const value = !info.settings.shareableDefault;
                setInfo({ ...info, settings: { ...info.settings, shareableDefault: value } });
                setShareableDefault(value).catch(() => void refresh());
              }}
              className={`relative mt-0.5 h-5 w-9 shrink-0 rounded-full transition-colors ${
                info?.settings.shareableDefault ?? true ? "bg-[var(--accent)]" : "bg-white/15"
              }`}
            >
              <span
                className={`absolute top-0.5 h-4 w-4 rounded-full bg-white transition-[left] ${
                  info?.settings.shareableDefault ?? true ? "left-[18px]" : "left-0.5"
                }`}
              />
            </button>
          </label>
        </Section>

        <Section title="Acerca de">
          <dl className="grid grid-cols-[auto_1fr] items-center gap-x-6 gap-y-2 text-sm">
            <dt className="text-white/50">Fetchly</dt>
            <dd className="text-white/85">{info?.version ? `Versión ${info.version}` : "—"}</dd>
            <dt className="text-white/50">yt-dlp</dt>
            <dd className="flex flex-wrap items-center gap-3 text-white/85">
              {ytdlp.version ?? "…"}
              <Button onClick={() => void checkYtdlp()} disabled={ytdlp.checking}>
                {ytdlp.checking ? "Buscando…" : "Buscar actualización ahora"}
              </Button>
            </dd>
          </dl>
          {ytdlp.message && <p className="mt-3 text-xs text-white/55">{ytdlp.message}</p>}
          <p className="mt-3 text-xs text-white/35">yt-dlp es lo que descarga de YouTube y las demás plataformas. Se actualiza solo una vez al día.</p>
        </Section>
      </div>

      {pendingMove && (
        <ConfirmDialog
          title="¿Mover la biblioteca?"
          message={`Tus canciones y videos se moverán a ${targetRootFor(pendingMove)}. Puedes seguir escuchando música mientras tanto.`}
          confirmLabel="Mover"
          tone="primary"
          onConfirm={() => void confirmMove()}
          onCancel={() => setPendingMove(null)}
        />
      )}
    </div>
  );
}

function ImportResult({ job }: { job: ImportProgress }) {
  if (job.error) return <p className="mt-3 text-xs text-red-300">{job.error}</p>;
  const { music, video } = job.imported;
  const parts = [
    music > 0 && `${music} canci${music === 1 ? "ón" : "ones"}`,
    video > 0 && `${video} video${video === 1 ? "" : "s"}`,
  ].filter(Boolean);
  return (
    <div className="mt-3 text-xs">
      {parts.length > 0 ? (
        <p className="text-emerald-300/85">✓ Se importaron {parts.join(" y ")}.</p>
      ) : (
        <p className="text-white/60">No se importó nada nuevo{job.total === 0 ? ": esa carpeta no tiene música ni videos" : ""}.</p>
      )}
      {job.skipped.length > 0 && (
        <details className="mt-2">
          <summary className="cursor-pointer text-amber-300/90">
            {job.skipped.length} archivo{job.skipped.length === 1 ? "" : "s"} omitido{job.skipped.length === 1 ? "" : "s"}
          </summary>
          <ul className="mt-2 max-h-48 overflow-y-auto rounded-xl bg-black/30 p-2">
            {job.skipped.map((s, i) => (
              <li key={`${s.name}-${i}`} className="flex justify-between gap-3 px-1 py-0.5">
                <span className="truncate text-white/70" title={s.name}>
                  {s.name}
                </span>
                <span className="shrink-0 text-white/40">{s.reason}</span>
              </li>
            ))}
          </ul>
        </details>
      )}
      {job.ignored > 0 && (
        <p className="mt-1 text-white/40">
          {job.ignored} archivo{job.ignored === 1 ? "" : "s"} que no son audio ni video se dejaron sin tocar.
        </p>
      )}
    </div>
  );
}
