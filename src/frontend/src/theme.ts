import { createTheme, type Theme } from '@mui/material/styles';

// Custom semantic palette tokens (SMA-184). These back the design-system
// neutrals the components will migrate onto so light/dark both resolve from the
// theme rather than hardcoded hexes.
declare module '@mui/material/styles' {
  interface Palette {
    surfaceSubtle: string;
    borderSubtle: string;
    mutedText: string;
    brandTintBg: string;
    heading: string;
    eyebrow: string;
  }
  interface PaletteOptions {
    surfaceSubtle?: string;
    borderSubtle?: string;
    mutedText?: string;
    brandTintBg?: string;
    heading?: string;
    eyebrow?: string;
  }
}

/**
 * Theme factory (SMA-184). `light` is the historical palette, byte-for-byte
 * unchanged so the app is visually identical until components are tokenized;
 * `dark` is a logo-anchored night-blue canvas with dark-green cards and
 * lightened green/blue accents. Mode-agnostic `components` overrides (scrollbar
 * gutter, card/paper/button radius) are shared.
 */
export function createAppTheme(mode: 'light' | 'dark'): Theme {
  const isDark = mode === 'dark';
  return createTheme({
    palette: isDark
      ? {
          mode: 'dark',
          primary: {
            main: '#4FB37C',
            dark: '#2E8B57',
            light: '#7ED3A3',
            contrastText: '#0D1E34',
          },
          secondary: {
            main: '#6E8AC8',
            contrastText: '#0D1E34',
          },
          background: {
            default: '#0D1E34',
            paper: '#16294A',
          },
          text: {
            primary: '#E8EEF4',
            secondary: '#9FAAB6',
          },
          divider: '#27374F',
          surfaceSubtle: '#1E3358',
          borderSubtle: 'rgba(79,179,124,0.45)',
          mutedText: '#6E7A84',
          brandTintBg: 'rgba(79,179,124,0.16)',
          heading: '#4FB37C',
          eyebrow: '#CF8A63',
        }
      : {
          mode: 'light',
          primary: {
            main: '#2E8B57',
            dark: '#1B5E3A',
            light: '#4CAF78',
            contrastText: '#ffffff',
          },
          secondary: {
            main: '#2C3E6B',
            contrastText: '#ffffff',
          },
          background: {
            default: '#FAFDF7',
            paper: '#ffffff',
          },
          surfaceSubtle: '#F2F6F0',
          borderSubtle: '#E2EADF',
          mutedText: '#b0bbb2',
          brandTintBg: '#EAF5EE',
          heading: '#1B5E3A',
          eyebrow: '#A0522D',
        },
    typography: {
      fontFamily: [
        'Inter',
        '-apple-system',
        'BlinkMacSystemFont',
        '"Segoe UI"',
        'Roboto',
        'sans-serif',
      ].join(','),
    },
    shape: {
      borderRadius: 8,
    },
    components: {
      MuiCssBaseline: {
        styleOverrides: (theme) => ({
          // A permanent scrollbar + reserved gutter keep the viewport width
          // constant. The no-overlay-shift fix lives per-overlay now
          // (disableScrollLock on the menus/dialog, mirroring the profile menu),
          // so there is no body padding-right reset here (SMA-216).
          html: { overflowY: 'scroll', scrollbarGutter: 'stable' },
          // Global thin theme-aware scrollbar (borderSubtle thumb on a
          // transparent track), generalised from the TOC (SMA-184 → SMA-216).
          '*': {
            scrollbarWidth: 'thin',
            scrollbarColor: `${theme.palette.borderSubtle} transparent`,
          },
          '*::-webkit-scrollbar': { width: '8px', height: '8px' },
          '*::-webkit-scrollbar-track': { backgroundColor: 'transparent' },
          '*::-webkit-scrollbar-thumb': {
            backgroundColor: theme.palette.borderSubtle,
            borderRadius: '8px',
          },
          '*::-webkit-scrollbar-thumb:hover': {
            backgroundColor: theme.palette.divider,
          },
          // Hide the webkit up/down (and left/right) stepper buttons so the
          // thumb track stays clean inside rounded frames (SMA-216).
          '*::-webkit-scrollbar-button': { display: 'none' },
        }),
      },
      MuiCard: {
        styleOverrides: {
          root: {
            borderRadius: 12,
            // Dark only: a soft-green border so navy cards lift off the navy
            // canvas. Light adds no border (visually unchanged).
            ...(isDark && {
              border: '1px solid',
              borderColor: 'rgba(79,179,124,0.45)',
            }),
          },
        },
      },
      MuiPaper: {
        styleOverrides: {
          rounded: {
            borderRadius: 12,
          },
        },
      },
      MuiButton: {
        styleOverrides: {
          root: {
            borderRadius: 8,
            textTransform: 'none',
            fontWeight: 600,
          },
        },
      },
    },
  });
}

// Default export kept (light) so any module importing the singleton theme still
// works without change.
const theme = createAppTheme('light');
export default theme;
