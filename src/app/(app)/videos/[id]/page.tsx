import { VideoPlayerView } from "@/components/videos/VideoPlayerView";

export default async function VideoPage(props: PageProps<"/videos/[id]">) {
  const { id } = await props.params;
  return <VideoPlayerView key={id} id={id} />;
}
