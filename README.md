# File Compressor Pro

A high-performance, privacy-first, 100% client-side file compression web application designed to run entirely in the browser. Compress JPEGs, PNGs, WEBP, HEIC images, and PDFs to target limits (e.g. 50KB, 100KB) quickly and safely.

## Features

- **Hardware-Aware Concurrency Control**: Automatically detects and leverages multiple CPU cores using Web Workers for ultra-fast multi-file batch processing. Includes a dynamic, load-aware concurrency control slider.
- **Asynchronous Task Queue**: Buffers large file batches to prevent browser memory spikes and tab crashes.
- **Multi-Format Support**: Handles JPEG, PNG, WEBP, Apple HEIC, and multi-page PDF documents.
- **Smart PDF Downscaling**: Decouples physical layouts from rendering resolutions to compress PDFs without changing physical page boundaries. Paints solid white backgrounds to remove transparency blackout artifacts in JPEGs.
- **Two-Pass Compression for PDFs**: 
  - *Pass 1 (Readable)*: Squeezes PDFs to a high-quality readable limit (minimum 500px and 0.5 quality).
  - *Pass 2 (Crush)*: Enables a "Force to Target" option to override readability and forcefully compress the file to the strict target limit.
- **Zero Server-Side Handling**: All conversions and compressions happen inside the browser client. Your data never leaves your device.

## Getting Started

### Local Setup
Run a simple HTTP server from the root directory:
```bash
python3 -m http.server 8000
```
Open [http://localhost:8000](http://localhost:8000) in your web browser.

## Tech Stack
- HTML5, CSS3 (Glassmorphic modern UI)
- Vanilla Javascript (ES6)
- [PDF.js](https://mozilla.github.io/pdf.js/) (PDF Parsing)
- [jsPDF](https://github.com/parallax/jsPDF) (PDF Rendering)
- [heic2any](https://alexcorvi.github.io/heic2any/) (HEIC Decoding)

## License
All rights reserved to Dilip Sahu. See `LICENSE` for details.
