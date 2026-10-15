export interface RawYtDlpFormat {
  format_id: string;
  ext: string;
  height?: number | null;
  width?: number | null;
  vcodec?: string | null;
  acodec?: string | null;
  filesize?: number | null;
  filesize_approx?: number | null;
  tbr?: number | null;
  format_note?: string | null;
  protocol?: string | null;
}

export interface RawYtDlpInfo {
  id: string;
  title: string;
  thumbnail?: string | null;
  duration?: number | null;
  is_live?: boolean | null;
  uploader?: string | null;
  channel?: string | null;
  formats?: RawYtDlpFormat[] | null;
}

export interface RawYtDlpThumbnail {
  url: string;
  width?: number | null;
  height?: number | null;
}

/** One entry of a `--flat-playlist` listing (not fully resolved). */
export interface RawYtDlpPlaylistEntry {
  id?: string | null;
  url?: string | null;
  title?: string | null;
  duration?: number | null;
  uploader?: string | null;
  channel?: string | null;
  live_status?: string | null;
  availability?: string | null;
  thumbnails?: RawYtDlpThumbnail[] | null;
}

export interface RawYtDlpPlaylist {
  _type?: string;
  id: string;
  title?: string | null;
  uploader?: string | null;
  channel?: string | null;
  playlist_count?: number | null;
  entries?: (RawYtDlpPlaylistEntry | null)[] | null;
}
