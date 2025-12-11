import { type ClassValue, clsx } from "clsx"
import { twMerge } from "tailwind-merge"

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

// Generate a cute app name similar to the original Dyad app
const adjectives = [
  'Happy', 'Sunny', 'Clever', 'Swift', 'Bright', 'Cool', 'Smart',
  'Quick', 'Mighty', 'Noble', 'Brave', 'Gentle', 'Kind', 'Wise'
];

const nouns = [
  'Panda', 'Tiger', 'Eagle', 'Dolphin', 'Fox', 'Owl', 'Bear',
  'Wolf', 'Lion', 'Hawk', 'Penguin', 'Rabbit', 'Deer', 'Falcon'
];

export function generateCuteAppName(): string {
  const adj = adjectives[Math.floor(Math.random() * adjectives.length)];
  const noun = nouns[Math.floor(Math.random() * nouns.length)];
  return `${adj} ${noun}`;
}
