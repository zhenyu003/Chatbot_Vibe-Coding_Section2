/**
 * Fetches YouTube channel video metadata using youtubei.js (ESM).
 * Exported as a function that returns a promise; uses dynamic import.
 */
async function fetchChannelVideos(url, maxVideos, onProgress) {
  const yt = await import('youtubei.js');
  const { YoutubeTranscript } = require('youtube-transcript');
  const Innertube = yt.default;
  const Channel = yt.YT?.Channel || yt.Channel;

  const innertube = await Innertube.create();
  const endpoint = await innertube.resolveURL(url);
  if (!endpoint) throw new Error('Could not resolve YouTube URL');

  let result = await innertube.call(endpoint, { parse: true });
  if (!result) throw new Error('Could not load channel');

  if (result.on_response_received_actions?.[0]?.endpoint) {
    result = await result.on_response_received_actions[0].endpoint.call(innertube.actions, { parse: true });
  }

  const channel = result instanceof Channel ? result : new Channel(innertube.actions, result, true);
  const videosTab = await channel.getVideos();
  if (!videosTab || !videosTab.videos) throw new Error('No videos found on channel');

  const videos = videosTab.videos;
  const toFetch = Math.min(maxVideos, videos.length);
  const results = [];
  const channelName = channel.metadata?.title || 'Unknown Channel';

  for (let i = 0; i < toFetch; i++) {
    const v = videos[i];
    const videoId = v.video_id || v.id;
    if (!videoId) continue;

    try {
      const info = await innertube.getBasicInfo(videoId);
      if (!info?.basic_info) {
        results.push({
          video_id: videoId,
          title: v.title?.toString?.() || v.title || 'Unknown',
          description: '',
          duration: v.duration?.text || v.length_text?.toString?.() || null,
          release_date: v.published?.toString?.() || null,
          view_count: parseInt(String(v.views || v.short_view_count || v.view_count || '0').replace(/\D/g, ''), 10) || 0,
          like_count: null,
          comment_count: null,
          video_url: `https://www.youtube.com/watch?v=${videoId}`,
          thumbnail_url: `https://i.ytimg.com/vi/${videoId}/hqdefault.jpg`,
          transcript: null,
        });
      } else {
        const bi = info.basic_info;
        let transcript = null;
        try {
          const segments = await YoutubeTranscript.fetchTranscript(videoId);
          transcript = segments?.map((s) => s.text).join(' ') || null;
        } catch {
          transcript = null;
        }

        results.push({
          video_id: videoId,
          title: bi.title || v.title?.toString?.() || 'Unknown',
          description: bi.short_description || '',
          duration: bi.duration ? `${Math.floor(bi.duration / 60)}:${String(bi.duration % 60).padStart(2, '0')}` : (v.duration?.text || v.length_text?.toString?.() || null),
          release_date: bi.start_timestamp?.toISOString?.()?.slice(0, 10) || v.published?.toString?.() || null,
          view_count: bi.view_count ?? 0,
          like_count: bi.like_count ?? null,
          comment_count: null,
          video_url: bi.url_canonical || `https://www.youtube.com/watch?v=${videoId}`,
          thumbnail_url: `https://i.ytimg.com/vi/${videoId}/hqdefault.jpg`,
          transcript,
        });
      }
    } catch (err) {
      results.push({
        video_id: videoId,
        title: v.title?.toString?.() || v.title || 'Unknown',
        description: '',
        duration: v.duration?.text || v.length_text?.toString?.() || null,
        release_date: v.published?.toString?.() || null,
        view_count: parseInt(String(v.views || v.short_view_count || v.view_count || '0').replace(/\D/g, ''), 10) || 0,
        like_count: null,
        comment_count: null,
        video_url: `https://www.youtube.com/watch?v=${videoId}`,
        thumbnail_url: `https://i.ytimg.com/vi/${videoId}/hqdefault.jpg`,
        transcript: null,
        error: err.message,
      });
    }

    if (onProgress) onProgress(i + 1, toFetch);
  }

  return {
    channel_name: channelName,
    channel_url: url,
    fetched_at: new Date().toISOString(),
    video_count: results.length,
    videos: results,
  };
}

module.exports = { fetchChannelVideos };
