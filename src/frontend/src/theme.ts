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
  }
  interface PaletteOptions {
    surfaceSubtle?: string;
    borderSubtle?: string;
    mutedText?: string;
    brandTintBg?: string;
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
            paper: '#17281E',
          },
          text: {
            primary: '#E8EEF4',
            secondary: '#9FAAB6',
          },
          divider: '#2C3B31',
          surfaceSubtle: '#20342A',
          borderSubtle: '#2C3B31',
          mutedText: '#6E7A84',
          brandTintBg: 'rgba(79,179,124,0.16)',
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
        styleOverrides: {
          html: {
            overflowY: 'scroll',
            scrollbarGutter: 'stable',
          },
        },
      },
      MuiCard: {
        styleOverrides: {
          root: {
            borderRadius: 12,
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
