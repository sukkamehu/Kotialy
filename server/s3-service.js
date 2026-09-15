const fs = require('fs');
const path = require('path');
const { S3Client, PutObjectCommand, ListObjectsV2Command } = require('@aws-sdk/client-s3');

class S3Service {
  constructor() {
    this.accountId = process.env.R2_ACCOUNT_ID || process.env.CLOUDFLARE_ACCOUNT_ID || 'cec4d9659f1d7bc6e069f3787a46ef0f';
    
    // Cloudflare R2 endpoint format: https://<account_id>.r2.cloudflarestorage.com
    const defaultR2Endpoint = this.accountId ? `https://${this.accountId}.r2.cloudflarestorage.com` : 'https://cec4d9659f1d7bc6e069f3787a46ef0f.r2.cloudflarestorage.com';
    this.endpoint = process.env.R2_ENDPOINT || process.env.S3_ENDPOINT || defaultR2Endpoint;
    
    this.accessKeyId = process.env.R2_ACCESS_KEY_ID || process.env.S3_ACCESS_KEY_ID || '';
    this.secretAccessKey = process.env.R2_SECRET_ACCESS_KEY || process.env.S3_SECRET_ACCESS_KEY || '';
    this.bucketName = process.env.R2_BUCKET_NAME || process.env.S3_BUCKET_NAME || 'frontpics-storage';
    this.publicUrl = process.env.R2_PUBLIC_URL || process.env.S3_PUBLIC_URL || 'https://photos.dev.frontpics.fi';
    this.region = process.env.R2_REGION || process.env.S3_REGION || 'auto';
    this.prefix = process.env.R2_PREFIX || process.env.S3_PREFIX || 'kotialy/';

    this.client = null;
    this.lastBackupAt = null;
    this.lastBackupStatus = 'idle';
    this.lastBackupError = null;
    this.backupIntervalTimer = null;

    if (this.accessKeyId && this.secretAccessKey) {
      this.initClient();
    }
  }

  initClient() {
    try {
      this.client = new S3Client({
        endpoint: this.endpoint,
        region: this.region,
        credentials: {
          accessKeyId: this.accessKeyId,
          secretAccessKey: this.secretAccessKey,
        },
        forcePathStyle: true,
      });
      console.log(`[R2] Initialized Cloudflare R2 client for bucket '${this.bucketName}' @ ${this.endpoint}`);
    } catch (err) {
      console.error('[R2] Initialization error:', err.message);
      this.client = null;
    }
  }

  isConfigured() {
    return Boolean(this.client && this.bucketName && this.accessKeyId && this.secretAccessKey);
  }

  /**
   * Upload a buffer or string to Cloudflare R2
   */
  async uploadFile(key, body, contentType = 'application/octet-stream') {
    if (!this.client) throw new Error('Cloudflare R2 client not configured');
    const fullKey = this.prefix ? `${this.prefix.replace(/\/+$/, '')}/${key.replace(/^\/+/, '')}` : key;

    const command = new PutObjectCommand({
      Bucket: this.bucketName,
      Key: fullKey,
      Body: body,
      ContentType: contentType,
    });

    await this.client.send(command);
    return {
      bucket: this.bucketName,
      key: fullKey,
      url: this.publicUrl ? `${this.publicUrl.replace(/\/+$/, '')}/${fullKey}` : `${this.endpoint}/${this.bucketName}/${fullKey}`,
    };
  }

  /**
   * Backup SQLite database to Cloudflare R2
   */
  async backupDatabase() {
    if (!this.isConfigured()) {
      return { success: false, error: 'Cloudflare R2 not configured. Set R2_ACCESS_KEY_ID and R2_SECRET_ACCESS_KEY in .env.' };
    }

    const dbPath = process.env.DB_PATH || path.join(__dirname, 'data', 'kotialy.db');
    if (!fs.existsSync(dbPath)) {
      return { success: false, error: `Database file not found at ${dbPath}` };
    }

    this.lastBackupStatus = 'running';
    try {
      const data = fs.readFileSync(dbPath);
      const dateStr = new Date().toISOString().slice(0, 10); // YYYY-MM-DD
      const timestamp = new Date().toISOString().replace(/[:.]/g, '-');

      // Upload timestamped backup and latest pointer
      const datedKey = `backups/kotialy-${dateStr}-${timestamp}.db`;
      const latestKey = 'backups/latest.db';

      await this.uploadFile(datedKey, data, 'application/x-sqlite3');
      const latestRes = await this.uploadFile(latestKey, data, 'application/x-sqlite3');

      this.lastBackupAt = Date.now();
      this.lastBackupStatus = 'success';
      this.lastBackupError = null;

      console.log(`[R2] Database backup uploaded successfully to Cloudflare R2 (${(data.length / 1024 / 1024).toFixed(2)} MB): ${latestRes.key}`);
      return {
        success: true,
        sizeBytes: data.length,
        key: datedKey,
        latestKey: latestKey,
        uploadedAt: this.lastBackupAt,
      };
    } catch (err) {
      this.lastBackupStatus = 'error';
      this.lastBackupError = err.message;
      console.error('[R2] Database backup failed:', err);
      return { success: false, error: err.message };
    }
  }

  /**
   * Upload camera snapshot to Cloudflare R2
   */
  async uploadCameraSnapshot(imageBuffer, highRes = true) {
    if (!this.isConfigured() || !imageBuffer) return null;
    try {
      const key = `camera/${highRes ? 'snapshot-1080p.jpg' : 'snapshot-sub.jpg'}`;
      return await this.uploadFile(key, imageBuffer, 'image/jpeg');
    } catch (err) {
      console.error('[R2] Camera snapshot upload failed:', err.message);
      return null;
    }
  }

  /**
   * List backups stored in Cloudflare R2
   */
  async listBackups() {
    if (!this.isConfigured()) return [];
    try {
      const prefix = `${this.prefix.replace(/\/+$/, '')}/backups/`;
      const command = new ListObjectsV2Command({
        Bucket: this.bucketName,
        Prefix: prefix,
      });

      const response = await this.client.send(command);
      return (response.Contents || []).map((item) => ({
        key: item.Key,
        sizeBytes: item.Size,
        lastModified: item.LastModified,
      }));
    } catch (err) {
      console.error('[R2] List backups failed:', err.message);
      return [];
    }
  }

  /**
   * Get Cloudflare R2 service status
   */
  getStatus() {
    return {
      provider: 'cloudflare-r2',
      configured: this.isConfigured(),
      accountId: this.accountId,
      bucket: this.bucketName,
      endpoint: this.endpoint,
      publicUrl: this.publicUrl,
      prefix: this.prefix,
      lastBackupAt: this.lastBackupAt,
      lastBackupStatus: this.lastBackupStatus,
      lastBackupError: this.lastBackupError,
    };
  }

  /**
   * Start periodic backup scheduler (every 6 hours)
   */
  startScheduler() {
    if (this.backupIntervalTimer) clearInterval(this.backupIntervalTimer);

    if (this.isConfigured()) {
      setTimeout(() => {
        this.backupDatabase().catch(() => {});
      }, 30_000);
    }

    this.backupIntervalTimer = setInterval(() => {
      this.backupDatabase().catch(() => {});
    }, 6 * 60 * 60 * 1000);
  }
}

module.exports = new S3Service();
