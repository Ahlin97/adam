// Unit helpers for the stats/settings UI. Prefer the engine implementation but fall back to a
// local one so pages never crash if the engine throws.
import { formatWeight, kgToUnit, unitToKg, type Unit } from '@/engine';

const LB = 0.45359237;
const num1 = new Intl.NumberFormat('sv-SE', { maximumFractionDigits: 1 });
const num2 = new Intl.NumberFormat('sv-SE', { maximumFractionDigits: 2 });

export function toUnit(kg: number, unit: Unit): number {
  try {
    return kgToUnit(kg, unit);
  } catch {
    return unit === 'lb' ? kg / LB : kg;
  }
}

export function fromUnit(value: number, unit: Unit): number {
  try {
    return unitToKg(value, unit);
  } catch {
    return unit === 'lb' ? value * LB : value;
  }
}

/** "82,5 kg" (or without unit). */
export function fmtWeight(kg: number, unit: Unit, withUnit = true): string {
  try {
    return formatWeight(kg, unit, { withUnit });
  } catch {
    const s = num2.format(Math.round(toUnit(kg, unit) * 100) / 100);
    return withUnit ? `${s} ${unit}` : s;
  }
}

/** Large values like volume: "12 340 kg". */
export function fmtBig(kg: number, unit: Unit, withUnit = true): string {
  const s = new Intl.NumberFormat('sv-SE', { maximumFractionDigits: 0 }).format(toUnit(kg, unit));
  return withUnit ? `${s} ${unit}` : s;
}

/** Swedish decimal comma, 1 decimal: 7.5 → "7,5". */
export const fmtNum = (n: number) => num1.format(n);

/** Parse user input accepting both "82,5" and "82.5". NaN if invalid. */
export function parseNum(s: string): number {
  const t = s.trim().replace(/\s/g, '').replace(',', '.');
  if (!t) return NaN;
  return /^-?\d*\.?\d+$/.test(t) ? Number(t) : NaN;
}
