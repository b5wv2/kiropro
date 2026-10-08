/**
 * KIROPRO Client-Side Image Compression Utility
 *
 * Compresses images in the browser before upload:
 * - Reduces max dimension to 1920px (no upscaling)
 * - Converts to WebP (with JPEG fallback)
 * - Targets 1-2 MB while preserving sharp text and UI details
 * - Automatically respects EXIF orientation
 * - Prevents client crashes on ultra-large images (up to 100+ MB)
 * - Ensures final output never exceeds 10 MB (server hard limit)
 */

export interface CompressionOptions {
  maxDimension?: number;        // Default: 1920
  initialQuality?: number;      // Default: 0.82
  targetSizeBytes?: number;     // Default: 1.8 MB (1.8 * 1024 * 1024)
  maxSizeBytes?: number;        // Default: 10 MB (10 * 1024 * 1024)
  minQuality?: number;          // Default: 0.45
}

export interface CompressedImageResult {
  file: File;
  previewUrl: string;
  originalName: string;
  originalSize: number;
  compressedSize: number;
  savingsPercent: number;
  width: number;
  height: number;
  mimeType: 'image/webp' | 'image/jpeg';
}

/**
 * Format bytes into user-friendly string (e.g. "1.4 MB", "850 KB")
 */
export function formatBytes(bytes: number, decimals = 1): string {
  if (bytes <= 0) return '0 B';
  const k = 1024;
  const dm = decimals < 0 ? 0 : decimals;
  const sizes = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return `${parseFloat((bytes / Math.pow(k, i)).toFixed(dm))} ${sizes[i]}`;
}

/**
 * Helper to convert canvas to Blob as Promise
 */
function canvasToBlob(canvas: HTMLCanvasElement, type: string, quality: number): Promise<Blob | null> {
  return new Promise((resolve) => {
    canvas.toBlob((blob) => {
      resolve(blob);
    }, type, quality);
  });
}

/**
 * Loads an image file using createImageBitmap (preferred for EXIF and memory)
 * with HTMLImageElement fallback.
 */
async function loadImageSource(file: File): Promise<{
  source: ImageBitmap | HTMLImageElement;
  width: number;
  height: number;
  close: () => void;
}> {
  // 1. Try modern createImageBitmap with EXIF auto-orientation
  if (typeof createImageBitmap === 'function') {
    try {
      const bitmap = await createImageBitmap(file, { imageOrientation: 'from-image' });
      return {
        source: bitmap,
        width: bitmap.width,
        height: bitmap.height,
        close: () => bitmap.close()
      };
    } catch {
      // Fallback to Image element if createImageBitmap fails (e.g. SVG or format quirk)
    }
  }

  // 2. Fallback using Image element + ObjectURL
  return new Promise((resolve, reject) => {
    const img = new Image();
    const objectUrl = URL.createObjectURL(file);

    img.onload = () => {
      resolve({
        source: img,
        width: img.naturalWidth || img.width,
        height: img.naturalHeight || img.height,
        close: () => {
          URL.revokeObjectURL(objectUrl);
        }
      });
    };

    img.onerror = () => {
      URL.revokeObjectURL(objectUrl);
      reject(new Error('تعذر قراءة ملف الصورة. قد تكون الصورة تالفة أو بصيغة غير مدعومة.'));
    };

    img.src = objectUrl;
  });
}

/**
 * Compresses an image file in the browser client-side
 */
export async function compressImage(
  file: File,
  options: CompressionOptions = {}
): Promise<CompressedImageResult> {
  const {
    maxDimension = 1920,
    initialQuality = 0.82,
    targetSizeBytes = 1.8 * 1024 * 1024, // 1.8 MB target
    maxSizeBytes = 10 * 1024 * 1024,      // 10 MB strict limit
    minQuality = 0.45
  } = options;

  // Basic MIME validation
  const validTypes = ['image/jpeg', 'image/png', 'image/webp'];
  if (!validTypes.includes(file.type)) {
    throw new Error(`صيغة الملف "${file.name}" غير مدعومة. يسمح فقط بصيغ JPG, PNG, WEBP.`);
  }

  // Safety check on ultra-gigantic files to prevent browser tab crash (> 150 MB)
  const HARD_MAX_SOURCE = 150 * 1024 * 1024;
  if (file.size > HARD_MAX_SOURCE) {
    throw new Error(
      `حجم الصورة "${file.name}" كبير جداً (${formatBytes(file.size)}). يرجى اختيار ملف أصغر من 150 MB لتجنب استهلاك ذاكرة الجهاز.`
    );
  }

  let loaded: {
    source: ImageBitmap | HTMLImageElement;
    width: number;
    height: number;
    close: () => void;
  } | null = null;

  try {
    loaded = await loadImageSource(file);
  } catch (err: any) {
    throw new Error(
      `تعذر فك ضغط الصورة "${file.name}". يرجى التأكد من سلامة الملف أو اختيار صورة أخرى.`
    );
  }

  const canvas = document.createElement('canvas');
  let previewUrl = '';

  try {
    let currentWidth = loaded.width;
    let currentHeight = loaded.height;

    // Proportional downscale (Never upscale small images)
    if (Math.max(currentWidth, currentHeight) > maxDimension) {
      const scale = maxDimension / Math.max(currentWidth, currentHeight);
      currentWidth = Math.max(1, Math.round(currentWidth * scale));
      currentHeight = Math.max(1, Math.round(currentHeight * scale));
    }

    canvas.width = currentWidth;
    canvas.height = currentHeight;

    const ctx = canvas.getContext('2d', { alpha: false });
    if (!ctx) {
      throw new Error('تعذر إنشاء بيئة الرسم (Canvas Context) لمعالجة الصورة.');
    }

    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = 'high';
    ctx.drawImage(loaded.source, 0, 0, currentWidth, currentHeight);

    // Test WebP support first
    let outputFormat: 'image/webp' | 'image/jpeg' = 'image/webp';
    let quality = initialQuality;
    let blob = await canvasToBlob(canvas, outputFormat, quality);

    // If WebP is not supported by the browser canvas export, fallback to JPEG
    if (!blob || blob.type !== 'image/webp') {
      outputFormat = 'image/jpeg';
      blob = await canvasToBlob(canvas, outputFormat, quality);
    }

    if (!blob) {
      throw new Error(`تعذر حفظ الصورة المضغوطة للملف "${file.name}".`);
    }

    // Iterative quality reduction if larger than target size (target: 1-2 MB)
    const qualitySteps = [0.74, 0.66, 0.58, 0.50];
    let stepIndex = 0;

    while (blob.size > targetSizeBytes && stepIndex < qualitySteps.length) {
      const nextQuality = qualitySteps[stepIndex++];
      if (nextQuality >= minQuality) {
        const nextBlob = await canvasToBlob(canvas, outputFormat, nextQuality);
        if (nextBlob) {
          blob = nextBlob;
          quality = nextQuality;
        }
      }
    }

    // Secondary fallback: if still exceeding 10 MB strict limit, scale down dimensions by 0.75x
    if (blob.size > maxSizeBytes) {
      const reducedW = Math.max(1, Math.round(currentWidth * 0.75));
      const reducedH = Math.max(1, Math.round(currentHeight * 0.75));
      canvas.width = reducedW;
      canvas.height = reducedH;

      ctx.imageSmoothingEnabled = true;
      ctx.imageSmoothingQuality = 'high';
      ctx.drawImage(loaded.source, 0, 0, reducedW, reducedH);

      const reducedBlob = await canvasToBlob(canvas, outputFormat, 0.65);
      if (reducedBlob) {
        blob = reducedBlob;
        currentWidth = reducedW;
        currentHeight = reducedH;
      }
    }

    // Final check against server maximum limit
    if (blob.size > maxSizeBytes) {
      throw new Error(
        `حجم الصورة بعد الضغط (${formatBytes(blob.size)}) ما زال يتجاوز الحد الأقصى المسموح به (10 MB). يرجى اختيار صورة أخرى.`
      );
    }

    // Generate output file with appropriate extension
    const baseName = file.name.substring(0, file.name.lastIndexOf('.')) || file.name;
    const extension = outputFormat === 'image/webp' ? '.webp' : '.jpg';
    const outputFileName = `${baseName}${extension}`;

    const compressedFile = new File([blob], outputFileName, {
      type: outputFormat,
      lastModified: Date.now()
    });

    previewUrl = URL.createObjectURL(blob);

    const originalSize = file.size;
    const compressedSize = compressedFile.size;
    const rawSavings = ((originalSize - compressedSize) / originalSize) * 100;
    const savingsPercent = Math.max(0, Math.round(rawSavings * 10) / 10);

    return {
      file: compressedFile,
      previewUrl,
      originalName: file.name,
      originalSize,
      compressedSize,
      savingsPercent,
      width: currentWidth,
      height: currentHeight,
      mimeType: outputFormat
    };
  } finally {
    // Release resources
    if (loaded) {
      loaded.close();
    }
    canvas.width = 0;
    canvas.height = 0;
  }
}
