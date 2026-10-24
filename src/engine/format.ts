// Swedish number/weight formatting, implemented by hand (no Intl locale data needed – Deno safe).
import type { Unit } from './types.ts';

export const KG_PER_LB = 0.45359237;

/**
 * Format a number the Swedish way: decimal comma, trailing zeros trimmed,
 * at most `maxDecimals` decimals. Integer parts ≥ 10 000 are grouped with a space
 * ("12 450"). Four-digit numbers are left ungrouped ("1250").
 */
export function formatNumber(value: number, maxDecimals = 2): string {
  if (!Number.isFinite(value)) return '–';
  const factor = 10 ** maxDecimals;
  let rounded = Math.round(Math.abs(value) * factor) / factor;
  if (rounded === 0) rounded = 0;
  const negative = value < 0 && rounded !== 0;
  const fixed = rounded.toFixed(maxDecimals);
  let [intPart, decPart = ''] = fixed.split('.');
  decPart = decPart.replace(/0+$/, '');
  if (intPart.length > 4) {
    intPart = intPart.replace(/\B(?=(\d{3})+(?!\d))/g, ' ');
  }
  return (negative ? '-' : '') + intPart + (decPart ? ',' + decPart : '');
}

export function kgToUnit(kg: number, unit: Unit): number {
  return unit === 'lb' ? kg / KG_PER_LB : kg;
}

export function unitToKg(value: number, unit: Unit): number {
  return unit === 'lb' ? value * KG_PER_LB : value;
}

/** Swedish formatting: 82.5 -> "82,5 kg"; converts to lb (rounded to 0,1) when unit = 'lb'. */
export function formatWeight(kg: number, unit: Unit, opts?: { withUnit?: boolean }): string {
  const value = kgToUnit(kg, unit);
  const text = formatNumber(value, unit === 'lb' ? 1 : 2);
  return opts?.withUnit === false ? text : `${text} ${unit}`;
}

/** "3 × 12" when all reps are equal, otherwise "12/11/10". */
export function formatReps(reps: number[]): string {
  if (reps.length === 0) return '0';
  if (reps.every((r) => r === reps[0])) return `${reps.length} × ${reps[0]}`;
  return reps.join('/');
}
