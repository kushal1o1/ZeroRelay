import { AVATAR_MAX_CHARS } from "@/lib/peer-protocol";

// Avatars are sent to every peer over the data channel, so they're shrunk to a
// small square image (a few KB) instead of shipping the original photo.

const SIZE = 128;
const MAX_INPUT_BYTES = 15 * 1024 * 1024;

function loadImage(file: File): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      URL.revokeObjectURL(url);
      resolve(img);
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error("That file isn't an image this browser can read."));
    };
    img.src = url;
  });
}

/** Center-crop and scale an image to a small avatar data URL. */
export async function makeAvatar(file: File): Promise<string> {
  if (!file.type.startsWith("image/")) throw new Error("Pick an image file.");
  if (file.size > MAX_INPUT_BYTES) throw new Error("That image is too large (15 MB max).");

  const img = await loadImage(file);
  const side = Math.min(img.naturalWidth, img.naturalHeight);
  const canvas = document.createElement("canvas");
  canvas.width = SIZE;
  canvas.height = SIZE;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Couldn't process the image.");
  ctx.drawImage(
    img,
    (img.naturalWidth - side) / 2,
    (img.naturalHeight - side) / 2,
    side,
    side,
    0,
    0,
    SIZE,
    SIZE,
  );

  // WebP where supported (Safari falls back to PNG for unknown types), else JPEG.
  for (const quality of [0.85, 0.7, 0.5]) {
    const webp = canvas.toDataURL("image/webp", quality);
    const url = webp.startsWith("data:image/webp") ? webp : canvas.toDataURL("image/jpeg", quality);
    if (url.length <= AVATAR_MAX_CHARS) return url;
  }
  throw new Error("Couldn't make that image small enough.");
}
