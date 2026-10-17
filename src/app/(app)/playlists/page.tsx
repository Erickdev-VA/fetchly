import { redirect } from "next/navigation";

/** The playlists moved to the top of Música; the old address still leads there. */
export default function PlaylistsPage() {
  redirect("/musica");
}
