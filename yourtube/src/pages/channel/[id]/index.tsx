import ChannelHeader from "@/components/ChannelHeader";
import Channeltabs from "@/components/Channeltabs";
import ChannelVideos from "@/components/ChannelVideos";
import { useUser } from "@/lib/AuthContext";
import { getVideosByUploader } from "@/lib/videoService";
import { getChannelById } from "@/lib/userService";
import type { Channel, Video } from "@/lib/types";
import { useRouter } from "next/router";
import Link from "next/link";
import { Download } from "lucide-react";
import { Button } from "@/components/ui/button";
import React, { useEffect, useState } from "react";

const ChannelPage = () => {
  const router = useRouter();
  const { id } = router.query;
  const { user } = useUser();
  const [channel, setChannel] = useState<Channel | null>(null);
  const [videos, setVideos] = useState<Video[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchData = async () => {
      if (!id || typeof id !== "string") return;
      try {
        const [channelData, channelVideos] = await Promise.all([getChannelById(id), getVideosByUploader(id)]);
        setChannel(channelData);
        setVideos(channelVideos);
      } catch (error) {
        console.error("Error fetching channel data:", error);
      } finally {
        setLoading(false);
      }
    };
    fetchData();
  }, [id]);

  const isOwner = !!user && user.uid === id;
  // Accounts from before the channel card was written at sign-up may not have
  // one yet; the owner still sees their own channel from their profile.
  const shown: Channel | null =
    channel ??
    (isOwner && user.channelname
      ? { uid: user.uid, channelname: user.channelname, description: user.description, name: user.name, image: user.image }
      : null);

  if (loading) {
    return <div className="flex-1 p-4">Loading...</div>;
  }

  if (!shown) {
    return <div className="flex-1 p-4">Channel not found</div>;
  }

  return (
    <div className="flex-1 min-h-screen">
      <div className="max-w-full mx-auto">
        <ChannelHeader channel={shown} user={user} />
        <Channeltabs />
        {isOwner && (
          <div className="px-4 pb-4">
            <Button asChild variant="secondary" size="sm">
              <Link href="/downloads">
                <Download className="w-4 h-4" /> Your downloads
              </Link>
            </Button>
          </div>
        )}
        <div className="px-4 pb-8">
          <ChannelVideos videos={videos} />
        </div>
      </div>
    </div>
  );
};

export default ChannelPage;
