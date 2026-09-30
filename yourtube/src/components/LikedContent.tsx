import { ThumbsUp } from "lucide-react";
import VideoList from "./VideoList";
import { getLikedVideos, toggleLike } from "@/lib/likeService";

export default function LikedVideosContent() {
  return (
    <VideoList
      icon={ThumbsUp}
      load={getLikedVideos}
      remove={async (entry, uid) => {
        await toggleLike(entry.videoid.id, uid);
      }}
      signedOut={{ title: "Keep track of videos you like", body: "Sign in to see your liked videos." }}
      empty={{ title: "No liked videos yet", body: "Videos you like will appear here." }}
      verb="Liked"
      removeLabel="Remove from liked videos"
    />
  );
}
