import React, { useEffect, useState } from "react";
import { Avatar, AvatarFallback } from "./ui/avatar";
import { Button } from "./ui/button";
import { Clock, Download, MoreHorizontal, Share, ThumbsUp } from "lucide-react";
import { formatDistanceToNow } from "date-fns";
import { toast } from "sonner";
import { useUser } from "@/lib/AuthContext";
import { toggleLike, checkLiked } from "@/lib/likeService";
import { addToHistory } from "@/lib/historyService";
import { toggleWatchLater } from "@/lib/watchlaterService";
import { incrementViews } from "@/lib/videoService";
import { ApiError, apiFetch, errorMessage } from "@/lib/apiClient";
import { quotaLabel, type DownloadQuota } from "@/lib/downloadQuota";
import { toDate, type Video } from "@/lib/types";
import PremiumDialog from "./PremiumDialog";

/** Navigating to an attachment URL downloads it without leaving the page. */
function triggerDownload(url: string) {
  const a = document.createElement("a");
  a.href = url;
  a.rel = "noopener";
  document.body.appendChild(a);
  a.click();
  a.remove();
}

const VideoInfo = ({ video }: { video: Video }) => {
  const [likes, setlikes] = useState(video.likes || 0);
  const [isLiked, setIsLiked] = useState(false);
  const [showFullDescription, setShowFullDescription] = useState(false);
  const { user } = useUser();
  const [isWatchLater, setIsWatchLater] = useState(false);
  const [downloading, setDownloading] = useState(false);
  const [premiumOpen, setPremiumOpen] = useState(false);

  useEffect(() => {
    setlikes(video.likes || 0);
    setIsLiked(false);
  }, [video]);

  useEffect(() => {
    const handleViews = async () => {
      try {
        await incrementViews(video.id);
        if (user) {
          await addToHistory(video.id, user.uid);
        }
      } catch (error) {
        console.log(error);
      }
    };
    handleViews();
  }, [video.id, user]);

  useEffect(() => {
    if (!user) return;
    checkLiked(video.id, user.uid).then(setIsLiked);
  }, [video.id, user]);

  const handleLike = async () => {
    if (!user) return;
    try {
      const liked = await toggleLike(video.id, user.uid);
      setIsLiked(liked);
      setlikes((prev: number) => (liked ? prev + 1 : prev - 1));
    } catch (error) {
      console.log(error);
    }
  };

  const handleWatchLater = async () => {
    if (!user) return;
    try {
      const added = await toggleWatchLater(video.id, user.uid);
      setIsWatchLater(added);
    } catch (error) {
      console.log(error);
    }
  };

  const handleDownload = async () => {
    if (!user) {
      toast.info("Sign in to download videos");
      return;
    }
    setDownloading(true);
    try {
      const { url, quota } = await apiFetch<{ url: string; quota: DownloadQuota }>("/api/downloads", {
        method: "POST",
        body: { videoId: video.id },
      });
      triggerDownload(url);
      toast.success(`Download started · ${quotaLabel(quota)}`);
    } catch (err) {
      if (err instanceof ApiError && err.reason === "DAILY_LIMIT") {
        setPremiumOpen(true);
      } else {
        toast.error(errorMessage(err));
      }
    } finally {
      setDownloading(false);
    }
  };

  const createdAt = toDate(video.createdAt);

  return (
    <div className="space-y-4">
      <h1 className="text-xl font-semibold">{video.videotitle}</h1>

      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-4">
          <Avatar className="w-10 h-10">
            <AvatarFallback>{video.videochanel?.[0]}</AvatarFallback>
          </Avatar>
          <div>
            <h3 className="font-medium">{video.videochanel}</h3>
            <p className="text-sm text-muted-foreground">1.2M subscribers</p>
          </div>
          <Button className="ml-4">Subscribe</Button>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <div className="flex items-center bg-secondary rounded-full">
            <Button variant="ghost" size="sm" className="rounded-l-full" onClick={handleLike}>
              <ThumbsUp className={`w-5 h-5 mr-2 ${isLiked ? "fill-current" : ""}`} />
              {likes.toLocaleString()}
            </Button>
          </div>
          <Button
            variant="ghost"
            size="sm"
            className={`bg-secondary rounded-full ${isWatchLater ? "text-primary" : ""}`}
            onClick={handleWatchLater}
          >
            <Clock className="w-5 h-5 mr-2" />
            {isWatchLater ? "Saved" : "Watch Later"}
          </Button>
          <Button variant="ghost" size="sm" className="bg-secondary rounded-full">
            <Share className="w-5 h-5 mr-2" />
            Share
          </Button>
          <Button
            variant="ghost"
            size="sm"
            className="bg-secondary rounded-full"
            onClick={handleDownload}
            disabled={downloading}
            data-testid="download-button"
          >
            <Download className="w-5 h-5 mr-2" />
            {downloading ? "Preparing…" : "Download"}
          </Button>
          <Button variant="ghost" size="icon" className="bg-secondary rounded-full">
            <MoreHorizontal className="w-5 h-5" />
          </Button>
        </div>
      </div>
      <div className="bg-secondary rounded-lg p-4">
        <div className="flex gap-4 text-sm font-medium mb-2">
          <span>{video.views?.toLocaleString()} views</span>
          {!isNaN(createdAt.getTime()) && <span>{formatDistanceToNow(createdAt)} ago</span>}
        </div>
        <div className={`text-sm ${showFullDescription ? "" : "line-clamp-3"}`}>
          <p>Sample video description. This would contain the actual video description from the database.</p>
        </div>
        <Button
          variant="ghost"
          size="sm"
          className="mt-2 p-0 h-auto font-medium"
          onClick={() => setShowFullDescription(!showFullDescription)}
        >
          {showFullDescription ? "Show less" : "Show more"}
        </Button>
      </div>
      <PremiumDialog
        open={premiumOpen}
        onOpenChange={setPremiumOpen}
        reason="You've used today's free download. Premium removes the limit."
        onPurchased={handleDownload}
      />
    </div>
  );
};

export default VideoInfo;
