import { useState } from 'react';
import { createPortal } from 'react-dom';
import './GeneratedImageDisplay.css';

export default function GeneratedImageDisplay({ base64, mimeType = 'image/png' }) {
  const [enlarged, setEnlarged] = useState(false);

  const src = `data:${mimeType};base64,${base64}`;

  const handleDownload = (e) => {
    e.stopPropagation();
    const link = document.createElement('a');
    link.download = `generated_image_${Date.now()}.png`;
    link.href = src;
    link.click();
  };

  return (
    <div className="generated-img-wrap">
      <img
        src={src}
        alt="Generated"
        className="generated-img"
        onClick={() => setEnlarged(true)}
      />
      <button className="generated-img-download-btn" onClick={handleDownload}>
        Download
      </button>
      <p className="generated-img-hint">Click to enlarge</p>

      {enlarged &&
        createPortal(
          <div className="generated-img-overlay" onClick={() => setEnlarged(false)}>
            <div className="generated-img-modal" onClick={(e) => e.stopPropagation()}>
              <button className="generated-img-download" onClick={handleDownload}>
                Download
              </button>
              <button className="generated-img-close" onClick={() => setEnlarged(false)}>
                ×
              </button>
              <img src={src} alt="Generated (enlarged)" className="generated-img-enlarged" />
            </div>
          </div>,
          document.body
        )}
    </div>
  );
}
