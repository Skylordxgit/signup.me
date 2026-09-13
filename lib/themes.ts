import type { ProfileAlignment, ThemeSettings } from "./types";

/**
 * Each entry is a complete, coordinated design system — background, typography,
 * button treatment, borders, shadow, blur and spacing — not just a background
 * colour. Selecting one replaces every visual field on the page's theme, so the
 * preview changes as a whole.
 */
export type ThemeDefinition = {
  id: string;
  label: string;
  description: string;
  settings: Omit<ThemeSettings, "preset">;
};

const base = {
  backgroundImage: "",
  backgroundBlur: 0,
  font: "inter" as const,
};

export const themeLibrary: ThemeDefinition[] = [
  {
    id: "glass-light",
    label: "Glass Light",
    description: "Frosted glass on a soft daylight wash",
    settings: {
      ...base,
      backgroundColor: "#eef2ff",
      gradientFrom: "#dbeafe",
      gradientTo: "#fae8ff",
      textColor: "#334155",
      headingColor: "#0f172a",
      buttonBackground: "#ffffff",
      buttonTextColor: "#0f172a",
      buttonBorderColor: "rgba(255, 255, 255, 0.85)",
      buttonRadius: 20,
      buttonTransparency: 74,
      glassBlur: 20,
      shadow: 26,
      spacing: 12,
      buttonStyle: "glass",
      surface: "glass",
    },
  },
  {
    id: "midnight-glass",
    label: "Midnight Glass",
    description: "Deep navy with luminous frosted panels",
    settings: {
      ...base,
      backgroundColor: "#0f172a",
      gradientFrom: "#0f172a",
      gradientTo: "#1e3a5f",
      textColor: "#cbd5e1",
      headingColor: "#f8fafc",
      buttonBackground: "#e2e8f0",
      buttonTextColor: "#0f172a",
      buttonBorderColor: "rgba(148, 163, 184, 0.34)",
      buttonRadius: 18,
      buttonTransparency: 92,
      glassBlur: 22,
      shadow: 32,
      spacing: 12,
      buttonStyle: "glass",
      surface: "glass-dark",
    },
  },
  {
    id: "aurora",
    label: "Aurora",
    description: "Northern-lights teal drifting into violet",
    settings: {
      ...base,
      backgroundColor: "#042f2e",
      gradientFrom: "#134e4a",
      gradientTo: "#4c1d95",
      textColor: "#d1fae5",
      headingColor: "#ffffff",
      buttonBackground: "#5eead4",
      buttonTextColor: "#042f2e",
      buttonBorderColor: "rgba(94, 234, 212, 0.42)",
      buttonRadius: 24,
      buttonTransparency: 88,
      glassBlur: 24,
      shadow: 34,
      spacing: 13,
      buttonStyle: "elevated",
      surface: "glass-dark",
    },
  },
  {
    id: "minimal-white",
    label: "Minimal White",
    description: "Pure white, hairline borders, zero noise",
    settings: {
      ...base,
      backgroundColor: "#ffffff",
      gradientFrom: "#ffffff",
      gradientTo: "#f4f4f5",
      textColor: "#52525b",
      headingColor: "#18181b",
      buttonBackground: "#ffffff",
      buttonTextColor: "#18181b",
      buttonBorderColor: "rgba(24, 24, 27, 0.16)",
      buttonRadius: 12,
      buttonTransparency: 100,
      glassBlur: 0,
      shadow: 8,
      spacing: 11,
      buttonStyle: "outline",
      surface: "plain",
    },
  },
  {
    id: "minimal-dark",
    label: "Minimal Dark",
    description: "Near-black canvas with quiet contrast",
    settings: {
      ...base,
      backgroundColor: "#09090b",
      gradientFrom: "#09090b",
      gradientTo: "#18181b",
      textColor: "#a1a1aa",
      headingColor: "#fafafa",
      buttonBackground: "#1c1c1f",
      buttonTextColor: "#fafafa",
      buttonBorderColor: "rgba(250, 250, 250, 0.16)",
      buttonRadius: 12,
      buttonTransparency: 100,
      glassBlur: 0,
      shadow: 10,
      spacing: 11,
      buttonStyle: "outline",
      surface: "plain-dark",
    },
  },
  {
    id: "purple-glow",
    label: "Purple Glow",
    description: "Electric violet with a soft halo",
    settings: {
      ...base,
      backgroundColor: "#2e1065",
      gradientFrom: "#4c1d95",
      gradientTo: "#7c3aed",
      textColor: "#ede9fe",
      headingColor: "#ffffff",
      buttonBackground: "#a78bfa",
      buttonTextColor: "#1e1b4b",
      buttonBorderColor: "rgba(196, 181, 253, 0.5)",
      buttonRadius: 22,
      buttonTransparency: 94,
      glassBlur: 18,
      shadow: 38,
      spacing: 13,
      buttonStyle: "elevated",
      surface: "glass-dark",
    },
  },
  {
    id: "ocean-glass",
    label: "Ocean Glass",
    description: "Cool blue depth under clear glass",
    settings: {
      ...base,
      backgroundColor: "#0c4a6e",
      gradientFrom: "#0369a1",
      gradientTo: "#06b6d4",
      textColor: "#e0f2fe",
      headingColor: "#ffffff",
      buttonBackground: "#ffffff",
      buttonTextColor: "#0c4a6e",
      buttonBorderColor: "rgba(255, 255, 255, 0.6)",
      buttonRadius: 20,
      buttonTransparency: 80,
      glassBlur: 22,
      shadow: 30,
      spacing: 12,
      buttonStyle: "glass",
      surface: "glass",
    },
  },
  {
    id: "sunset",
    label: "Sunset",
    description: "Warm coral fading into dusk pink",
    settings: {
      ...base,
      backgroundColor: "#7c2d12",
      gradientFrom: "#ea580c",
      gradientTo: "#db2777",
      textColor: "#ffe4e6",
      headingColor: "#ffffff",
      buttonBackground: "#fff7ed",
      buttonTextColor: "#7c2d12",
      buttonBorderColor: "rgba(255, 237, 213, 0.6)",
      buttonRadius: 999,
      buttonTransparency: 92,
      glassBlur: 16,
      shadow: 30,
      spacing: 13,
      buttonStyle: "pill",
      surface: "glass",
    },
  },
  {
    id: "gradient-mesh",
    label: "Gradient Mesh",
    description: "Blended mesh of pink, blue and gold",
    settings: {
      ...base,
      backgroundColor: "#312e81",
      gradientFrom: "#6366f1",
      gradientTo: "#ec4899",
      textColor: "#f5f3ff",
      headingColor: "#ffffff",
      buttonBackground: "#ffffff",
      buttonTextColor: "#312e81",
      buttonBorderColor: "rgba(255, 255, 255, 0.5)",
      buttonRadius: 26,
      buttonTransparency: 78,
      glassBlur: 26,
      shadow: 34,
      spacing: 13,
      buttonStyle: "soft",
      surface: "glass",
    },
  },
  {
    id: "professional",
    label: "Professional",
    description: "Restrained corporate slate and steel blue",
    settings: {
      ...base,
      backgroundColor: "#f1f5f9",
      gradientFrom: "#f8fafc",
      gradientTo: "#e2e8f0",
      textColor: "#475569",
      headingColor: "#0f172a",
      buttonBackground: "#1e40af",
      buttonTextColor: "#ffffff",
      buttonBorderColor: "rgba(30, 64, 175, 0.2)",
      buttonRadius: 10,
      buttonTransparency: 100,
      glassBlur: 0,
      shadow: 14,
      spacing: 10,
      buttonStyle: "solid",
      surface: "solid",
    },
  },
  {
    id: "neon",
    label: "Neon",
    description: "Black canvas cut by electric cyan",
    settings: {
      ...base,
      backgroundColor: "#020617",
      gradientFrom: "#020617",
      gradientTo: "#0f172a",
      textColor: "#94a3b8",
      headingColor: "#22d3ee",
      buttonBackground: "#22d3ee",
      buttonTextColor: "#020617",
      buttonBorderColor: "rgba(34, 211, 238, 0.75)",
      buttonRadius: 8,
      buttonTransparency: 100,
      glassBlur: 12,
      shadow: 40,
      spacing: 12,
      buttonStyle: "neon",
      surface: "plain-dark",
    },
  },
  {
    id: "soft-pastel",
    label: "Soft Pastel",
    description: "Gentle peach and mint with rounded edges",
    settings: {
      ...base,
      backgroundColor: "#fef3c7",
      gradientFrom: "#fed7aa",
      gradientTo: "#a7f3d0",
      textColor: "#4b5563",
      headingColor: "#1f2937",
      buttonBackground: "#ffffff",
      buttonTextColor: "#1f2937",
      buttonBorderColor: "rgba(255, 255, 255, 0.9)",
      buttonRadius: 999,
      buttonTransparency: 86,
      glassBlur: 14,
      shadow: 18,
      spacing: 13,
      buttonStyle: "soft",
      surface: "glass",
    },
  },
];

/** Legacy preset ids stored on existing pages, mapped to their closest theme. */
const legacyThemeAliases: Record<string, string> = {
  "glass-dark": "midnight-glass",
  midnight: "midnight-glass",
  "purple-glass": "purple-glow",
  "neon-glass": "neon",
  gradient: "gradient-mesh",
};

export function themeDefinition(preset: string): ThemeDefinition | undefined {
  const id = legacyThemeAliases[preset] ?? preset;
  return themeLibrary.find((theme) => theme.id === id);
}

/**
 * The full ThemeSettings produced by picking a theme from the library.
 * Profile alignment is a layout choice rather than part of the theme's look,
 * so it survives a theme change instead of snapping back to centre.
 */
export function applyThemeDefinition(theme: ThemeDefinition, current?: ThemeSettings): ThemeSettings {
  return {
    ...theme.settings,
    preset: theme.id as ThemeSettings["preset"],
    backgroundStyle: theme.settings.surface?.startsWith("plain") ? "solid" : "gradient",
    ...(current ? {
      backgroundImage: current.backgroundImage,
      buttonAnimation: current.buttonAnimation,
      profileLayout: current.profileLayout,
      showShareButton: current.showShareButton,
    } : {}),
    ...(current?.profileAlignment ? { profileAlignment: current.profileAlignment } : {}),
  };
}

/**
 * Pages saved before a field existed (or customised themes) can be missing the
 * newer keys, so fall back to the matching library theme and then to sane
 * defaults rather than rendering an undefined button style.
 */
export function resolveButtonStyle(theme: ThemeSettings): string {
  return theme.buttonStyle || themeDefinition(theme.preset)?.settings.buttonStyle || "glass";
}

export function resolveSurface(theme: ThemeSettings): string {
  return theme.surface || themeDefinition(theme.preset)?.settings.surface || "glass";
}

export function resolveAlignment(theme: ThemeSettings): ProfileAlignment {
  return theme.profileAlignment ?? (resolveProfileLayout(theme) === "hero" ? "left" : "center");
}

export function resolveProfileLayout(theme: ThemeSettings) {
  return theme.profileLayout ?? "hero";
}

function withAlpha(hex: string, alpha: number) {
  const clean = hex.replace("#", "");
  if (!/^[0-9a-f]{6}$/i.test(clean)) return hex;
  const r = Number.parseInt(clean.slice(0, 2), 16);
  const g = Number.parseInt(clean.slice(2, 4), 16);
  const b = Number.parseInt(clean.slice(4, 6), 16);
  return `rgba(${r}, ${g}, ${b}, ${Math.min(1, Math.max(0.15, alpha))})`;
}

/**
 * The theme as CSS custom properties. The builder canvas and the public page
 * both render from this, so the preview cannot drift from the real page.
 */
export function themeCssVariables(theme: ThemeSettings): React.CSSProperties {
  const fonts = {
    inter: "Inter, Arial, Helvetica, sans-serif",
    system: "system-ui, sans-serif",
    serif: "Georgia, 'Times New Roman', serif",
    mono: "ui-monospace, SFMono-Regular, Consolas, monospace",
  };
  const backgroundStyle = theme.backgroundStyle ?? (resolveSurface(theme).startsWith("plain") ? "solid" : "gradient");
  return {
    "--page-font": fonts[theme.font] || fonts.inter,
    "--page-background": backgroundStyle === "solid" ? theme.backgroundColor : `linear-gradient(135deg, ${theme.gradientFrom}, ${theme.gradientTo})`,
    "--from": theme.gradientFrom,
    "--to": theme.gradientTo,
    "--bg": theme.backgroundColor,
    "--glass": theme.glassBlur,
    "--button-bg": theme.buttonBackground,
    "--button-bg-glass": withAlpha(theme.buttonBackground, theme.buttonTransparency / 100),
    "--button-text": theme.buttonTextColor,
    "--button-border": theme.buttonBorderColor,
    "--button-radius": `${theme.buttonRadius}px`,
    "--button-alpha": `${theme.buttonTransparency / 100}`,
    "--shadow": `0 ${Math.max(10, theme.shadow)}px ${Math.max(24, theme.shadow * 2)}px rgba(15, 23, 42, 0.22)`,
    "--spacing": `${theme.spacing}px`,
    "--heading": theme.headingColor,
    "--text": theme.textColor,
  } as React.CSSProperties;
}
