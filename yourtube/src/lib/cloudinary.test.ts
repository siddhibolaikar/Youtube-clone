import { describe, expect, it } from "vitest";
import { cloudinaryAttachmentUrl, cloudinaryThumbnailUrl, safeFilename } from "./cloudinary";

const url = "https://res.cloudinary.com/demo/video/upload/v1719300000/yourtube/abc123.mp4";

describe("cloudinaryAttachmentUrl", () => {
  it("inserts fl_attachment with a safe name after /upload/", () => {
    expect(cloudinaryAttachmentUrl(url, "My Trip: Goa 2026!")).toBe(
      "https://res.cloudinary.com/demo/video/upload/fl_attachment:My_Trip_Goa_2026/v1719300000/yourtube/abc123.mp4"
    );
  });

  it("leaves non-Cloudinary URLs alone", () => {
    const other = "https://firebasestorage.googleapis.com/v0/b/x/o/v.mp4";
    expect(cloudinaryAttachmentUrl(other, "t")).toBe(other);
  });
});

describe("safeFilename", () => {
  it("strips accents, dots and slashes", () => {
    expect(safeFilename("Café.v2/final")).toBe("Cafe_v2_final");
  });

  it("falls back to 'video' for titles with no Latin characters", () => {
    expect(safeFilename("मेरा वीडियो")).toBe("video");
  });
});

describe("cloudinaryThumbnailUrl", () => {
  it("returns a jpg frame at 1s", () => {
    expect(cloudinaryThumbnailUrl(url)).toBe(
      "https://res.cloudinary.com/demo/video/upload/so_1,w_480,c_limit/v1719300000/yourtube/abc123.jpg"
    );
  });

  it("is null for other hosts", () => {
    expect(cloudinaryThumbnailUrl("https://example.com/a.mp4")).toBeNull();
  });
});
