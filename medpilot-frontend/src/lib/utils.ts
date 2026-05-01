import { clsx, type ClassValue } from 'clsx'
import { twMerge } from 'tailwind-merge'

/** Merge Tailwind classes safely */
export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

/** Format a Date to HH:MM:SS */
export function formatTime(date: Date): string {
  return date.toLocaleTimeString('en-IN', {
    hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false,
  })
}

/** Clamp a number between min and max */
export function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max)
}

/** Random float between min and max */
export function randomBetween(min: number, max: number): number {
  return Math.random() * (max - min) + min
}

/** Fluctuate a value by ±delta */
export function fluctuate(value: number, delta: number, min?: number, max?: number): number {
  const next = value + (Math.random() * delta * 2 - delta)
  if (min !== undefined && max !== undefined) return clamp(next, min, max)
  return parseFloat(next.toFixed(1))
}

/** Generate a unique ID */
export function uid(): string {
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`
}
