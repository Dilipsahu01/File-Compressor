pdfjsLib.GlobalWorkerOptions.workerSrc = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js';

document.addEventListener('DOMContentLoaded', () => {
    // --- Theme Toggle Logic ---
    const themeToggleBtn = document.getElementById('theme-toggle');
    const themeIcon = document.getElementById('theme-icon');
    
    // Moon icon for light mode (switch to dark), Sun icon for dark mode (switch to light)
    const moonIcon = '<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M20.354 15.354A9 9 0 018.646 3.646 9.003 9.003 0 0012 21a9.003 9.003 0 008.354-5.646z"></path>';
    const sunIcon = '<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 3v1m0 16v1m9-9h-1M4 12H3m15.364 6.364l-.707-.707M6.343 6.343l-.707-.707m12.728 0l-.707.707M6.343 17.657l-.707.707M16 12a4 4 0 11-8 0 4 4 0 018 0z"></path>';

    const themeText = document.getElementById('theme-text');

    function setTheme(theme) {
        document.documentElement.setAttribute('data-theme', theme);
        localStorage.setItem('theme', theme);
        themeIcon.innerHTML = theme === 'dark' ? sunIcon : moonIcon;
        if (themeText) themeText.textContent = theme === 'dark' ? 'Light Mode' : 'Dark Mode';
    }

    // Initialize Theme
    const savedTheme = localStorage.getItem('theme');
    const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
    // Default to light unless user saved dark or OS prefers dark and no save exists
    if (savedTheme === 'dark' || (!savedTheme && prefersDark)) {
        setTheme('dark');
    } else {
        setTheme('light');
    }

    themeToggleBtn.addEventListener('click', () => {
        const currentTheme = document.documentElement.getAttribute('data-theme');
        setTheme(currentTheme === 'dark' ? 'light' : 'dark');
    });

    const uploadArea = document.getElementById('upload-section');
    const fileInput = document.getElementById('file-input');
    const fileListContainer = document.getElementById('file-list');
    
    const presetSelect = document.getElementById('preset-select');
    const globalTargetInput = document.getElementById('global-target-size');
    const targetSizeContainer = document.getElementById('target-size-container');
    const globalFormatSelect = document.getElementById('global-format');

    const globalActionBar = document.getElementById('global-action-bar');
    const downloadAllBtn = document.getElementById('download-all-btn');
    const zipCountSpan = document.getElementById('zip-count');

    const completedFiles = new Map();

    const hwCores = navigator.hardwareConcurrency || 4;
    const SAFE_CONCURRENCY = Math.min(4, Math.max(1, Math.floor(hwCores / 2)));

    const limitSlider = document.getElementById('worker-limit');
    const limitDisplay = document.getElementById('worker-limit-display');
    
    limitSlider.max = Math.min(16, Math.max(2, hwCores));
    limitSlider.value = SAFE_CONCURRENCY;
    limitDisplay.textContent = SAFE_CONCURRENCY;

    function updateSliderColor() {
        const val = parseInt(limitSlider.value, 10);
        const max = parseInt(limitSlider.max, 10);
        const ratio = val / max;
        
        let color = '#3b82f6';
        if (ratio >= 0.9) color = '#ef4444';
        else if (ratio >= 0.7) color = '#f59e0b';
        else if (ratio >= 0.4) color = '#10b981';
        
        limitDisplay.style.color = color;
        limitDisplay.style.textShadow = `0 0 10px ${color}40`;
        limitSlider.style.accentColor = color;
    }

    limitSlider.addEventListener('input', (e) => {
        limitDisplay.textContent = e.target.value;
        updateSliderColor();
        processNextInQueue();
    });
    
    updateSliderColor();

    const fileQueue = [];
    let activeCompressions = 0;
    // --- Worker Pool Setup ---
    const MAX_WORKERS = parseInt(limitSlider.max, 10);
    const workers = [];
    let workerCallbacks = new Map();
    let msgId = 0;

    if (window.Worker && window.OffscreenCanvas) {
        for (let i = 0; i < MAX_WORKERS; i++) {
            const worker = new Worker('js/worker.js');
            worker.activeTasks = 0;
            worker.onmessage = (e) => {
                const { id, success, blob, error } = e.data;
                worker.activeTasks--;
                if (workerCallbacks.has(id)) {
                    if (success) workerCallbacks.get(id).resolve(blob);
                    else workerCallbacks.get(id).reject(new Error(error));
                    workerCallbacks.delete(id);
                }
            };
            workers.push(worker);
        }
    }

    async function compressWithWorker(data, transferList) {
        return new Promise((resolve, reject) => {
            const id = msgId++;
            workerCallbacks.set(id, { resolve, reject });
            
            let bestWorker = workers[0];
            for (let i = 1; i < workers.length; i++) {
                if (workers[i].activeTasks < bestWorker.activeTasks) {
                    bestWorker = workers[i];
                }
            }
            
            bestWorker.activeTasks++;
            data.id = id;
            bestWorker.postMessage(data, transferList);
        });
    }

    presetSelect.addEventListener('change', () => {
        if (presetSelect.value === 'custom') {
            globalTargetInput.disabled = false;
            targetSizeContainer.style.opacity = '1';
        } else {
            globalTargetInput.value = presetSelect.value;
            globalTargetInput.disabled = true;
            targetSizeContainer.style.opacity = '0.5';
        }
    });

    uploadArea.addEventListener('dragover', (e) => {
        e.preventDefault();
        uploadArea.classList.add('dragover');
    });

    uploadArea.addEventListener('dragleave', (e) => {
        e.preventDefault();
        uploadArea.classList.remove('dragover');
    });

    uploadArea.addEventListener('drop', (e) => {
        e.preventDefault();
        uploadArea.classList.remove('dragover');
        if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
            handleFiles(e.dataTransfer.files);
        }
    });

    fileInput.addEventListener('change', (e) => {
        if (e.target.files && e.target.files.length > 0) {
            handleFiles(e.target.files);
        }
    });

    function handleFiles(files) {
        Array.from(files).forEach(file => {
            if (file.size === 0) {
                alert(`File "${file.name}" is empty and cannot be processed.`);
                return;
            }
            
            if (file.type.match(/image\/(jpeg|png|webp|heic)/i) || 
                file.type === 'application/pdf' || 
                file.name.toLowerCase().endsWith('.heic')) {
                
                const id = createCardUI(file);
                
                fileQueue.push({ file, id });
                
            } else {
                alert(`File type not supported: ${file.name}`);
            }
        });
        
        fileInput.value = '';
        
        processNextInQueue(); 
    }

    async function processNextInQueue() {
        const currentLimit = parseInt(limitSlider.value, 10);
        
        if (activeCompressions >= currentLimit || fileQueue.length === 0) {
            return;
        }

        activeCompressions++;
        const { file, id } = fileQueue.shift(); 
        
        try {
            await processFile(file, id); 
        } catch (error) {
            console.error(`Failed to process ${file.name}:`, error);
        } finally {
            activeCompressions--;
            
            processNextInQueue(); 
        }
    }

    async function processFile(file, id) {
        const targetKB = parseFloat(globalTargetInput.value) || 100;
        let mimeType = globalFormatSelect.value;
        const statusEl = document.getElementById(`comp-size-${id}`);
        const downloadBtn = document.getElementById(`download-${id}`);
        const forceBtn = document.getElementById(`force-${id}`);
        const progressContainer = document.getElementById(`progress-container-${id}`);
        const progressBar = document.getElementById(`progress-bar-${id}`);
        
        try {
            let workingFile = file;
            const isHeic = file.name.toLowerCase().endsWith('.heic') || file.type === 'image/heic';
            
            const targetBytes = targetKB * 1024;
            const formatMatches = (file.type === mimeType) || (file.type === 'application/pdf');
            
            if (formatMatches && file.size <= targetBytes && !isHeic) {
                statusEl.innerHTML = `Already fits: ${formatBytes(file.size)}`;
                statusEl.className = 'compressed-stat success';
                
                const url = URL.createObjectURL(file);
                downloadBtn.href = url;
                downloadBtn.download = file.name;
                downloadBtn.classList.remove('hidden');
                
                completedFiles.set(id, { name: file.name, blob: file, url: url });
                updateZipAction();
                return; 
            }

            if (isHeic && workers.length === 0) {
                statusEl.textContent = 'Converting HEIC to JPEG...';
                await new Promise(r => setTimeout(r, 10));
                try {
                    const convertedBlob = await heic2any({ blob: file, toType: "image/jpeg" });
                    workingFile = Array.isArray(convertedBlob) ? convertedBlob[0] : convertedBlob;
                    mimeType = 'image/jpeg';
                } catch(e) {
                    throw new Error('HEIC decoding failed. Ensure it is a valid photo.');
                }
            }

            let compressedBlob;
            
            if (file.type === 'application/pdf') {
                statusEl.textContent = 'Parsing PDF...';
                progressContainer.classList.remove('hidden');
                
                compressedBlob = await compressPDF(workingFile, targetKB, (current, total) => {
                    statusEl.textContent = `Compressing Page ${current} of ${total}...`;
                    progressBar.style.width = `${(current / total) * 100}%`;
                }, false);
                
                setTimeout(() => progressContainer.classList.add('hidden'), 500);
            } 
            else {
                statusEl.textContent = isHeic ? 'Converting & Compressing...' : 'Compressing Image...';
                progressContainer.classList.remove('hidden');
                progressBar.style.width = '0%';
                
                let phantomProgress = 0;
                const phantomInterval = setInterval(() => {
                    phantomProgress += (90 - phantomProgress) * 0.1;
                    progressBar.style.width = `${phantomProgress}%`;
                }, 100);

                try {
                    compressedBlob = await compressImage(workingFile, targetKB, mimeType, false, isHeic);
                } finally {
                    clearInterval(phantomInterval);
                    progressBar.style.width = '100%';
                    setTimeout(() => progressContainer.classList.add('hidden'), 500);
                }
            }

            let usedOriginal = false;
            if (compressedBlob.size > workingFile.size) {
                let formatMatches = (workingFile.type === mimeType) || (file.type === 'application/pdf');
                if (formatMatches) {
                    compressedBlob = workingFile;
                    usedOriginal = true;
                }
            }

            const isSuccess = compressedBlob.size <= (targetKB * 1024 * 1.05);

            if (usedOriginal) {
                if (isSuccess) {
                    statusEl.innerHTML = `Original used (already fits): ${formatBytes(compressedBlob.size)}`;
                    statusEl.className = 'compressed-stat success';
                } else {
                    statusEl.innerHTML = file.type === 'application/pdf' ? `Readable size: ${formatBytes(compressedBlob.size)}` : `Original used (safest): ${formatBytes(compressedBlob.size)}`;
                    statusEl.className = 'compressed-stat warning';
                    forceBtn.innerHTML = `<svg class="icon-inline" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 14l-7 7m0 0l-7-7m7 7V3"></path></svg> Force ${targetKB}KB`;
                    forceBtn.classList.remove('hidden');
                }
            } else if (isSuccess) {
                statusEl.innerHTML = `Result: ${formatBytes(compressedBlob.size)}`;
                statusEl.className = 'compressed-stat success';
            } else {
                statusEl.innerHTML = file.type === 'application/pdf' ? `Readable size: ${formatBytes(compressedBlob.size)}` : `Lowest safe size: ${formatBytes(compressedBlob.size)}`;
                statusEl.className = 'compressed-stat warning';
                forceBtn.innerHTML = `<svg class="icon-inline" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 14l-7 7m0 0l-7-7m7 7V3"></path></svg> Force ${targetKB}KB`;
                forceBtn.classList.remove('hidden');
            }
                
            if (!isSuccess || (usedOriginal && !isSuccess)) {
                forceBtn.onclick = async () => {
                    forceBtn.classList.add('hidden');
                    statusEl.textContent = 'Forcing compression...';
                    progressContainer.classList.remove('hidden');
                    progressBar.style.width = '0%';
                    statusEl.className = 'compressed-stat warning';

                    try {
                        let newBlob;
                        if (file.type === 'application/pdf') {
                            newBlob = await compressPDF(workingFile, targetKB, (current, total) => {
                                statusEl.textContent = `Forcing Page ${current} of ${total}...`;
                                progressBar.style.width = `${(current / total) * 100}%`;
                            }, true);
                        } else {
                            let phantomProgress = 0;
                            const phantomInterval = setInterval(() => {
                                phantomProgress += (90 - phantomProgress) * 0.1;
                                progressBar.style.width = `${phantomProgress}%`;
                            }, 100);
                            try {
                                newBlob = await compressImage(workingFile, targetKB, mimeType, true, isHeic);
                            } finally {
                                clearInterval(phantomInterval);
                                progressBar.style.width = '100%';
                            }
                        }
                        
                        setTimeout(() => progressContainer.classList.add('hidden'), 500);

                        if (newBlob.size > workingFile.size) {
                            let formatMatches = (workingFile.type === mimeType) || (file.type === 'application/pdf');
                            if (formatMatches) newBlob = workingFile;
                        }

                        const newSuccess = newBlob.size <= (targetKB * 1024 * 1.05);
                        statusEl.innerHTML = `Forced Result: ${formatBytes(newBlob.size)}`;
                        statusEl.className = newSuccess ? 'compressed-stat success' : 'compressed-stat warning';
                        
                        const fileData = completedFiles.get(id);
                        if (fileData && fileData.url) URL.revokeObjectURL(fileData.url);

                        const url = URL.createObjectURL(newBlob);
                        downloadBtn.href = url;
                        completedFiles.set(id, { name: downloadBtn.download, blob: newBlob, url: url });
                        
                        if (file.type !== 'application/pdf') {
                            const thumb = document.getElementById(`thumb-${id}`);
                            if (thumb.src.startsWith('blob:')) URL.revokeObjectURL(thumb.src);
                            thumb.src = url;
                        }

                        updateZipAction();
                    } catch(e) {
                        statusEl.textContent = 'Force failed.';
                        statusEl.className = 'compressed-stat danger';
                        progressContainer.classList.add('hidden');
                    }
                };
            }
            
            const url = URL.createObjectURL(compressedBlob);
            downloadBtn.href = url;
            
            let ext = 'jpg';
            if (file.type === 'application/pdf') ext = 'pdf';
            else if (mimeType === 'image/webp') ext = 'webp';
            else if (mimeType === 'image/png') ext = 'png';
            
            let newName = file.name.replace(/\.[^/.]+$/, "") + `_compressed.${ext}`;
            downloadBtn.download = newName;
            downloadBtn.classList.remove('hidden');

            completedFiles.set(id, { name: newName, blob: compressedBlob, url: url });
            updateZipAction();

            if (file.type !== 'application/pdf') {
                 const thumb = document.getElementById(`thumb-${id}`);
                 if (thumb.src.startsWith('blob:')) URL.revokeObjectURL(thumb.src);
                 thumb.src = url;
            }

        } catch (error) {
            console.error(error);
            statusEl.textContent = error.message || 'Compression failed.';
            statusEl.className = 'compressed-stat danger';
            progressContainer.classList.add('hidden');
        }
    }

    function createCardUI(file) {
        const id = Math.random().toString(36).substring(7);
        const card = document.createElement('div');
        card.className = 'file-card';
        card.id = `card-${id}`;
        
        let thumbSrc = '';
        if (file.type.match(/image\/(jpeg|png|webp)/i)) {
            thumbSrc = URL.createObjectURL(file);
        } else if (file.name.toLowerCase().endsWith('.heic')) {
            const heicSvg = '<svg xmlns="http://www.w3.org/2000/svg" width="60" height="60" fill="#6366f1" viewBox="0 0 24 24"><path d="M21 19V5c0-1.1-.9-2-2-2H5c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h14c1.1 0 2-.9 2-2zM8.5 13.5l2.5 3.01L14.5 12l4.5 6H5l3.5-4.5z"/></svg>';
            thumbSrc = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(heicSvg);
        } else {
            const pdfSvg = '<svg xmlns="http://www.w3.org/2000/svg" width="60" height="60" fill="#ef4444" viewBox="0 0 24 24"><path d="M20 2H8c-1.1 0-2 .9-2 2v12c0 1.1.9 2 2 2h12c1.1 0 2-.9 2-2V4c0-1.1-.9-2-2-2zm-8.5 7.5c0 .83-.67 1.5-1.5 1.5H9v2H7.5V7H10c.83 0 1.5.67 1.5 1.5v1zm5 2c0 .83-.67 1.5-1.5 1.5h-2.5V7H15c.83 0 1.5.67 1.5 1.5v3zm4-3H19v1h1.5V11H19v2h-1.5V7h3v1.5zM9 9.5h1v-1H9v1zM4 6H2v14c0 1.1.9 2 2 2h14v-2H4V6zm10 5.5h1v-3h-1v3z"/></svg>';
            thumbSrc = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(pdfSvg);
        }
        
        card.innerHTML = `
            <img id="thumb-${id}" class="file-thumbnail" src="${thumbSrc}" alt="thumbnail">
            <div class="file-info">
                <div class="file-name" title="${file.name}">${file.name}</div>
                <div class="file-stats">
                    <span>Original: ${formatBytes(file.size)}</span>
                    <span class="compressed-stat" id="comp-size-${id}">Waiting...</span>
                </div>
                <div id="progress-container-${id}" class="progress-container hidden">
                    <div id="progress-bar-${id}" class="progress-bar"></div>
                </div>
            </div>
            <div class="file-actions">
                <button class="btn-warning hidden" id="force-${id}" title="Force smaller size (may blur)">
                    <svg class="icon-inline" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 14l-7 7m0 0l-7-7m7 7V3"></path></svg> Force
                </button>
                <a id="download-${id}" class="btn-success hidden" title="Download">
                    <svg class="icon-inline" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4"></path></svg>
                    Save
                </a>
                <button class="btn-danger" id="remove-${id}" title="Remove">
                    <svg class="icon-inline" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"></path></svg>
                </button>
            </div>
        `;
        
        fileListContainer.prepend(card);

        document.getElementById(`remove-${id}`).addEventListener('click', () => {
            const fileData = completedFiles.get(id);
            if (fileData && fileData.url) URL.revokeObjectURL(fileData.url);
            
            const thumbSrc = document.getElementById(`thumb-${id}`).src;
            if (thumbSrc.startsWith('blob:')) URL.revokeObjectURL(thumbSrc);

            document.getElementById(`card-${id}`).remove();
            completedFiles.delete(id);
            updateZipAction();
        });

        return id;
    }

    function updateZipAction() {
        let totalSize = 0;
        completedFiles.forEach(data => totalSize += data.blob.size);

        if (completedFiles.size > 1) {
            globalActionBar.classList.remove('hidden');
            zipCountSpan.textContent = completedFiles.size;
            
            if (totalSize > 1024 * 1024 * 1024) {
                downloadAllBtn.disabled = true;
                downloadAllBtn.innerHTML = `ZIP Too Large (>1GB) - Download individually`;
            } else {
                downloadAllBtn.disabled = false;
                downloadAllBtn.innerHTML = `<svg class="icon-inline" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4"></path></svg> Download All as ZIP (<span id="zip-count">${completedFiles.size}</span>)`;
            }
        } else {
            globalActionBar.classList.add('hidden');
        }
    }

    downloadAllBtn.addEventListener('click', async () => {
        downloadAllBtn.innerHTML = `<span class="spinner"></span> Zipping...`;
        downloadAllBtn.disabled = true;

        try {
            const zip = new JSZip();
            completedFiles.forEach((data) => {
                zip.file(data.name, data.blob);
            });
            const zipBlob = await zip.generateAsync({ type: 'blob' });
            
            const url = URL.createObjectURL(zipBlob);
            const a = document.createElement('a');
            a.href = url;
            a.download = 'Compressed_Batch.zip';
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);
            setTimeout(() => URL.revokeObjectURL(url), 5000);
        } catch(e) {
            alert('Failed to generate ZIP.');
        }

        downloadAllBtn.innerHTML = `<svg class="icon-inline" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4"></path></svg> Download All as ZIP (<span id="zip-count">${completedFiles.size}</span>)`;
        downloadAllBtn.disabled = false;
    });

    async function compressImage(file, targetKB, mimeType, forceOverride = false, isHeic = false) {
        const targetBytes = targetKB * 1024;
        
        if (workers.length > 0) {
            if (isHeic) {
                return await compressWithWorker({ fileBlob: file, isHeic: true, targetBytes, mimeType: 'image/jpeg', isPDF: false, forceOverride }, []);
            } else {
                const bitmap = await createImageBitmap(file);
                return await compressWithWorker({ bitmap, targetBytes, mimeType, isPDF: false, forceOverride }, [bitmap]);
            }
        } else {
            const dataUrl = await blobToDataURL(file);
            return new Promise((resolve, reject) => {
                const img = new Image();
                img.onload = async () => {
                    const canvas = document.createElement('canvas');
                    canvas.width = img.width;
                    canvas.height = img.height;
                    const ctx = canvas.getContext('2d');
                    ctx.fillStyle = '#FFFFFF';
                    ctx.fillRect(0, 0, canvas.width, canvas.height);
                    ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
                    
                    try {
                        const blob = await iterativeCompressCanvas(canvas, targetBytes, mimeType, false, forceOverride);
                        resolve(blob);
                    } catch(e) {
                        reject(e);
                    }
                };
                img.onerror = reject;
                img.src = dataUrl;
            });
        }
    }

    async function compressPDF(file, targetKB, onProgress, forceOverride = false) {
        const arrayBuffer = await file.arrayBuffer();
        const pdf = await pdfjsLib.getDocument(arrayBuffer).promise;
        const numPages = pdf.numPages;
        
        let targetBytesPerPage = (targetKB * 1024) / numPages;
        if (!forceOverride && targetBytesPerPage < 5120) targetBytesPerPage = 5120; 
        
        const jsPDF = window.jspdf.jsPDF;
        let doc;
        
        const BATCH_SIZE = 3;
        let processedPages = 0;
        
        for (let i = 1; i <= numPages; i += BATCH_SIZE) {
            const batchPromises = [];
            
            for (let j = 0; j < BATCH_SIZE && (i + j) <= numPages; j++) {
                let pageNum = i + j;
                batchPromises.push((async () => {
                    const page = await pdf.getPage(pageNum);
                    
                    const baseViewport = page.getViewport({ scale: 1.0 });
                    const renderViewport = page.getViewport({ scale: 1.5 });
                    
                    const canvas = document.createElement('canvas');
                    const ctx = canvas.getContext('2d');
                    canvas.width = renderViewport.width;
                    canvas.height = renderViewport.height;
                    
                    ctx.fillStyle = '#FFFFFF';
                    ctx.fillRect(0, 0, canvas.width, canvas.height);
                    
                    await page.render({ canvasContext: ctx, viewport: renderViewport }).promise;
                    
                    let compressedBlob;
                    if (workers.length > 0) {
                        const bitmap = await createImageBitmap(canvas);
                        compressedBlob = await compressWithWorker({ bitmap, targetBytes: targetBytesPerPage, mimeType: 'image/jpeg', isPDF: true, forceOverride }, [bitmap]);
                    } else {
                        await new Promise(r => setTimeout(r, 10));
                        compressedBlob = await iterativeCompressCanvas(canvas, targetBytesPerPage, 'image/jpeg', true, forceOverride);
                    }
                    
                    const buf = await compressedBlob.arrayBuffer();
                    return {
                        pageNum: pageNum,
                        uint8Array: new Uint8Array(buf),
                        pageWidth: baseViewport.width,
                        pageHeight: baseViewport.height
                    };
                })());
            }
            
            const batchResults = await Promise.all(batchPromises);
            batchResults.sort((a, b) => a.pageNum - b.pageNum);
            
            for (let res of batchResults) {
                processedPages++;
                onProgress(processedPages, numPages);
                
                let orientation = res.pageWidth > res.pageHeight ? 'l' : 'p';
                if (res.pageNum === 1) {
                    doc = new jsPDF({ orientation: orientation, unit: 'px', format: [res.pageWidth, res.pageHeight] });
                } else {
                    doc.addPage([res.pageWidth, res.pageHeight], orientation);
                }
                
                doc.addImage(res.uint8Array, 'JPEG', 0, 0, res.pageWidth, res.pageHeight);
            }
        }
        
        return doc.output('blob');
    }

    async function iterativeCompressCanvas(originalCanvas, targetBytes, mimeType, isPDF = false, forceOverride = false) {
        let bestBlob = null;
        let minQuality = 0.0;
        let maxQuality = 1.0;
        
        for (let i = 0; i < 7; i++) {
            let quality = (minQuality + maxQuality) / 2;
            let blob = await getCanvasBlob(originalCanvas, mimeType, quality);
            
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
            let currentCanvas = originalCanvas;
            bestBlob = await getCanvasBlob(currentCanvas, mimeType, forceOverride ? 0.1 : 0.5); 

            let MIN_DIMENSION = 50;
            if (isPDF) MIN_DIMENSION = forceOverride ? 100 : 500;
            
            const scaleFloor = forceOverride ? 0.01 : 0.05;

            let workingCanvas = document.createElement('canvas');
            let newCtx = workingCanvas.getContext('2d');

            while (bestBlob && bestBlob.size > targetBytes && scale > scaleFloor) {
                let newWidth = Math.floor(originalCanvas.width * scale);
                let newHeight = Math.floor(originalCanvas.height * scale);
                
                if (Math.min(newWidth, newHeight) < MIN_DIMENSION) {
                    break;
                }

                workingCanvas.width = Math.max(1, newWidth);
                workingCanvas.height = Math.max(1, newHeight);
                newCtx.fillStyle = '#FFFFFF';
                newCtx.fillRect(0, 0, workingCanvas.width, workingCanvas.height);
                newCtx.drawImage(originalCanvas, 0, 0, workingCanvas.width, workingCanvas.height);
                
                bestBlob = await getCanvasBlob(workingCanvas, mimeType, 0.5); 
                if (bestBlob.size > targetBytes && forceOverride) {
                    bestBlob = await getCanvasBlob(workingCanvas, mimeType, 0.1); 
                }
                scale -= forceOverride ? 0.05 : 0.15;
            }
        }
        return bestBlob;
    }

    function getCanvasBlob(canvas, mimeType, quality) {
        return new Promise((resolve) => {
            canvas.toBlob((blob) => resolve(blob), mimeType, quality);
        });
    }

    function blobToDataURL(blob) {
        return new Promise((resolve, reject) => {
            const reader = new FileReader();
            reader.onload = (e) => resolve(e.target.result);
            reader.onerror = (e) => reject(e);
            reader.readAsDataURL(blob);
        });
    }

    function formatBytes(bytes, decimals = 2) {
        if (!+bytes) return '0 Bytes';
        const k = 1024;
        const dm = decimals < 0 ? 0 : decimals;
        const sizes = ['Bytes', 'KB', 'MB', 'GB', 'TB', 'PB', 'EB', 'ZB', 'YB'];
        const i = Math.floor(Math.log(bytes) / Math.log(k));
        return `${parseFloat((bytes / Math.pow(k, i)).toFixed(dm))} ${sizes[i]}`;
    }
});
