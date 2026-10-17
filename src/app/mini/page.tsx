import type { Metadata } from "next";
import { MiniPlayer } from "@/components/mini/MiniPlayer";

export const metadata: Metadata = {
  title: "Mini reproductor · Pista",
};

/**
 * The floating mini player's window. It sits outside the (app) group on
 * purpose: no menu, no playback bar and, above all, no <audio> of its own.
 * It only mirrors and remote-controls the main window's player.
 */
export default function MiniPage() {
  return <MiniPlayer />;
}
