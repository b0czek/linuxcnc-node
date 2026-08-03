import { setupI18n } from "@edenapp/babel/solid";
import type { I18nCommonTranslations } from "@edenapp/babel/generated/i18n";
import type { InferTranslations } from "@edenapp/babel/types";
import { en } from "./locales/en";
import { pl } from "./locales/pl";
type AppTranslations = InferTranslations<typeof en>;
type Translations = I18nCommonTranslations & AppTranslations;
export const { t, locale, setLocale, initLocale } = setupI18n<Translations>({ resources: { en: { translation: en }, pl: { translation: pl } } });
