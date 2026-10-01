export interface Video {
  id: string;
  videotitle: string;
  videochanel: string;
  videoUrl: string;
  filename?: string;
  filetype?: string;
  filesize?: string;
  /** Seconds. */
  duration?: number;
  /** Still image for lists and the player before playback. */
  poster?: string;
  likes?: number;
  views?: number;
  uploader?: string;
  /** Firestore Timestamp on reads, ISO string after JSON round-trips. */
  createdAt?: FirestoreDate;
}

/** A row in History / Liked / Watch later: the list record plus its video. */
export interface VideoListEntry {
  id: string;
  videoid: Video;
  createdAt: string;
}

export type FirestoreDate = { seconds: number; nanoseconds?: number } | string | Date | null | undefined;

export function toDate(value: FirestoreDate): Date {
  if (!value) return new Date(NaN);
  if (value instanceof Date) return value;
  if (typeof value === "string") return new Date(value);
  return new Date(value.seconds * 1000);
}

export type PlanId = "free" | "bronze" | "silver" | "gold";

/** The signed-in user's private profile (users/{uid}). */
export interface AppUser {
  uid: string;
  email: string;
  name: string;
  channelname: string;
  description: string;
  image: string;
  plan?: PlanId;
  isPremium?: boolean;
  joinedon?: FirestoreDate;
}

/** Public channel card (channels/{uid}). */
export interface Channel {
  uid: string;
  channelname: string;
  description: string;
  name: string;
  image: string;
}

/** Comment as returned by the API (and read from Firestore on the client). */
export interface CommentDTO {
  id: string;
  videoid: string;
  userid: string;
  commentbody: string;
  usercommented: string;
  userimage: string | null;
  city: string | null;
  likes: string[];
  dislikes: string[];
  edited: boolean;
  commentedon: string;
}
