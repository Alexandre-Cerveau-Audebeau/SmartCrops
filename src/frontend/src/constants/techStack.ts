/**
 * SMA-36: single source of truth for the project's core technology stack.
 * Consumed by Home ("Built with modern tools" current stack) and About
 * ("Built with modern tools" chips). Home appends a few more current-stack
 * entries after these; About renders just the names.
 */
export const TECH_STACK = [
  { name: 'React', logo: '/images/tech/react.svg', role: 'Frontend UI' },
  {
    name: 'TypeScript',
    logo: '/images/tech/typescript.svg',
    role: 'Type Safety',
  },
  { name: 'Vite', logo: '/images/tech/vite.svg', role: 'Build Tool' },
  { name: '.NET 8', logo: '/images/tech/dotnet.svg', role: 'Backend API' },
  { name: 'PostgreSQL', logo: '/images/tech/postgresql.svg', role: 'Database' },
  { name: 'Docker', logo: '/images/tech/docker.svg', role: 'Containers' },
] as const;

/** Shape of a single tech-stack entry, derived from the constant (single source). */
export type TechStackEntry = (typeof TECH_STACK)[number];
