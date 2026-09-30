// URL transforms for Cloudinary video delivery URLs of the form
// https://res.cloudinary.com/<cloud>/video/upload/<version?>/<public_id>.<ext>

const CLOUDINARY_VIDEO = /^(https:\/\/res\.cloudinary\.com\/[^/]+\/video\/upload\/)(.+)$/;

/** Filename-safe slug; Cloudinary attachment names can't contain dots or slashes. */
export function safeFilename(title: string): string {
  const slug = title
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^A-Za-z0-9-]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, 80);
  return slug || "video";
}

/**
 * Cross-origin URLs ignore <a download>, so ask Cloudinary to send
 * Content-Disposition: attachment via the fl_attachment flag.
 * Non-Cloudinary URLs are returned unchanged.
 */
export function cloudinaryAttachmentUrl(url: string, title: string): string {
  const m = url.match(CLOUDINARY_VIDEO);
  if (!m) return url;
  return `${m[1]}fl_attachment:${safeFilename(title)}/${m[2]}`;
}

/** A JPEG frame from 1s into the video, or null for non-Cloudinary URLs. */
export function cloudinaryThumbnailUrl(url: string): string | null {
  const m = url.match(CLOUDINARY_VIDEO);
  if (!m) return null;
  const rest = m[2].replace(/\.[A-Za-z0-9]+(\?.*)?$/, "") + ".jpg";
  return `${m[1]}so_1,w_480,c_limit/${rest}`;
}
