import Comments from "@/components/Comments";
import RelatedVideos from "@/components/RelatedVideos";
import VideoInfo from "@/components/VideoInfo";
import Videopplayer from "@/components/Videopplayer";
import { getAllVideos, getVideoById } from "@/lib/videoService";
import { useRouter } from "next/router";
import React, { useEffect, useState } from "react";
import type { Video } from "@/lib/types";

const WatchPage = () => {
  const router = useRouter();
  const { id } = router.query;
  const [video, setvideo] = useState<Video | null>(null);
  const [allVideos, setAllVideos] = useState<Video[]>([]);
  const [loading, setloading] = useState(true);

  useEffect(() => {
    const fetchvideo = async () => {
      if (!id || typeof id !== "string") return;
      try {
        const [v, all] = await Promise.all([
          getVideoById(id),
          getAllVideos(),
        ]);
        setvideo(v);
        setAllVideos(all.filter((vid) => vid.id !== id));
      } catch (error) {
        console.log(error);
      } finally {
        setloading(false);
      }
    };
    fetchvideo();
  }, [id]);

  if (loading) {
    return <div>Loading..</div>;
  }

  if (!video) {
    return <div>Video not found</div>;
  }

  return (
    <div className="flex-1 min-w-0 min-h-screen">
      <div className="max-w-7xl mx-auto p-4">
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <div className="lg:col-span-2 space-y-4">
            <Videopplayer video={video} relatedVideos={allVideos} />
            <VideoInfo video={video} />
            <Comments videoId={id as string} />
          </div>
          <div className="space-y-4">
            <RelatedVideos videos={allVideos} />
          </div>
        </div>
      </div>
    </div>
  );
};

export default WatchPage;
