'use client';

import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Legend,
  Line,
  LineChart,
  PolarAngleAxis,
  PolarGrid,
  Radar,
  RadarChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';

const PRIMARY = '#6366f1';
const SECOND = '#f59e0b';
const tooltipStyle = {
  contentStyle: { background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 8, color: 'var(--text)' },
  labelStyle: { color: 'var(--text)', fontWeight: 600 },
};
const axis = { stroke: 'var(--muted)', fontSize: 12, tickLine: false };

function scoreColor(p) {
  if (p >= 75) return '#10b981';
  if (p >= 40) return PRIMARY;
  return '#ef4444';
}

function truncate(s, n = 16) {
  return s && s.length > n ? `${s.slice(0, n - 1)}…` : s;
}

export function DistributionChart({ data }) {
  return (
    <div className="chart-box">
      <ResponsiveContainer>
        <BarChart data={data} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" vertical={false} />
          <XAxis dataKey="range" {...axis} />
          <YAxis allowDecimals={false} {...axis} />
          <Tooltip {...tooltipStyle} formatter={(v) => [v, 'Submissions']} labelFormatter={(l) => `Score ${l}%`} />
          <Bar dataKey="count" radius={[6, 6, 0, 0]}>
            {data.map((d, i) => (
              <Cell key={d.range} fill={['#ef4444', '#f97316', '#eab308', '#6366f1', '#10b981'][i] || PRIMARY} />
            ))}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

export function PercentBarChart({ data, labelKey, valueKey = 'percent', height = 280, horizontal = false }) {
  const rows = data.map((d) => ({ ...d, _label: truncate(String(d[labelKey]), horizontal ? 22 : 14) }));
  return (
    <div className="chart-box" style={{ height }}>
      <ResponsiveContainer>
        <BarChart data={rows} layout={horizontal ? 'vertical' : 'horizontal'} margin={{ top: 10, right: 16, left: horizontal ? 10 : -20, bottom: 0 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" horizontal={!horizontal} vertical={horizontal} />
          {horizontal ? (
            <>
              <XAxis type="number" domain={[0, 100]} {...axis} unit="%" />
              <YAxis type="category" dataKey="_label" width={130} {...axis} />
            </>
          ) : (
            <>
              <XAxis dataKey="_label" {...axis} interval={0} />
              <YAxis domain={[0, 100]} {...axis} unit="%" />
            </>
          )}
          <Tooltip {...tooltipStyle} formatter={(v) => [`${v}%`, 'Score']} labelFormatter={(_, p) => p?.[0]?.payload?.[labelKey] ?? ''} />
          <Bar dataKey={valueKey} radius={horizontal ? [0, 6, 6, 0] : [6, 6, 0, 0]} maxBarSize={44}>
            {rows.map((d, i) => (
              <Cell key={i} fill={scoreColor(d[valueKey])} />
            ))}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

export function TrendChart({ data }) {
  const rows = data.map((d, i) => ({ ...d, _label: `${i + 1}. ${truncate(d.title, 12)}` }));
  return (
    <div className="chart-box">
      <ResponsiveContainer>
        <LineChart data={rows} margin={{ top: 10, right: 16, left: -20, bottom: 0 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" vertical={false} />
          <XAxis dataKey="_label" {...axis} />
          <YAxis domain={[0, 100]} {...axis} unit="%" />
          <Tooltip {...tooltipStyle} labelFormatter={(_, p) => p?.[0]?.payload?.title ?? ''} formatter={(v, n) => [`${v}%`, n]} />
          <Legend wrapperStyle={{ fontSize: 12 }} />
          <Line type="monotone" dataKey="percent" name="Your score" stroke={PRIMARY} strokeWidth={3} dot={{ r: 5 }} />
          <Line type="monotone" dataKey="classAverage" name="Class average" stroke={SECOND} strokeWidth={2} strokeDasharray="5 5" dot={{ r: 3 }} />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}

export function SkillsRadar({ data, labelKey = 'label' }) {
  if (!data || data.length < 3) return <PercentBarChart data={data || []} labelKey={labelKey} />;
  return (
    <div className="chart-box">
      <ResponsiveContainer>
        <RadarChart data={data} outerRadius="70%">
          <PolarGrid stroke="var(--border)" />
          <PolarAngleAxis dataKey={labelKey} tick={{ fill: 'var(--muted)', fontSize: 12 }} />
          <Radar dataKey="percent" stroke={PRIMARY} fill={PRIMARY} fillOpacity={0.35} />
          <Tooltip {...tooltipStyle} formatter={(v) => [`${v}%`, 'Score']} />
        </RadarChart>
      </ResponsiveContainer>
    </div>
  );
}
