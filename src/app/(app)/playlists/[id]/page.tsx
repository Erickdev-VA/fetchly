import { PlaylistView } from "@/components/playlists/PlaylistView";

export default async function PlaylistPage(props: PageProps<"/playlists/[id]">) {
  const { id } = await props.params;
  // Keyed, so moving to another playlist starts from a clean state.
  return <PlaylistView key={id} id={id} />;
}
