import i18Next from "i18next";
import { initReactI18next } from "react-i18next";

import enUs from "./locales/en-us.json";
import hiIn from "./locales/hi-in.json";

export const defaultNS = "translation";
export const resources = {
  en: {
    translation: enUs
  },
  hi: {
    translation: hiIn
  }
} as const;

i18Next.use(initReactI18next).init({
  lng: "en",
  fallbackLng: "en",
  ns: ["translation"],
  defaultNS,
  resources,
  interpolation: {
    escapeValue: false
  }
});

export default i18Next;
