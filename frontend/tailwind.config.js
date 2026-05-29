/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    "./app/**/*.{js,jsx}",
    "./components/**/*.{js,jsx}",
    "./lib/**/*.{js,jsx}",
  ],
  theme: {
    extend: {
      colors: {
        brand: {
          50: "#f8eef1",
          100: "#f0d6dd",
          500: "#dc758f",
          600: "#b95a72",
          700: "#873d48",
        },
        slateplus: "#0c101e",
        mist: "#121827",
        cinematic: {
          navy: "#0C101E",
          slate: "#5D737E",
          ivory: "#FCFCFC",
          burgundy: "#873D48",
          rose: "#DC758F",
        },
      },
      boxShadow: {
        smooth: "0 18px 55px rgba(0, 0, 0, 0.42)",
      },
      backgroundImage: {
        "hero-pattern":
          "radial-gradient(circle at 12% 16%, rgba(220,117,143,0.12), transparent 28%), radial-gradient(circle at 84% 4%, rgba(135,61,72,0.2), transparent 30%), radial-gradient(circle at 72% 78%, rgba(93,115,126,0.12), transparent 28%), linear-gradient(180deg, #0C101E 0%, #0C101E 44%, #101828 72%, #0C101E 100%)",
      },
    },
  },
  plugins: [],
};
