// Shared recharts styling for the dark theme (matches tokens in index.css).
import type { CSSProperties } from 'react';

export const CHART = {
  series: '#d4ff3a', // accent
  grid: '#272b33',
  axis: '#959cab',
  surface: '#121418',
  fg: '#f5f6f8',
};

export const axisTick = { fill: CHART.axis, fontSize: 12 };

export const tooltipProps = {
  contentStyle: {
    background: '#1b1e24',
    border: `1px solid ${CHART.grid}`,
    borderRadius: 14,
    color: CHART.fg,
  } satisfies CSSProperties,
  labelStyle: { color: CHART.axis } satisfies CSSProperties,
  itemStyle: { color: CHART.fg } satisfies CSSProperties,
  cursor: { stroke: CHART.axis, strokeWidth: 1, fill: 'rgba(255,255,255,0.06)' },
};
