"use client";
import Link from "next/link";
import { formatDistanceToNow } from "date-fns";
import { Avatar, AvatarFallback } from "./ui/avatar";
import { toDate, type Video } from "@/lib/types";
import VideoThumbnail from "./VideoThumbnail";

export default function VideoCard({ video }: { video: Video }) {
  const created = toDate(video.createdAt);
  return (
    <Link href={`/watch/${video?.id}`} className="group">
      <div className="space-y-3">
        <div className="relative aspect-video rounded-lg overflow-hidden bg-muted">
          <VideoThumbnail video={video} className="group-hover:scale-105 transition-transform duration-200" />
        </div>
        <div className="flex gap-3">
          <Avatar className="w-9 h-9 flex-shrink-0">
            <AvatarFallback>{video?.videochanel?.[0]}</AvatarFallback>
          </Avatar>
          <div className="flex-1 min-w-0">
            <h3 className="font-medium text-sm line-clamp-2 group-hover:text-blue-600 dark:group-hover:text-blue-400">
              {video?.videotitle}
            </h3>
            <p className="text-sm text-muted-foreground mt-1">{video?.videochanel}</p>
            <p className="text-sm text-muted-foreground">
              {video?.views?.toLocaleString()} views •{" "}
              {isNaN(created.getTime()) ? "" : `${formatDistanceToNow(created)} ago`}
            </p>
          </div>
        </div>
      </div>
    </Link>
  );
}
