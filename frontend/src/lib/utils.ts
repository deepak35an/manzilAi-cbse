import { clsx, type ClassValue } from 'clsx'
import { twMerge } from 'tailwind-merge'

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

export function formatDate(dateStr: string): string {
  return new Date(dateStr).toLocaleDateString('en-IN', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  })
}

export function formatDateTime(dateStr: string): string {
  return new Date(dateStr).toLocaleString('en-IN', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  })
}

export function formatScore(score: number, max: number): string {
  return `${score.toFixed(1)}/${max.toFixed(0)}`
}

export function formatPercentage(value: number): string {
  return `${(value * 100).toFixed(1)}%`
}

export function generateId(): string {
  return Math.random().toString(36).substring(2, 15)
}
