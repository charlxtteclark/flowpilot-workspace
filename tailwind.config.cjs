/** @type {import('tailwindcss').Config} */
const v = (n) => `rgb(var(--${n}) / <alpha-value>)`;
module.exports = {
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        bg: v("bg"), surface: v("surface"), surface2: v("surface-2"), line: v("line"),
        ink: v("ink"), ink2: v("ink-2"), ink3: v("ink-3"),
        accent: v("accent"), accentsoft: v("accent-soft"),
        human: v("human"), humansoft: v("human-soft"),
        crit: v("crit"), critsoft: v("crit-soft"), warn: v("warn"), warnsoft: v("warn-soft"),
        low: v("low"), lowsoft: v("low-soft"), good: v("good"),
        s1: v("s1"), s2: v("s2"),
      },
      fontFamily: {
        sans: ["Geist", "ui-sans-serif", "system-ui", "-apple-system", "Segoe UI", "sans-serif"],
        mono: ["'Geist Mono'", "ui-monospace", "SFMono-Regular", "Menlo", "monospace"],
      },
      fontSize: { "2xs": ["11px", "15px"] },
    },
  },
  plugins: [],
};
