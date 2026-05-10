/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    "./app/**/*.{js,jsx,ts,tsx}",
    "./components/**/*.{js,jsx,ts,tsx}",
    "./lib/**/*.{js,jsx,ts,tsx}",
  ],
  // ── Safelist — dynamic classes composed at runtime ────────────────────────
  // STATUS_COLORS in lib/marketplace-status.ts composes twBg/twText dynamically.
  // These must be safelisted so PurgeCSS keeps them even when not seen literally in JSX.
  safelist: [
    // MarketplaceStatus badge backgrounds
    'bg-amber-500/10',
    'bg-green-800/10',
    'bg-indigo-500/10',
    'bg-blue-600/10',
    'bg-red-500/10',
    'bg-slate-400/10',
    // MarketplaceStatus badge text colors
    'text-amber-600',
    'text-green-800',
    'text-indigo-600',
    'text-blue-600',
    'text-red-600',
    'text-slate-500',
  ],
  presets: [require("nativewind/preset")],
  theme: {
    extend: {
      fontFamily: {
        // All 10 Euclid Circular A variants
        sans: ["EuclidCircularA-Regular"],
        light: ["EuclidCircularA-Light"],
        medium: ["EuclidCircularA-Medium"],
        semibold: ["EuclidCircularA-SemiBold"],
        bold: ["EuclidCircularA-Bold"],
        "light-italic": ["EuclidCircularA-LightItalic"],
        italic: ["EuclidCircularA-Italic"],
        "medium-italic": ["EuclidCircularA-MediumItalic"],
        "semibold-italic": ["EuclidCircularA-SemiBoldItalic"],
        "bold-italic": ["EuclidCircularA-BoldItalic"],
      },
      colors: {
        // LinkedIn Blue palette
        primary: {
          50: '#f0f7ff',
          100: '#e0efff',
          200: '#b9dfff',
          300: '#7cc4ff',
          400: '#36a5ff',
          500: '#0a85f4',
          600: '#0a66c2',
          700: '#0b5394',
          800: '#0f457a',
          900: '#133c65',
          950: '#0c2544',
        },
        // Light theme grays
        dark: {
          50: '#ffffff',
          100: '#f8fafc',
          200: '#f1f5f9',
          300: '#e2e8f0',
          400: '#94a3b8',
          500: '#64748b',
          600: '#475569',
          700: '#334155',
          800: '#f3f2ef',
          900: '#ffffff',
          950: '#f8fafc',
        },
        accent: {
          gold: '#d4af37',
          cream: '#f5f5dc',
        },

        // ── Brand ──
        brand: {
          primary:           '#0A66C2',
          'primary-light':   '#0A85F4',
          indigo:            '#6366F1',
          navy:              '#05305C',
          'gradient-start':  '#4481EB',
          'gradient-end':    '#0A66C2',   // FIXED from '#040EFD'
          'primary-muted':   '#E8F3FF',
          black:             '#1A1A1A',
          white:             '#FFFFFF',
        },

        // ── Semantic UI (light mode) ──
        'text-primary':    '#191919',
        'text-secondary':  '#65676B',
        'text-tertiary':   '#999999',

        // Backgrounds
        'bg-app':          '#F0F4F8',
        'bg-secondary':    '#F4F5F7',
        'bg-input':        '#F8FAFF',
        'bg-card':         'rgba(255,255,255,0.8)',

        // Borders
        'border-input':    '#E1E8F0',
        'border-card':     'rgba(255,255,255,0.5)',
        'border-glass':    'rgba(255,255,255,0.6)',
        'border-glass-heavy': 'rgba(255,255,255,0.7)',
        'border-subtle':   'rgba(0,0,0,0.06)',

        // State
        success:           '#2E7D32',
        'success-muted':   '#E8F5E9',
        error:             '#E53935',
        'error-muted':     '#FDECEC',
        separator:         '#E8E8E8',

        // Badge colors
        'badge-discount':  '#B51F29',
        'badge-new':       '#36A852',
        'badge-popular':   '#F59E0B',
        'badge-limited':   '#E53935',
        'badge-primary':   '#0A66C2',

        // Glass / glassmorphism surfaces
        'glass-light':     'rgba(255,255,255,0.5)',
        'glass-card':      'rgba(255,255,255,0.5)',
        'glass-bar':       'rgba(245,247,250,0.92)',
        'glass-sheet':     'rgba(245,247,250,0.88)',
        'glass-search':    'rgba(255,255,255,0.6)',
        'glass-border':    'rgba(255,255,255,0.6)',
        'glass-border-heavy': 'rgba(255,255,255,0.7)',

        // Overlay/backdrop
        'overlay-black':   'rgba(0,0,0,0.45)',
        'overlay-white':   'rgba(255,255,255,0.75)',

        // Cart UI specific
        'cart-qty-bg':     'rgba(10,102,194,0.06)',
        'stepper-btn':     'rgba(255,255,255,0.9)',

        // XP / Gamification gold palette
        'xp-gold':         '#FFB300',
        'xp-gold-dark':    '#FF8F00',
        'xp-gold-light':   '#FFD54F',
        'xp-amber':        '#F57C00',
        'xp-badge-bg':     '#FFF8E1',
        'xp-badge-bg-alt': '#FFFDF5',
        'xp-track':        'rgba(0,0,0,0.06)',

        // Category tints (barber-store.ro home grid)
        'tint-aparatura':  '#E5E7EB',
        'tint-foarfeci':   '#F3D5D8',
        'tint-piepteni':   '#E0E2E8',
        'tint-par':        '#E8DDC8',
        'tint-corp':       '#DDE8DD',
        'tint-barba':      '#3D2820',
        'tint-igiena':     '#D7E3EE',

        // Savings / green semantic
        'savings-bg':      'rgba(46,125,50,0.08)',
        'savings-banner':  'rgba(46,125,50,0.12)',
        'savings-green':   '#2E7D32',

        // Level up modal dark overlay
        'level-overlay':   'rgba(5,5,15,0.95)',
      },
      borderRadius: {
        'r-xs':  6,
        'r-sm':  8,
        'r-md':  12,
        'r-lg':  16,
        'r-xl':  20,
        'r-2xl': 30,
      },
      fontSize: {
        '7':  ['7px',  { lineHeight: '10px' }],
        '8':  ['8px',  { lineHeight: '12px' }],
        '9':  ['9px',  { lineHeight: '13px' }],
        '10': ['10px', { lineHeight: '14px' }],
        '11': ['11px', { lineHeight: '15px' }],
      },
    },
  },
  plugins: [
    // ── Bubble asymmetric radii ──────────────────────────────
    // These cannot be expressed as a single standard Tailwind class because
    // they require per-corner overrides (top-right is pinched at 12px/8px/14px
    // while the other three corners are rounded).
    function({ addUtilities }) {
      addUtilities({
        // Default Bubble (cards, buttons, chips)
        '.rounded-bubble': {
          borderTopLeftRadius: '25px',
          borderTopRightRadius: '12px',
          borderBottomRightRadius: '25px',
          borderBottomLeftRadius: '25px',
        },
        // Small Bubble (icon buttons, compact chips)
        '.rounded-bubble-sm': {
          borderTopLeftRadius: '18px',
          borderTopRightRadius: '8px',
          borderBottomRightRadius: '18px',
          borderBottomLeftRadius: '18px',
        },
        // Large Bubble (modals, sheets)
        '.rounded-bubble-lg': {
          borderTopLeftRadius: '30px',
          borderTopRightRadius: '14px',
          borderBottomRightRadius: '30px',
          borderBottomLeftRadius: '30px',
        },
        // Sheet Bubble (bottom sheets — open bottom)
        '.rounded-bubble-sheet': {
          borderTopLeftRadius: '30px',
          borderTopRightRadius: '14px',
          borderBottomRightRadius: '0px',
          borderBottomLeftRadius: '0px',
        },
        // Floating (uniform, modal-style)
        '.rounded-bubble-float': {
          borderTopLeftRadius: '24px',
          borderTopRightRadius: '24px',
          borderBottomRightRadius: '24px',
          borderBottomLeftRadius: '24px',
        },
        // Bubble accent (blue bottom border)
        '.bubble-accent': {
          borderBottomWidth: '1.5px',
          borderBottomColor: 'rgba(10,102,194,0.18)',
        },
      });
    },
  ],
};
