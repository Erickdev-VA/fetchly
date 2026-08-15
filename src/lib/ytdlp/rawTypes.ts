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
