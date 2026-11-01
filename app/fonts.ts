import localFont from "next/font/local";

// Full Vietnamese/combining-mark coverage is shipped with the app, including
// every UI weight. Builds and visitors never need a third-party font request.
export const uiFont = localFont({
  src: [
    { path: "./fonts/be-vietnam-pro-regular.woff2", weight: "400", style: "normal" },
    { path: "./fonts/be-vietnam-pro-medium.woff2", weight: "500", style: "normal" },
    { path: "./fonts/be-vietnam-pro-semibold.woff2", weight: "600", style: "normal" },
    { path: "./fonts/be-vietnam-pro-bold.woff2", weight: "700", style: "normal" },
  ],
  variable: "--aven-font-ui",
  display: "swap",
  preload: false,
  adjustFontFallback: "Arial",
  fallback: ["Arial", "sans-serif"],
});

export const editorialFont = localFont({
  src: "./fonts/lora-variable.woff2",
  weight: "400 700",
  style: "normal",
  variable: "--aven-font-editorial",
  display: "swap",
  adjustFontFallback: "Times New Roman",
  fallback: ["Georgia", "serif"],
});
