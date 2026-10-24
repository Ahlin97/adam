// Shared recharts styling for the dark theme (matches tokens in index.css).
import type { CSSProperties } from 'react';

export const CHART = {
  series: '#3b82f6', // accent
  grid: '#333333',
  axis: '#a3a3a3',
  surface: '#161616',
  fg: '#f5f5f5',
};

export const axisTick = { fill: CHART.axis, fontSize: 12 };

export const tooltipProps = {
  contentStyle: {
    background: '#222222',
    border: `1px solid ${CHART.grid}`,
    borderRadius: 12,
    color: CHART.fg,
  } satisfies CSSProperties,
  labelStyle: { color: CHART.axis } satisfies CSSProperties,
  itemStyle: { color: CHART.fg } satisfies CSSProperties,
  cursor: { stroke: CHART.axis, strokeWidth: 1, fill: 'rgba(255,255,255,0.06)' },
};
