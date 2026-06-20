try {
    importScripts('https://unpkg.com/heic2any@0.0.4/dist/heic2any.min.js');
} catch(e) {
    console.warn('Worker: Failed to load heic2any script. HEIC decoding will fallback to main thread or fail.');
}

self.onmessage = async function(e) {
    let { id, bitmap, fileBlob, isHeic, targetBytes, mimeType, isPDF, forceOverride } = e.data;
    
    try {
        if (isHeic && fileBlob) {
            const convertedBlob = await heic2any({ blob: fileBlob, toType: "image/jpeg" });
            const finalBlob = Array.isArray(convertedBlob) ? convertedBlob[0] : convertedBlob;
            bitmap = await createImageBitmap(finalBlob);
            mimeType = 'image/jpeg';
        }

        let bestBlob = await iterativeCompressWorker(bitmap, targetBytes, mimeType, isPDF, forceOverride);
        self.postMessage({ id, success: true, blob: bestBlob });
    } catch (err) {
        self.postMessage({ id, success: false, error: err.message });
    }
};

async function iterativeCompressWorker(bitmap, targetBytes, mimeType, isPDF, forceOverride) {
    let bestBlob = null;
    let minQuality = 0.0;
    let maxQuality = 1.0;
    
    let originalCanvas = new OffscreenCanvas(bitmap.width, bitmap.height);
    let ctx = originalCanvas.getContext('2d');
    ctx.fillStyle = '#FFFFFF';
    ctx.fillRect(0, 0, originalCanvas.width, originalCanvas.height);
    ctx.drawImage(bitmap, 0, 0);

    for (let i = 0; i < 7; i++) {
        let quality = (minQuality + maxQuality) / 2;
        let blob = await originalCanvas.convertToBlob({ type: mimeType, quality: quality });
        
        if (blob.size <= targetBytes) {
            bestBlob = blob;
            minQuality = quality; 
            if (blob.size >= targetBytes * 0.95) break;
        } else {
            maxQuality = quality; 
        }
    }

    if (!bestBlob || bestBlob.size > targetBytes) {
        let scale = 0.9;
        let MIN_DIMENSION = 50;
        if (isPDF) MIN_DIMENSION = forceOverride ? 100 : 500;
        
        const scaleFloor = forceOverride ? 0.01 : 0.05;

        bestBlob = await originalCanvas.convertToBlob({ type: mimeType, quality: forceOverride ? 0.1 : 0.5 });

        let workingCanvas = new OffscreenCanvas(1, 1);
        let newCtx = workingCanvas.getContext('2d');

        while (bestBlob && bestBlob.size > targetBytes && scale > scaleFloor) {
            let newWidth = Math.floor(bitmap.width * scale);
            let newHeight = Math.floor(bitmap.height * scale);
            
            if (Math.min(newWidth, newHeight) < MIN_DIMENSION) {
                break;
            }

            workingCanvas.width = Math.max(1, newWidth);
            workingCanvas.height = Math.max(1, newHeight);
            newCtx.fillStyle = '#FFFFFF';
            newCtx.fillRect(0, 0, workingCanvas.width, workingCanvas.height);
            newCtx.drawImage(originalCanvas, 0, 0, workingCanvas.width, workingCanvas.height);
            
            bestBlob = await workingCanvas.convertToBlob({ type: mimeType, quality: 0.5 }); 
            if (bestBlob.size > targetBytes && forceOverride) {
                bestBlob = await workingCanvas.convertToBlob({ type: mimeType, quality: 0.1 }); 
            }
            scale -= forceOverride ? 0.05 : 0.15;
        }
    }
    return bestBlob;
}
