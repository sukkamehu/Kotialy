const { spawn } = require('child_process');

class CameraService {
  constructor() {
    this.enabled = process.env.CAMERA_ENABLED !== 'false';
    this.name = process.env.CAMERA_NAME || 'Pannuhuone / Tekninen tila';
    this.subRtspUrl = process.env.CAMERA_RTSP_URL || 'rtsp://admin:123456789@192.168.68.57:554/0/av1';
    this.mainRtspUrl = process.env.CAMERA_MAIN_RTSP_URL || 'rtsp://admin:123456789@192.168.68.57:554/0/av0';
    this.cacheMs = parseInt(process.env.CAMERA_CACHE_MS || '600', 10);

    // Separate caches for SD (Sub) and HD (1080p)
    this.cachedSD = null;
    this.lastSDAt = null;
    this.cachedHD = null;
    this.lastHDAt = null;

    this.consecutiveErrors = 0;
    this.lastError = null;
    this.online = true; // Assume online if service is running
    this.inFlightSD = null;
    this.inFlightHD = null;
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
   * Return any cached frame as fallback
   */
  getFallbackSnapshot(highRes) {
    const fallback = highRes ? (this.cachedHD || this.cachedSD) : (this.cachedSD || this.cachedHD);
    const fallbackTs = highRes ? (this.lastHDAt || this.lastSDAt) : (this.lastSDAt || this.lastHDAt);
    if (fallback) {
      return {
        data: fallback,
        contentType: 'image/jpeg',
        ts: fallbackTs,
        cached: true,
        stale: true,
        highRes,
      };
    }
    return null;
  }

  /**
   * Fetch a snapshot as high quality JPEG Buffer.
   * Uses in-memory caching, request deduplication, and resilient fallback on dropped frames.
   */
  async getSnapshot(highRes = true) {
    if (!this.enabled) {
      throw new Error('Kamera ei ole käytössä');
    }

    const now = Date.now();
    const cachedBuffer = highRes ? this.cachedHD : this.cachedSD;
    const lastAt = highRes ? this.lastHDAt : this.lastSDAt;

    // Use cached buffer if recent enough
    if (cachedBuffer && (now - lastAt < this.cacheMs)) {
      return {
        data: cachedBuffer,
        contentType: 'image/jpeg',
        ts: lastAt,
        cached: true,
        stale: false,
        highRes,
      };
    }

    // If an extraction is already in progress for this resolution, await it
    if (highRes && this.inFlightHD) return this.inFlightHD;
    if (!highRes && this.inFlightSD) return this.inFlightSD;

    const streamUrl = highRes ? this.mainRtspUrl : this.subRtspUrl;

    const capturePromise = new Promise((resolve, reject) => {
      const chunks = [];
      const errChunks = [];

      // ffmpeg flags: low-latency, socket timeout, fast exit on frame capture
      const args = [
        '-y',
        '-fflags', 'nobuffer',
        '-flags', 'low_delay',
        '-stimeout', '3500000', // 3.5s socket timeout
        '-analyzeduration', '100000',
        '-probesize', '100000',
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
          this.consecutiveErrors++;
          this.lastError = 'Kamerayhteys aikakatkaistiin (4000ms)';
          if (this.consecutiveErrors >= 4) {
            this.online = false;
          }

          const fallback = this.getFallbackSnapshot(highRes);
          if (fallback) {
            resolve(fallback);
          } else {
            reject(new Error(this.lastError));
          }
        }
      }, 4000);

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
        this.consecutiveErrors++;
        this.lastError = err.message;
        if (this.consecutiveErrors >= 4) {
          this.online = false;
        }

        const fallback = this.getFallbackSnapshot(highRes);
        if (fallback) {
          resolve(fallback);
        } else {
          reject(err);
        }
      });

      ffmpeg.on('close', (code) => {
        if (finished) return;
        finished = true;
        clearTimeout(timeout);

        const buffer = Buffer.concat(chunks);
        if (code === 0 && buffer.length > 1000) {
          const timestamp = Date.now();
          if (highRes) {
            this.cachedHD = buffer;
            this.lastHDAt = timestamp;
          } else {
            this.cachedSD = buffer;
            this.lastSDAt = timestamp;
          }
          this.online = true;
          this.consecutiveErrors = 0;
          this.lastError = null;
          resolve({
            data: buffer,
            contentType: 'image/jpeg',
            ts: timestamp,
            cached: false,
            stale: false,
            highRes,
          });
        } else {
          this.consecutiveErrors++;
          const errMsg = Buffer.concat(errChunks).toString('utf-8').trim();
          this.lastError = `FFmpeg virhe (${code}): ${errMsg.slice(-150) || 'Ei kuvaa saatu'}`;
          if (this.consecutiveErrors >= 4) {
            this.online = false;
          }

          const fallback = this.getFallbackSnapshot(highRes);
          if (fallback) {
            resolve(fallback);
          } else {
            reject(new Error(this.lastError));
          }
        }
      });
    });

    if (highRes) {
      this.inFlightHD = capturePromise.finally(() => {
        this.inFlightHD = null;
      });
      return this.inFlightHD;
    } else {
      this.inFlightSD = capturePromise.finally(() => {
        this.inFlightSD = null;
      });
      return this.inFlightSD;
    }
  }

  /**
   * Get metadata and connection status
   */
  getStatus() {
    return {
      enabled: this.enabled,
      online: this.online,
      name: this.name,
      lastSnapshotAt: this.lastHDAt || this.lastSDAt,
      error: this.consecutiveErrors >= 4 ? this.lastError : null,
      hasSnapshot: !!(this.cachedHD || this.cachedSD),
      subRtspUrlDisplay: this.getSanitizedUrl(this.subRtspUrl),
      mainRtspUrlDisplay: this.getSanitizedUrl(this.mainRtspUrl),
      resolution: '640x352 (Sub) / 1920x1080 (1080p Main HD)',
    };
  }

  /**
   * Background poller to keep fresh snapshots ready in memory
   */
  startScheduler(intervalMs = 30000) {
    if (!this.enabled) return;

    // Run first grab after 2 seconds
    setTimeout(() => {
      this.getSnapshot(true).catch(() => {});
      this.getSnapshot(false).catch(() => {});
    }, 2000);

    if (this.pollTimer) clearInterval(this.pollTimer);
    this.pollTimer = setInterval(() => {
      // Periodic HD refresh
      this.getSnapshot(true).catch(() => {});
    }, intervalMs);
  }
}

const cameraService = new CameraService();
module.exports = cameraService;
