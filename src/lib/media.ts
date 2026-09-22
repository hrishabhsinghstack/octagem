/**
 * Item photo upload — same downscale-to-data-URL approach as src/lib/branding.ts, sized for
 * product photography instead of logos. Stored inline on the item record via localStorage
 * (OCTAGEM-BLUEPRINT.md §34.2 calls for real object storage once a backend exists; this is
 * the honest stand-in until then, so every cap here exists to keep the whole app under the
 * ~5MB per-origin localStorage ceiling, not just this one field).
 */
const MAX_UPLOAD_BYTES = 8 * 1024 * 1024;
const MAX_DIMENSION = 1000;
const MAX_ENCODED_CHARS = 350_000;
const IMAGE_ACCEPT = ["image/jpeg", "image/png", "image/webp"];

export class MediaStorageError extends Error {}

function readFileAsDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = () => reject(new Error(`Could not read ${file.name}.`));
    reader.readAsDataURL(file);
  });
}

function loadImageElement(source: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error("That file could not be read as an image."));
    image.src = source;
  });
}

async function downscale(dataUrl: string): Promise<string> {
  const image = await loadImageElement(dataUrl);
  const scale = Math.min(MAX_DIMENSION / image.width, MAX_DIMENSION / image.height, 1);
  const width = Math.max(1, Math.round(image.width * scale));
  const height = Math.max(1, Math.round(image.height * scale));

  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const context = canvas.getContext("2d");
  if (!context) return dataUrl;
  context.drawImage(image, 0, 0, width, height);

  const jpeg = canvas.toDataURL("image/jpeg", 0.82);
  if (jpeg.length <= MAX_ENCODED_CHARS) return jpeg;

  const smaller = canvas.toDataURL("image/jpeg", 0.6);
  return smaller;
}

export async function processItemPhoto(file: File): Promise<string> {
  if (!IMAGE_ACCEPT.includes(file.type)) {
    throw new MediaStorageError(`${file.name} is not a supported image. Use JPEG, PNG or WebP.`);
  }
  if (file.size > MAX_UPLOAD_BYTES) {
    throw new MediaStorageError(`${file.name} is larger than 8MB.`);
  }
  const dataUrl = await readFileAsDataUrl(file);
  const scaled = await downscale(dataUrl);
  if (scaled.length > MAX_ENCODED_CHARS * 1.3) {
    throw new MediaStorageError(`${file.name} is still too large after compression. Try a smaller source image.`);
  }
  return scaled;
}
