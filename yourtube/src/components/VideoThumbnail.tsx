import { formatClock } from "@/lib/watchLimit";
import type { Video } from "@/lib/types";

/**
 * A still poster for video lists. Lists use an <img>, never a <video>: every
 * <video> opens its own media stream, and a page of them starves the player.
 */
export default function VideoThumbnail({ video, className = "" }: { video: Pick<Video, "poster" | "duration">; className?: string }) {
  return (
    <>
      {video.poster && (
        // eslint-disable-next-line @next/next/no-img-element -- small static poster
        <img src={video.poster} alt="" loading="lazy" className={`w-full h-full object-cover ${className}`} />
      )}
      {video.duration != null && (
        <div className="absolute bottom-1 right-1 bg-black/80 text-white text-xs px-1 rounded">{formatClock(video.duration)}</div>
      )}
    </>
  );
}
