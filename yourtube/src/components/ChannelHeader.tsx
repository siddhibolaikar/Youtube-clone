import React, { useState } from "react";
import { Avatar, AvatarFallback } from "./ui/avatar";
import { Button } from "./ui/button";
import type { AppUser, Channel } from "@/lib/types";

interface ChannelHeaderProps {
  channel: Channel;
  user: AppUser | null;
}

const ChannelHeader = ({ channel, user }: ChannelHeaderProps) => {
  const [isSubscribed, setIsSubscribed] = useState(false);

  return (
    <div className="w-full">
      <div className="relative h-32 md:h-48 lg:h-64 bg-gradient-to-r from-blue-400 to-purple-500 overflow-hidden"></div>

      <div className="px-4 py-6">
        <div className="flex flex-col md:flex-row gap-6 items-start">
          <Avatar className="w-20 h-20 md:w-32 md:h-32">
            <AvatarFallback className="text-2xl">
              {channel?.channelname?.[0]}
            </AvatarFallback>
          </Avatar>

          <div className="flex-1 space-y-2">
            <h1 className="text-2xl md:text-4xl font-bold">
              {channel?.channelname}
            </h1>
            <div className="flex flex-wrap gap-4 text-sm text-muted-foreground">
              <span>
                @{channel?.channelname?.toLowerCase().replace(/\s+/g, "")}
              </span>
            </div>
            {channel?.description && (
              <p className="text-sm text-muted-foreground max-w-2xl">
                {channel?.description}
              </p>
            )}
          </div>

          {user && user?.uid !== channel?.uid && (
            <div className="flex gap-2">
              <Button
                onClick={() => setIsSubscribed(!isSubscribed)}
                variant={isSubscribed ? "outline" : "default"}
                className={
                  isSubscribed ? "bg-secondary" : "bg-red-600 hover:bg-red-700 text-white"
                }
              >
                {isSubscribed ? "Subscribed" : "Subscribe"}
              </Button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default ChannelHeader;
