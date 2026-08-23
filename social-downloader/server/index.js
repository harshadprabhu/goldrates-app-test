import express from 'express';
import { spawn } from 'child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PUBLIC_DIR = path.join(__dirname, '..', 'public');

const app = express();
app.use(express.json());
app.use(express.static(PUBLIC_DIR));

// Platforms this instance knows how to auto-detect. yt-dlp itself supports
// far more sites; this list only controls what the UI recognizes as "supported".
const PLATFORMS = [
  { id: 'youtube', label: 'YouTube', re: /(?:youtube\.com|youtu\.be)/i },
  { id: 'instagram', label: 'Instagram', re: /instagram\.com/i },
  { id: 'facebook', label: 'Facebook', re: /(?:facebook\.com|fb\.watch)/i },
  { id: 'tiktok', label: 'TikTok', re: /tiktok\.com/i },
  { id: 'twitter', label: 'X / Twitter', re: /(?:twitter\.com|x\.com)/i },
];

function detectPlatform(url) {
  return PLATFORMS.find((p) => p.re.test(url)) || null;
}

function isHttpUrl(value) {
  try {
    const u = new URL(value);
    return u.protocol === 'http:' || u.protocol === 'https:';
  } catch {
    return false;
  }
}

function runYtDlpJson(url) {
  return new Promise((resolve, reject) => {
    const proc = spawn('yt-dlp', ['-j', '--no-playlist', '--no-warnings', url]);
    let stdout = '';
    let stderr = '';
    proc.stdout.on('data', (chunk) => (stdout += chunk));
    proc.stderr.on('data', (chunk) => (stderr += chunk));
    proc.on('error', (err) => reject(new Error(`yt-dlp not available: ${err.message}`)));
    proc.on('close', (code) => {
      if (code !== 0) return reject(new Error(stderr.trim() || `yt-dlp exited with code ${code}`));
      try {
        // -j prints one JSON object per line; take the first for single videos.
        resolve(JSON.parse(stdout.trim().split('\n')[0]));
      } catch (err) {
        reject(new Error('Could not parse video metadata.'));
      }
    });
  });
}

app.post('/api/resolve', async (req, res) => {
  const url = String(req.body?.url || '').trim();
  if (!isHttpUrl(url)) {
    return res.status(400).json({ error: 'Paste a valid link starting with http(s)://' });
  }
  const platform = detectPlatform(url);
  if (!platform) {
    return res.status(422).json({
      error: 'Unrecognized link. Supported: YouTube, Instagram, Facebook, TikTok, X/Twitter.',
    });
  }

  try {
    const info = await runYtDlpJson(url);
    const seen = new Set();
    const formats = (info.formats || [])
      .filter((f) => (f.vcodec && f.vcodec !== 'none') || (f.acodec && f.acodec !== 'none'))
      .map((f) => ({
        format_id: f.format_id,
        ext: f.ext,
        resolution: f.resolution || (f.height ? `${f.height}p` : 'audio'),
        note: f.format_note || '',
        filesize: f.filesize || f.filesize_approx || null,
        hasVideo: !!(f.vcodec && f.vcodec !== 'none'),
        hasAudio: !!(f.acodec && f.acodec !== 'none'),
      }))
      .filter((f) => {
        const key = `${f.resolution}-${f.hasVideo}-${f.hasAudio}`;
        if (seen.has(key)) return false;
        seen.add(key);
        return true;
      });

    res.json({
      platform: platform.id,
      platformLabel: platform.label,
      title: info.title || 'Untitled',
      thumbnail: info.thumbnail || null,
      duration: info.duration || null,
      uploader: info.uploader || info.channel || null,
      formats,
    });
  } catch (err) {
    res.status(502).json({
      error:
        'Could not fetch this link. It may be private, deleted, age-restricted, or the platform changed its page structure.',
    });
  }
});

app.get('/api/download', (req, res) => {
  const url = String(req.query.url || '');
  const formatId = req.query.format_id ? String(req.query.format_id) : null;
  const mode = req.query.mode === 'audio' ? 'audio' : 'video';

  if (!isHttpUrl(url)) return res.status(400).send('Invalid link');
  if (!detectPlatform(url)) return res.status(422).send('Unsupported link');

  const args = ['--no-playlist', '--no-warnings', '-o', '-'];
  if (mode === 'audio') {
    args.push('-x', '--audio-format', 'mp3');
  } else {
    args.push('-f', formatId || 'best[ext=mp4]/best');
  }
  args.push(url);

  res.setHeader('Content-Disposition', `attachment; filename="omnisaver-download.${mode === 'audio' ? 'mp3' : 'mp4'}"`);
  res.setHeader('Content-Type', mode === 'audio' ? 'audio/mpeg' : 'video/mp4');

  const proc = spawn('yt-dlp', args);
  proc.stdout.pipe(res);
  proc.on('error', () => {
    if (!res.headersSent) res.status(502).send('Download failed');
  });
  proc.stderr.on('data', () => {}); // yt-dlp logs progress to stderr; ignored here
  req.on('close', () => proc.kill('SIGKILL'));
});

app.get('/api/health', (_req, res) => res.json({ ok: true }));

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`OmniSaver server listening on http://localhost:${PORT}`);
});
