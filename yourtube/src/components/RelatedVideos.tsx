import Link from "next/link";
import { formatDistanceToNow } from "date-fns";
import { toDate, type FirestoreDate, type Video } from "@/lib/types";

interface RelatedVideosProps {
  videos: Video[];
}

export default function RelatedVideos({ videos }: RelatedVideosProps) {
  const formatDate = (createdAt: FirestoreDate) => {
    const d = toDate(createdAt);
    return isNaN(d.getTime()) ? "" : formatDistanceToNow(d);
  };

  return (
    <div className="space-y-2">
      {videos?.map((video) => (
        <Link
          key={video.id}
          href={`/watch/${video.id}`}
          className="flex gap-2 group"
        >
          <div className="relative w-40 aspect-video bg-muted rounded overflow-hidden flex-shrink-0">
            <video
              src={video.videoUrl}
              className="object-cover group-hover:scale-105 transition-transform duration-200"
            />
          </div>
          <div className="flex-1 min-w-0">
            <h3 className="font-medium text-sm line-clamp-2 group-hover:text-blue-600 dark:group-hover:text-blue-400">
              {video.videotitle}
            </h3>
            <p className="text-xs text-muted-foreground mt-1">{video.videochanel}</p>
            <p className="text-xs text-muted-foreground">
              {video.views?.toLocaleString()} views •{" "}
              {formatDate(video.createdAt)} ago
            </p>
          </div>
        </Link>
      ))}
    </div>
  );
}
