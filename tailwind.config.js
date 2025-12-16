/** @type {import('tailwindcss').Config} */
export default {
  content: [
    // 🚨 告訴 Tailwind 掃描所有的 .jsx 和 .js 檔案
    './index.html',
    './src/**/*.{js,ts,jsx,tsx}',
  ],
  theme: {
    extend: {},
  },
  plugins: [],
};
