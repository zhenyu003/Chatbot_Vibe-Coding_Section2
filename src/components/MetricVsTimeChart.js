import { useState, useRef, useCallback } from 'react';
import { createPortal } from 'react-dom';
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from 'recharts';
import './MetricVsTimeChart.css';

function CustomTooltip({ active, payload, label }) {
  if (!active || !payload?.length) return null;
  return (
    <div className="metric-tooltip">
      <p className="metric-tooltip-title">{payload[0]?.payload?.fullTitle || label}</p>
      <p className="metric-tooltip-value">
        {payload[0]?.name}: <strong>{Number(payload[0]?.value).toLocaleString()}</strong>
      </p>
    </div>
  );
}

function ChartContent({ data, metric, height = 280, fontSize = { x: 10, y: 11 } }) {
  return (
    <ResponsiveContainer width="100%" height={height}>
      <LineChart data={data} margin={{ top: 8, right: 16, left: 0, bottom: 60 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.07)" vertical={false} />
        <XAxis
          dataKey="name"
          tick={{ fill: 'rgba(255,255,255,0.6)', fontSize: fontSize.x }}
          angle={-35}
          textAnchor="end"
          interval={0}
        />
        <YAxis
          tick={{ fill: 'rgba(255,255,255,0.5)', fontSize: fontSize.y }}
          axisLine={false}
          tickLine={false}
          width={60}
        />
        <Tooltip content={<CustomTooltip />} cursor={{ fill: 'rgba(255,255,255,0.04)' }} />
        <Line
          type="monotone"
          dataKey="value"
          stroke="#818cf8"
          strokeWidth={2}
          dot={{ fill: '#818cf8', r: 3 }}
          activeDot={{ r: 5 }}
        />
      </LineChart>
    </ResponsiveContainer>
  );
}

export default function MetricVsTimeChart({ metric, data }) {
  const [enlarged, setEnlarged] = useState(false);
  const modalChartRef = useRef(null);

  const handleDownload = useCallback(
    (e) => {
      e.stopPropagation();
      const container = modalChartRef.current;
      if (!container) return;

      const svgEl = container.querySelector('svg');
      if (!svgEl) return;

      const svgClone = svgEl.cloneNode(true);
      // Set explicit dimensions
      const rect = svgEl.getBoundingClientRect();
      const w = rect.width * 2; // 2x for retina quality
      const h = rect.height * 2;
      svgClone.setAttribute('width', w);
      svgClone.setAttribute('height', h);
      // Add white background
      const bg = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
      bg.setAttribute('width', '100%');
      bg.setAttribute('height', '100%');
      bg.setAttribute('fill', '#1a1a2e');
      svgClone.insertBefore(bg, svgClone.firstChild);

      const svgData = new XMLSerializer().serializeToString(svgClone);
      const blob = new Blob([svgData], { type: 'image/svg+xml;charset=utf-8' });
      const url = URL.createObjectURL(blob);

      const img = new Image();
      img.onload = () => {
        const canvas = document.createElement('canvas');
        canvas.width = w;
        canvas.height = h;
        const ctx = canvas.getContext('2d');
        ctx.drawImage(img, 0, 0, w, h);
        URL.revokeObjectURL(url);

        canvas.toBlob((pngBlob) => {
          const pngUrl = URL.createObjectURL(pngBlob);
          const link = document.createElement('a');
          link.download = `chart_${metric}_${Date.now()}.png`;
          link.href = pngUrl;
          link.click();
          URL.revokeObjectURL(pngUrl);
        }, 'image/png');
      };
      img.src = url;
    },
    [metric]
  );

  if (!data?.length) return null;

  return (
    <>
      <div className="metric-vs-time-chart" onClick={() => setEnlarged(true)}>
        <p className="metric-chart-label">{metric} vs Video</p>
        <ChartContent data={data} metric={metric} height={280} fontSize={{ x: 10, y: 11 }} />
        <p className="metric-chart-hint">Click to enlarge</p>
      </div>

      {enlarged &&
        createPortal(
          <div className="metric-chart-overlay" onClick={() => setEnlarged(false)}>
            <div className="metric-chart-modal" onClick={(e) => e.stopPropagation()}>
              <button className="metric-chart-download" onClick={handleDownload}>
                Download PNG
              </button>
              <button className="metric-chart-close" onClick={() => setEnlarged(false)}>
                ×
              </button>
              <p className="metric-chart-label" style={{ marginTop: '0.5rem' }}>
                {metric} vs Video
              </p>
              <div ref={modalChartRef}>
                <ChartContent
                  data={data}
                  metric={metric}
                  height={500}
                  fontSize={{ x: 12, y: 13 }}
                />
              </div>
            </div>
          </div>,
          document.body
        )}
    </>
  );
}
