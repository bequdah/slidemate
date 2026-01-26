/** @type {import('tailwindcss').Config} */
export default {
    content: [
        "./index.html",
        "./src/**/*.{js,ts,jsx,tsx}",
    ],
    theme: {
        extend: {
            colors: {
                premium: {
                    dark: "#0f172a",
                    accent: "#6366f1",
                    gold: "#f59e0b",
                    red: "#ef4444",
                }
            }
        },
    },
    plugins: [],
}
