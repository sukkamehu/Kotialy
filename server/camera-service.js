const { spawn } = require('child_process');

class CameraService {
  constructor() {
    this.enabled = process.env.CAMERA_ENABLED !== 'false';
    this.name = process.env.CAMERA_NAME || 'Pannuhuone / Tekninen tila';
    this.subRtspUrl = process.env.CAMERA_RTSP_URL || 'rtsp://admin:123456789@192.168.68.57:554/0/av1';
    this.mainRtspUrl = process.env.CAMERA_MAIN_RTSP_URL || 'rtsp://admin:123456789@192.168.68.57:554/0/av0';
    this.cacheMs = parseInt(process.env.CAMERA_CACHE_MS || '1500', 10);

    this.cachedSnapshot = null;
    this.lastSnapshotAt = null;
    this.lastError = null;
    this.online = false;
    this.inFlightPromise = null;
    this.pollTimer = null;
  }

  /**
   * Get sanitized stream URL for safe display
   */
  getSanitizedUrl(url) {
    try {
      const parsed = new URL(url);
      return `${parsed.protocol}//***:***@${parsed.host}${parsed.pathname}`;
    } catch {
      return 'rtsp://***:***@192.168.68.57:554/0/av1';
    }
  }

  /**
   * Fetch a snapshot as JPEG Buffer.
   * Uses in-memory caching and request deduplication.
   */
  async getSnapshot(highRes = false) {
    if (!this.enabled) {
      throw new Error('Kamera ei ole käytössä');
    }

    const now = Date.now();
    // Use cached buffer if recent enough (only for standard sub stream)
    if (!highRes && this.cachedSnapshot && (now - this.lastSnapshotAt < this.cacheMs)) {
      return {
        data: this.cachedSnapshot,
        contentType: 'image/jpeg',
        ts: this.lastSnapshotAt,
        cached: true,
      };
    }

    // If an extraction is already in progress, await it
    if (!highRes && this.inFlightPromise) {
      return this.inFlightPromise;
    }

    const streamUrl = highRes ? this.mainRtspUrl : this.subRtspUrl;

    const capturePromise = new Promise((resolve, reject) => {
      const chunks = [];
      const errChunks = [];

      // ffmpeg flags optimized for low latency RTSP single-frame grab over UDP
      const args = [
        '-y',
        '-rtsp_transport', 'udp',
        '-i', streamUrl,
        '-vframes', '1',
        '-q:v', '2',
        '-f', 'image2',
        'pipe:1',
      ];

      const ffmpeg = spawn('ffmpeg', args, {
        stdio: ['ignore', 'pipe', 'pipe'],
      });

      let finished = false;
      const timeout = setTimeout(() => {
        if (!finished) {
          finished = true;
          try { ffmpeg.kill('SIGKILL'); } catch {}
          const timeoutErr = new Error('Kamerayhteys aikakatkaistiin (4500ms)');
          this.lastError = timeoutErr.message;
          this.online = false;
          reject(timeoutErr);
        }
      }, 4500);

      ffmpeg.stdout.on('data', (chunk) => {
        chunks.push(chunk);
      });

      ffmpeg.stderr.on('data', (chunk) => {
        errChunks.push(chunk);
      });

      ffmpeg.on('error', (err) => {
        if (finished) return;
        finished = true;
        clearTimeout(timeout);
        this.lastError = err.message;
        this.online = false;
        reject(err);
      });

      ffmpeg.on('close', (code) => {
        if (finished) return;
        finished = true;
        clearTimeout(timeout);

        const buffer = Buffer.concat(chunks);
        if (code === 0 && buffer.length > 1000) {
          const timestamp = Date.now();
          if (!highRes) {
            this.cachedSnapshot = buffer;
            this.lastSnapshotAt = timestamp;
          }
          this.online = true;
          this.lastError = null;
          resolve({
            data: buffer,
            contentType: 'image/jpeg',
            ts: timestamp,
            cached: false,
          });
        } else {
          const errMsg = Buffer.concat(errChunks).toString('utf-8').trim();
          const err = new Error(`FFmpeg virhe (koodi ${code}): ${errMsg.slice(-200) || 'Ei kuvaa saatu'}`);
          this.lastError = err.message;
          this.online = false;

          // If we have a previous cached snapshot, fall back gracefully
          if (this.cachedSnapshot) {
            resolve({
              data: this.cachedSnapshot,
              contentType: 'image/jpeg',
              ts: this.lastSnapshotAt,
              cached: true,
              stale: true,
            });
          } else {
            reject(err);
          }
        }
      });
    });

    if (!highRes) {
      this.inFlightPromise = capturePromise.finally(() => {
        this.inFlightPromise = null;
      });
      return this.inFlightPromise;
    }

    return capturePromise;
  }

  /**
   * Get metadata and connection status
   */
  getStatus() {
    return {
      enabled: this.enabled,
      online: this.online,
      name: this.name,
      lastSnapshotAt: this.lastSnapshotAt,
      error: this.lastError,
      hasSnapshot: !!this.cachedSnapshot,
      subRtspUrlDisplay: this.getSanitizedUrl(this.subRtspUrl),
      mainRtspUrlDisplay: this.getSanitizedUrl(this.mainRtspUrl),
      resolution: '640x352 (Sub) / 1920x1080 (Main)',
    };
  }

  /**
   * Background poller to keep a fresh thumbnail ready in memory
   */
  startScheduler(intervalMs = 30000) {
    if (!this.enabled) return;

    // Run first grab after 2 seconds
    setTimeout(() => {
      this.getSnapshot().catch((err) => {
        console.warn('[Camera] Initial background snapshot error:', err.message);
      });
    }, 2000);

    if (this.pollTimer) clearInterval(this.pollTimer);
    this.pollTimer = setInterval(() => {
      this.getSnapshot().catch((err) => {
        // Silently capture status in this.lastError
      });
    }, intervalMs);
  }
}

const cameraService = new CameraService();
module.exports = cameraService;
