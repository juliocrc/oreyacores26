import { createTheme } from '@mui/material/styles';
import { APP_CONFIG } from './lib/app-config';

export type AppThemeName = 'azores' | 'noturno' | 'escuro' | 'vermelho' | 'oceano' | 'deluxe';

export const DEFAULT_APP_THEME: AppThemeName = (APP_CONFIG?.theme as AppThemeName) || 'escuro';

type ThemePreset = {
  label: string;
  mode: 'light' | 'dark';
  primaryMain: string;
  primaryDark: string;
  primaryLight: string;
  secondaryMain: string;
  backgroundDefault: string;
  backgroundPaper: string;
  textPrimary: string;
  textSecondary: string;
};

const THEME_PRESETS: Record<AppThemeName, ThemePreset> = {
  azores: {
    label: 'Azores (padrão)',
    mode: 'light',
    primaryMain: '#7c3aed',
    primaryDark: '#4c1d95',
    primaryLight: '#ede9fe',
    secondaryMain: '#ec4899',
    backgroundDefault: '#f6f7ff',
    backgroundPaper: '#ffffff',
    textPrimary: '#111827',
    textSecondary: '#374151',
  },
  noturno: {
    label: 'Noturno',
    mode: 'light',
    primaryMain: '#0f172a',
    primaryDark: '#020617',
    primaryLight: '#dbeafe',
    secondaryMain: '#8b5cf6',
    backgroundDefault: '#f5f7ff',
    backgroundPaper: '#ffffff',
    textPrimary: '#111827',
    textSecondary: '#334155',
  },
  escuro: {
    label: 'Escuro',
    mode: 'light',
    primaryMain: '#334155',
    primaryDark: '#0f172a',
    primaryLight: '#e2e8f0',
    secondaryMain: '#c026d3',
    backgroundDefault: '#f8fafc',
    backgroundPaper: '#ffffff',
    textPrimary: '#111827',
    textSecondary: '#374151',
  },
  vermelho: {
    label: 'Vermelho',
    mode: 'light',
    primaryMain: '#b91c1c',
    primaryDark: '#7f1d1d',
    primaryLight: '#fee2e2',
    secondaryMain: '#ea580c',
    backgroundDefault: '#fff7f7',
    backgroundPaper: '#ffffff',
    textPrimary: '#3f0f0f',
    textSecondary: '#7f1d1d',
  },
  oceano: {
    label: 'Oceano',
    mode: 'light',
    primaryMain: '#0369a1',
    primaryDark: '#075985',
    primaryLight: '#bae6fd',
    secondaryMain: '#0e7490',
    backgroundDefault: '#f0f9ff',
    backgroundPaper: '#ffffff',
    textPrimary: '#082f49',
    textSecondary: '#155e75',
  },
  deluxe: {
    label: 'Deluxe (Premium)',
    mode: 'dark',
    primaryMain: '#d4af37',
    primaryDark: '#aa8417',
    primaryLight: '#fde047',
    secondaryMain: '#c5a059',
    backgroundDefault: '#0b0f19',
    backgroundPaper: '#0f172a',
    textPrimary: '#ffffff',
    textSecondary: '#9ca3af',
  },
};

export const APP_THEME_OPTIONS = (Object.entries(THEME_PRESETS) as Array<[AppThemeName, ThemePreset]>).map(([value, preset]) => ({
  value,
  label: preset.label,
}));

export function createAppTheme(themeName: AppThemeName) {
  const preset = THEME_PRESETS[themeName] || THEME_PRESETS[DEFAULT_APP_THEME];
  const darkMode = preset.mode === 'dark';

  return createTheme({
    palette: {
      mode: preset.mode,
      primary: {
        main: preset.primaryMain,
        dark: preset.primaryDark,
        light: preset.primaryLight,
      },
      secondary: {
        main: preset.secondaryMain,
      },
      background: {
        default: preset.backgroundDefault,
        paper: preset.backgroundPaper,
      },
      text: {
        primary: preset.textPrimary,
        secondary: preset.textSecondary,
      },
    },
    typography: {
      fontFamily: 'Inter, Arial, Helvetica, sans-serif',
      fontSize: 16,
      h1: {
        fontSize: 'clamp(2rem, 1.6rem + 1.2vw, 3rem)',
        fontWeight: 800,
        letterSpacing: '-0.02em',
        color: preset.textPrimary,
        textShadow: darkMode ? '0 1px 10px rgba(15, 23, 42, 0.25)' : 'none',
      },
      h2: {
        fontSize: 'clamp(1.55rem, 1.3rem + 0.8vw, 2.25rem)',
        fontWeight: 800,
        color: preset.textPrimary,
        textShadow: darkMode ? '0 1px 8px rgba(15, 23, 42, 0.2)' : 'none',
      },
      h3: {
        fontSize: 'clamp(1.25rem, 1.1rem + 0.45vw, 1.7rem)',
        fontWeight: 700,
        color: preset.textPrimary,
        textShadow: darkMode ? '0 1px 6px rgba(15, 23, 42, 0.18)' : 'none',
      },
      h4: {
        fontWeight: 700,
        color: preset.textPrimary,
      },
      body1: {
        fontSize: '1rem',
        lineHeight: 1.7,
        color: preset.textPrimary,
        textShadow: 'none',
      },
      body2: {
        fontSize: '0.95rem',
        lineHeight: 1.65,
        color: preset.textSecondary,
        textShadow: 'none',
      },
      button: {
        fontSize: '0.96rem',
        fontWeight: 700,
        letterSpacing: '0.01em',
        textTransform: 'none',
      },
    },
    components: {
      MuiCssBaseline: {
        styleOverrides: {
          body: {
            textRendering: 'optimizeLegibility',
            WebkitFontSmoothing: 'antialiased',
            MozOsxFontSmoothing: 'grayscale',
            backgroundImage: darkMode
              ? 'linear-gradient(180deg, #0f172a 0%, #111827 48%, #0b1120 100%)'
              : 'radial-gradient(circle at top left, rgba(236,72,153,0.12) 0%, transparent 28%), radial-gradient(circle at top right, rgba(34,211,238,0.18) 0%, transparent 32%), linear-gradient(180deg, #f8f7ff 0%, #eef4ff 54%, #f8fbff 100%)',
          },
        },
      },
      MuiAppBar: {
        styleOverrides: {
          root: {
            boxShadow: themeName === 'deluxe'
              ? '0 4px 20px rgba(0, 0, 0, 0.4), inset 0 -1px 0 rgba(255, 255, 255, 0.05)'
              : (darkMode ? '0 18px 40px rgba(2, 6, 23, 0.52)' : '0 20px 44px rgba(124, 58, 237, 0.24)'),
            backdropFilter: 'blur(16px)',
            borderBottom: themeName === 'deluxe' ? '1px solid rgba(212, 175, 55, 0.15)' : 'none',
          },
        },
      },
      MuiToolbar: {
        styleOverrides: {
          root: {
            minHeight: 64,
          },
        },
      },
      MuiButton: {
        styleOverrides: {
          root: {
            borderRadius: themeName === 'deluxe' ? 10 : 12,
            paddingInline: 16,
            paddingBlock: 8,
            minHeight: 40,
            transition: 'background-color 160ms ease, box-shadow 160ms ease, transform 160ms ease',
            boxShadow: themeName === 'deluxe'
              ? '0 2px 8px rgba(212, 175, 55, 0.12)'
              : (darkMode ? '0 4px 12px rgba(2, 6, 23, 0.2)' : '0 4px 12px rgba(15, 23, 42, 0.08)'),
            border: themeName === 'deluxe'
              ? '1px solid rgba(212, 175, 55, 0.3)'
              : (darkMode ? '1px solid rgba(148,163,184,0.14)' : '1px solid rgba(124,58,237,0.08)'),
            '&:hover': {
              boxShadow: themeName === 'deluxe'
                ? '0 4px 12px rgba(212, 175, 55, 0.18)'
                : '0 6px 16px rgba(15, 23, 42, 0.12)',
            },
          },
        },
      },
      MuiPaper: {
        styleOverrides: {
          root: {
            boxShadow: themeName === 'deluxe'
              ? '0 12px 40px rgba(0, 0, 0, 0.5)'
              : (darkMode ? '0 18px 38px rgba(2, 6, 23, 0.46)' : '0 18px 38px rgba(76, 29, 149, 0.1)'),
            backgroundImage: themeName === 'deluxe'
              ? 'linear-gradient(180deg, rgba(15, 23, 42, 0.75) 0%, rgba(11, 15, 25, 0.85) 100%)'
              : (darkMode
                ? 'linear-gradient(180deg, rgba(17,24,39,0.98) 0%, rgba(15,23,42,0.98) 100%)'
                : 'linear-gradient(180deg, rgba(255,255,255,1) 0%, rgba(250,250,255,1) 100%)'),
            backdropFilter: themeName === 'deluxe' ? 'blur(16px)' : undefined,
          },
        },
      },
      MuiDrawer: {
        styleOverrides: {
          paper: {
            backgroundImage: darkMode
              ? 'linear-gradient(180deg, #0f172a 0%, #111827 100%)'
              : 'linear-gradient(180deg, #ffffff 0%, #f8fbff 100%)',
            color: preset.textPrimary,
          },
        },
      },
      MuiListItemText: {
        styleOverrides: {
          primary: {
            color: preset.textPrimary,
          },
        },
      },
      MuiOutlinedInput: {
        styleOverrides: {
          root: {
            borderRadius: themeName === 'deluxe' ? 12 : 16,
            backgroundColor: themeName === 'deluxe' ? 'rgba(15,23,42,0.6)' : (darkMode ? '#111827' : 'rgba(255,255,255,0.94)'),
            boxShadow: themeName === 'deluxe'
              ? 'inset 0 1px 1px rgba(0,0,0,0.2)'
              : (darkMode ? 'inset 0 1px 0 rgba(255,255,255,0.03)' : '0 10px 20px rgba(15,23,42,0.05)'),
            border: themeName === 'deluxe' ? '1px solid rgba(212, 175, 55, 0.15)' : undefined,
            backdropFilter: themeName === 'deluxe' ? 'blur(8px)' : undefined,
          },
          input: {
            fontSize: '1rem',
            color: preset.textPrimary,
            fontWeight: 600,
          },
        },
      },
      MuiCard: {
        styleOverrides: {
          root: {
            borderRadius: themeName === 'deluxe' ? 16 : 18,
            overflow: 'hidden',
            border: themeName === 'deluxe'
              ? '1px solid rgba(212, 175, 55, 0.15)'
              : (darkMode ? '1px solid rgba(148,163,184,0.08)' : '1px solid rgba(124,58,237,0.08)'),
            boxShadow: themeName === 'deluxe'
              ? '0 12px 40px -10px rgba(0, 0, 0, 0.5)'
              : (darkMode ? '0 10px 24px rgba(2,6,23,0.28)' : '0 10px 24px rgba(15,23,42,0.08)'),
            backgroundImage: themeName === 'deluxe'
              ? 'linear-gradient(180deg, rgba(15, 23, 42, 0.75) 0%, rgba(11, 15, 25, 0.85) 100%)'
              : undefined,
            backdropFilter: themeName === 'deluxe' ? 'blur(16px)' : undefined,
          },
        },
      },
      MuiInputBase: {
        styleOverrides: {
          input: {
            color: preset.textPrimary,
          },
        },
      },
      MuiMenuItem: {
        styleOverrides: {
          root: {
            fontSize: '0.97rem',
            color: preset.textPrimary,
          },
        },
      },
      MuiTypography: {
        styleOverrides: {
          root: {
            color: 'inherit',
          },
        },
      },
      MuiTableCell: {
        styleOverrides: {
          head: {
            fontWeight: 800,
            color: preset.textPrimary,
          },
          body: {
            color: preset.textSecondary,
          },
        },
      },
    },
  });
}

const theme = createAppTheme(DEFAULT_APP_THEME);

export default theme;
