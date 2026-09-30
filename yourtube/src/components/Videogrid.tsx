import React, { useEffect, useState } from "react";
import Videocard from "./videocard";
import { getAllVideos } from "@/lib/videoService";
import type { Video } from "@/lib/types";

const Videogrid = () => {
  const [videos, setvideo] = useState<Video[]>([]);
  const [loading, setloading] = useState(true);

  useEffect(() => {
    const fetchvideo = async () => {
      try {
        const data = await getAllVideos();
        setvideo(data);
      } catch (error) {
        console.log(error);
      } finally {
        setloading(false);
      }
    };
    fetchvideo();
  }, []);

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
      {loading ? (
        <p className="text-muted-foreground">Loading…</p>
      ) : videos.length === 0 ? (
        <div className="col-span-full py-16 text-center text-muted-foreground" data-testid="no-videos">
          <p className="text-lg font-medium text-foreground">No videos yet</p>
          <p className="mt-1 text-sm">Sign in, create your channel and upload the first one.</p>
        </div>
      ) : (
        videos.map((video) => <Videocard key={video.id} video={video} />)
      )}
    </div>
  );
};

export default Videogrid;
