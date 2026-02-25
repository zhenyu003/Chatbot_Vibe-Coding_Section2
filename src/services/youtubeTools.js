// ── YouTube / JSON channel data tools ────────────────────────────────────────
// Used when user loads JSON file with YouTube channel video data.

export const YOUTUBE_TOOL_DECLARATIONS = [
  {
    name: 'generateImage',
    description:
      'Generate an image from a text prompt. If the user attached/dragged an anchor image, it will be used automatically as style reference. ' +
      'Returns the generated image displayed in chat. Use when the user asks to create, generate, or make an image.',
    parameters: {
      type: 'OBJECT',
      properties: {
        prompt: {
          type: 'STRING',
          description: 'The text description of the image to generate. Be descriptive (subject, style, colors, mood).',
        },
      },
      required: ['prompt'],
    },
  },
  {
    name: 'plot_metric_vs_time',
    description:
      'Plot a numeric field (view_count, like_count, comment_count, duration in seconds, etc.) vs time for the channel videos. ' +
      'Creates a line or bar chart. Use when the user asks to plot, graph, or visualize a metric over time. ' +
      'Requires channel JSON data to be loaded.',
    parameters: {
      type: 'OBJECT',
      properties: {
        metric: {
          type: 'STRING',
          description:
            'The numeric field to plot. Use exact names: view_count, like_count, comment_count, duration_seconds. For duration, convert "MM:SS" to seconds.',
        },
      },
      required: ['metric'],
    },
  },
  {
    name: 'play_video',
    description:
      'Open a YouTube video from the loaded channel data. Returns a clickable card (title + thumbnail) that opens the video in a new tab. ' +
      'Use when the user asks to play, open, or watch a video. The user can specify by: title (e.g. "the asbestos video"), ' +
      'ordinal (e.g. "first video", "third video"), or "most viewed" / "least viewed".',
    parameters: {
      type: 'OBJECT',
      properties: {
        selector: {
          type: 'STRING',
          description:
            'How to pick the video: "first", "second", "third", etc. for ordinal; "most viewed" or "least viewed"; or a partial title match (e.g. "asbestos").',
        },
      },
      required: ['selector'],
    },
  },
  {
    name: 'compute_stats_json',
    description:
      'Compute mean, median, std (standard deviation), min, and max for any numeric field in the channel JSON. ' +
      'Use when the user asks for statistics, average, distribution, or summary of a numeric column. ' +
      'Fields: view_count, like_count, comment_count, duration_seconds.',
    parameters: {
      type: 'OBJECT',
      properties: {
        field: {
          type: 'STRING',
          description:
            'Exact field name: view_count, like_count, comment_count, or duration_seconds (convert duration "MM:SS" to seconds first).',
        },
      },
      required: ['field'],
    },
  },
];

// Parse duration "MM:SS" or "H:MM:SS" to seconds
export function parseDurationToSeconds(dur) {
  if (dur == null || dur === '') return null;
  if (typeof dur === 'number' && !isNaN(dur)) return dur;
  const s = String(dur).trim();
  const parts = s.split(':').map((p) => parseInt(p, 10));
  if (parts.some((p) => isNaN(p))) return null;
  if (parts.length === 2) return parts[0] * 60 + parts[1];
  if (parts.length === 3) return parts[0] * 3600 + parts[1] * 60 + parts[2];
  return null;
}

// Return which plottable fields actually have numeric data in the loaded videos
function getAvailablePlottableFields(videos) {
  const candidates = ['view_count', 'like_count', 'comment_count', 'duration_seconds'];
  return candidates.filter((field) => {
    if (field === 'duration_seconds') {
      return videos.some((v) => parseDurationToSeconds(v.duration) != null);
    }
    return videos.some((v) => !isNaN(parseFloat(v[field])));
  });
}

// Execute YouTube tools
export function executeYoutubeTool(toolName, args, context) {
  const { jsonData } = context;
  const videos = jsonData?.videos || [];
  const headers = videos.length ? Object.keys(videos[0]) : [];

  switch (toolName) {
    case 'compute_stats_json': {
      const field = args.field;
      let values = [];
      if (field === 'duration_seconds') {
        values = videos
          .map((v) => parseDurationToSeconds(v.duration))
          .filter((x) => x != null);
      } else {
        values = videos
          .map((v) => parseFloat(v[field]))
          .filter((x) => !isNaN(x));
      }
      if (!values.length) {
        const available = getAvailablePlottableFields(videos);
        return { error: `"${field}" has no numeric data. Fields with data: ${available.join(', ') || 'none found'}.` };
      }
      const sorted = [...values].sort((a, b) => a - b);
      const mean = values.reduce((a, b) => a + b, 0) / values.length;
      const median =
        sorted.length % 2 === 0
          ? (sorted[sorted.length / 2 - 1] + sorted[sorted.length / 2]) / 2
          : sorted[Math.floor(sorted.length / 2)];
      const variance = values.reduce((a, b) => a + (b - mean) ** 2, 0) / values.length;
      return {
        field,
        count: values.length,
        mean: +mean.toFixed(4),
        median: +median.toFixed(4),
        std: +Math.sqrt(variance).toFixed(4),
        min: Math.min(...values),
        max: Math.max(...values),
      };
    }

    case 'plot_metric_vs_time': {
      const metric = args.metric;
      let values = [];
      let labels = [];
      if (metric === 'duration_seconds') {
        videos.forEach((v, i) => {
          const sec = parseDurationToSeconds(v.duration);
          if (sec != null) {
            values.push(sec);
            labels.push(v.title || `Video ${i + 1}`);
          }
        });
      } else {
        videos.forEach((v, i) => {
          const val = parseFloat(v[metric]);
          if (!isNaN(val)) {
            values.push(val);
            labels.push(v.title || `Video ${i + 1}`);
          }
        });
      }
      if (!values.length) {
        const available = getAvailablePlottableFields(videos);
        const suggestion = available.length
          ? `"${metric}" has no numeric data in this dataset. Fields with data: ${available.join(', ')}.`
          : `"${metric}" has no numeric data in this dataset. No plottable numeric fields were found.`;
        return { error: suggestion };
      }
      const data = labels.map((name, i) => ({ name: name.slice(0, 40), value: values[i], fullTitle: labels[i] }));
      return {
        _chartType: 'metric_vs_time',
        metric,
        data,
      };
    }

    case 'play_video': {
      const sel = String(args.selector || '').toLowerCase().trim();
      let video = null;
      if (sel === 'most viewed' || sel === 'most viewed video') {
        video = [...videos].sort((a, b) => (b.view_count || 0) - (a.view_count || 0))[0];
      } else if (sel === 'least viewed' || sel === 'least viewed video') {
        video = [...videos].sort((a, b) => (a.view_count || 0) - (b.view_count || 0))[0];
      } else if (/^first|1st|1\b/.test(sel)) {
        video = videos[0];
      } else if (/^second|2nd|2\b/.test(sel)) {
        video = videos[1];
      } else if (/^third|3rd|3\b/.test(sel)) {
        video = videos[2];
      } else if (/^\d+/.test(sel)) {
        const idx = parseInt(sel, 10) - 1;
        video = videos[idx];
      } else {
        video = videos.find((v) => (v.title || '').toLowerCase().includes(sel));
      }
      if (!video)
        return { error: `No video found for "${args.selector}". Try "first", "most viewed", or a title keyword.` };
      return {
        _chartType: 'play_video',
        video_id: video.video_id,
        title: video.title,
        thumbnail_url: video.thumbnail_url,
        video_url: video.video_url || `https://www.youtube.com/watch?v=${video.video_id}`,
      };
    }

    case 'generateImage':
      return { _chartType: 'generateImage', prompt: args.prompt, anchorImageBase64: context.anchorImageBase64 || args.anchorImageBase64 || null };

    default:
      return { error: `Unknown tool: ${toolName}` };
  }
}
