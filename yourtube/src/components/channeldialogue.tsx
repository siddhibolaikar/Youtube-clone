import { useRouter } from "next/router";
import React, { ChangeEvent, FormEvent, useEffect, useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "./ui/dialog";
import { Label } from "./ui/label";
import { Input } from "./ui/input";
import { Textarea } from "./ui/textarea";
import { Button } from "./ui/button";
import { updateUser } from "@/lib/userService";
import { useUser } from "@/lib/AuthContext";
import type { Channel } from "@/lib/types";
import { toast } from "sonner";

interface ChanneldialogueProps {
  isopen: boolean;
  onclose: () => void;
  channeldata?: Channel | null;
  mode: "create" | "edit";
}

const Channeldialogue = ({ isopen, onclose, channeldata, mode }: ChanneldialogueProps) => {
  const { user, login } = useUser();
  const router = useRouter();
  const [formData, setFormData] = useState({
    name: "",
    description: "",
  });
  const [isSubmitting, setisSubmitting] = useState(false);

  useEffect(() => {
    if (channeldata && mode === "edit") {
      setFormData({
        name: channeldata.channelname || "",
        description: channeldata.description || "",
      });
    } else {
      setFormData({
        name: user?.name || "",
        description: "",
      });
    }
  }, [channeldata, mode, user?.name]);

  const handleChange = (
    e: ChangeEvent<HTMLInputElement | HTMLTextAreaElement>
  ) => {
    const { name, value } = e.target;
    setFormData((prev) => ({ ...prev, [name]: value }));
  };

  const handlesubmit = async (e: FormEvent) => {
    e.preventDefault();
    setisSubmitting(true);
    try {
      if (!user) return;
      const updated = await updateUser(user.uid, {
        channelname: formData.name,
        description: formData.description,
        name: user.name || "",
        image: user.image || "",
      });
      login(updated);
      router.push(`/channel/${user.uid}`);
      setFormData({ name: "", description: "" });
      onclose();
    } catch (error) {
      console.error(error);
      toast.error("Could not save your channel. Please try again.");
    } finally {
      setisSubmitting(false);
    }
  };

  return (
    <Dialog open={isopen} onOpenChange={onclose}>
      <DialogContent className="sm:max-w-md md:max-w-lg">
        <DialogHeader>
          <DialogTitle>
            {mode === "create" ? "Create your channel" : "Edit your channel"}
          </DialogTitle>
        </DialogHeader>

        <form onSubmit={handlesubmit} className="space-y-6">
          <div className="space-y-2">
            <Label htmlFor="name">Channel Name</Label>
            <Input
              id="name"
              name="name"
              value={formData.name}
              onChange={handleChange}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="description">Channel Description</Label>
            <Textarea
              id="description"
              name="description"
              value={formData.description}
              onChange={handleChange}
              rows={4}
              placeholder="Tell viewers about your channel..."
            />
          </div>

          <DialogFooter className="flex justify-between sm:justify-between">
            <Button type="button" variant="outline" onClick={onclose}>
              Cancel
            </Button>
            <Button type="submit" disabled={isSubmitting}>
              {isSubmitting
                ? "Saving..."
                : mode === "create"
                ? "Create Channel"
                : "Save Changes"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
};

export default Channeldialogue;
