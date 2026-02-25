import './PlayVideoCard.css';

export default function PlayVideoCard({ video_url, title, thumbnail_url }) {
  return (
    <a
      href={video_url}
      target="_blank"
      rel="noreferrer"
      className="play-video-card"
    >
      <div className="play-video-thumb">
        {thumbnail_url && (
          <img
            src={thumbnail_url}
            alt=""
            onError={(e) => {
              const videoId = thumbnail_url.match(/\/vi\/([^/]+)\//)?.[1];
              if (videoId && !e.target.src.includes('hqdefault')) {
                e.target.src = `https://i.ytimg.com/vi/${videoId}/hqdefault.jpg`;
              }
            }}
          />
        )}
        <span className="play-video-icon">▶</span>
      </div>
      <div className="play-video-info">
        <span className="play-video-title">{title}</span>
        <span className="play-video-hint">Click to open on YouTube</span>
      </div>
    </a>
  );
}
