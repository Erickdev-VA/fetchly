import { PlaylistView } from "@/components/playlists/PlaylistView";

/** A playlist of videos: the same page as a playlist of songs, under Videos. */
export default async function VideoPlaylistPage(props: { params: Promise<{ id: string }> }) {
  const { id } = await props.params;
  return <PlaylistView key={id} id={id} />;
}
