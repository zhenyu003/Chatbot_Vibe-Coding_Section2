import { useState, useRef } from 'react';
import { downloadChannelData } from '../services/youtubeApi';
import './YouTubeDownload.css';

export default function YouTubeDownload() {
  const [url, setUrl] = useState('https://www.youtube.com/@veritasium');
  const [maxVideos, setMaxVideos] = useState(10);
  const [progress, setProgress] = useState(0);
  const [downloading, setDownloading] = useState(false);
  const [error, setError] = useState('');
  const [result, setResult] = useState(null);
  const downloadLinkRef = useRef(null);

  const handleDownload = async () => {
    setError('');
    setResult(null);
    setProgress(0);
    setDownloading(true);

    try {
      const data = await downloadChannelData(url, maxVideos, (current, total) => {
        setProgress((current / total) * 100);
      });
      setResult(data);
      setProgress(100);

      const blob = new Blob([JSON.stringify(data, null, 2)], {
        type: 'application/json',
      });
      const blobUrl = URL.createObjectURL(blob);
      if (downloadLinkRef.current) {
        downloadLinkRef.current.href = blobUrl;
        downloadLinkRef.current.download = `channel_data_${Date.now()}.json`;
        downloadLinkRef.current.click();
        URL.revokeObjectURL(blobUrl);
      }
    } catch (err) {
      setError(err.message || 'Download failed');
    } finally {
      setDownloading(false);
    }
  };

  return (
    <div className="youtube-download">
      <div className="youtube-download-card">
        <h2>YouTube Channel Data Download</h2>
        <p className="youtube-download-desc">
          Enter a YouTube channel URL to download metadata for its videos (title, description,
          transcript, duration, views, likes, etc.).
        </p>

        <div className="youtube-download-form">
          <label>
            Channel URL
            <input
              type="url"
              placeholder="https://www.youtube.com/@veritasium"
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              disabled={downloading}
            />
          </label>
          <label>
            Max videos (1–100)
            <input
              type="number"
              min={1}
              max={100}
              value={maxVideos}
              onChange={(e) => setMaxVideos(Math.min(100, Math.max(1, parseInt(e.target.value, 10) || 10)))}
              disabled={downloading}
            />
          </label>
        </div>

        {error && <p className="youtube-download-error">{error}</p>}

        {downloading && (
          <div className="youtube-download-progress-wrap">
            <div className="youtube-download-progress-bar">
              <div
                className="youtube-download-progress-fill"
                style={{ width: `${progress}%` }}
              />
            </div>
            <span className="youtube-download-progress-text">{Math.round(progress)}%</span>
          </div>
        )}

        <button
          className="youtube-download-btn"
          onClick={handleDownload}
          disabled={downloading || !url.trim()}
        >
          {downloading ? 'Downloading…' : 'Download Channel Data'}
        </button>

        <a ref={downloadLinkRef} href="about:blank" download style={{ display: 'none' }} aria-hidden="true">
          Download
        </a>

        {result && (
          <div className="youtube-download-result">
            <p>
              Downloaded {result.video_count} videos from {result.channel_name}.
            </p>
            <p className="youtube-download-hint">
              JSON file has been downloaded. You can also drag it into the Chat tab to analyze it.
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
