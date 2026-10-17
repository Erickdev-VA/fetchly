# Fetchly

App de escritorio (Windows) para descargar música y videos de YouTube, TikTok, Instagram y X, y guardarlos en una biblioteca local:

- Audio → `Documentos\Fetchly\Música`
- Video y video sin sonido → `Documentos\Fetchly\Videos`

La base de datos de la biblioteca y las portadas se guardan en `%APPDATA%\Fetchly`.

## Desarrollo

```bash
npm install
npm run dev
```

`npm run dev` abre la app en Electron con `next dev` detrás (recarga en caliente para todo lo que está en `src/`). Los cambios en `electron/` necesitan reiniciar el comando.

## Compilar

```bash
npm run electron:preview   # compila el servidor y abre la app tal como queda instalada
npm run dist:win           # genera el instalador en release/
```

`npm run build:desktop` deja el servidor autónomo de Next.js en `dist-desktop/server`, con yt-dlp y ffmpeg incluidos.
