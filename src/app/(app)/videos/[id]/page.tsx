import { OpenVideo } from "@/components/videos/OpenVideo";

export default async function VideoPage(props: PageProps<"/videos/[id]">) {
  const { id } = await props.params;
  return <OpenVideo key={id} id={id} />;
}
