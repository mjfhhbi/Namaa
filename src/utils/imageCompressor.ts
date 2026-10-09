/**
 * Client-side image compressor utility for high quality, fast uploads
 * Prevents Firestore 1MB document size limit errors.
 */
export async function compressImage(file: File, maxWidth = 1000, quality = 0.75): Promise<string> {
  return new Promise((resolve, reject) => {
    // If not an image, reject
    if (!file.type.startsWith('image/')) {
      reject(new Error('فایل انتخاب شده تصویر نیست.'));
      return;
    }

    const reader = new FileReader();
    reader.onload = (event) => {
      const img = new Image();
      img.onload = () => {
        try {
          const canvas = document.createElement('canvas');
          let width = img.width;
          let height = img.height;

          if (width > maxWidth || height > maxWidth) {
            if (width > height) {
              height = Math.round((height * maxWidth) / width);
              width = maxWidth;
            } else {
              width = Math.round((width * maxWidth) / height);
              height = maxWidth;
            }
          }

          canvas.width = width;
          canvas.height = height;
          const ctx = canvas.getContext('2d');
          if (!ctx) {
            resolve(event.target?.result as string);
            return;
          }

          ctx.drawImage(img, 0, 0, width, height);
          const dataUrl = canvas.toDataURL('image/jpeg', quality);
          resolve(dataUrl);
        } catch (err) {
          resolve(event.target?.result as string);
        }
      };
      img.onerror = () => reject(new Error('خطا در بارگذاری تصویر.'));
      img.src = event.target?.result as string;
    };
    reader.onerror = () => reject(new Error('خطا در خواندن فایل تصویر.'));
    reader.readAsDataURL(file);
  });
}
