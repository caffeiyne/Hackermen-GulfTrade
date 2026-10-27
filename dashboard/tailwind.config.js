/** @type {import('tailwindcss').Config} */
module.exports = {
  darkMode: ["class"],
  content: [
    "./app/**/*.{ts,tsx}",
    "./components/**/*.{ts,tsx}",
    "./lib/**/*.{ts,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        // Tradeling brand greens
        tradeling: {
          50: "#e8f9f0",
          100: "#c4f3df",
          200: "#8ee7c0",
          300: "#50d49b",
          400: "#22bd7a",
          500: "#0aa363",
          600: "#008350",
          700: "#016941",
          800: "#055336",
          900: "#06452e",
          950: "#022616",
        },
        // CodeBuddy-inspired dark palette
        buddy: {
          bg: "#0a0e14",
          surface: "#11151c",
          border: "#1e242d",
          muted: "#6b7280",
          text: "#e4e7eb",
        },
      },
      fontFamily: {
        sans: ["var(--font-inter)", "system-ui", "sans-serif"],
        mono: ["var(--font-jetbrains)", "monospace"],
      },
      animation: {
        "pulse-glow": "pulse-glow 2s ease-in-out infinite",
        "slide-in": "slide-in 0.3s ease-out",
        "fade-up": "fade-up 0.4s ease-out",
        "shimmer": "shimmer 2s linear infinite",
      },
      keyframes: {
        "pulse-glow": {
          "0%, 100%": { opacity: "1", boxShadow: "0 0 0 0 rgba(10,163,99,0.4)" },
          "50%": { opacity: "0.8", boxShadow: "0 0 0 8px rgba(10,163,99,0)" },
        },
        "slide-in": {
          "0%": { transform: "translateX(-10px)", opacity: "0" },
          "100%": { transform: "translateX(0)", opacity: "1" },
        },
        "fade-up": {
          "0%": { transform: "translateY(10px)", opacity: "0" },
          "100%": { transform: "translateY(0)", opacity: "1" },
        },
        "shimmer": {
          "0%": { backgroundPosition: "-200% 0" },
          "100%": { backgroundPosition: "200% 0" },
        },
      },
    },
  },
  plugins: [],
}
