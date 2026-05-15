// i18next 초기화. main.tsx 에서 side-effect only import 로 1회 호출되며
// 다른 파일에서는 `import i18n from '../i18n'` 으로 인스턴스를 사용한다.

import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';
import ko from './locales/ko.json';
import en from './locales/en.json';
import { SUPPORTED_LANGUAGES, DEFAULT_LANGUAGE } from './languages';

// dev 한정 missing key 콘솔 경고.
// import.meta.env.DEV 는 vite 가 production 빌드 시 false 로 정적 치환하여
// 핸들러 함수 자체가 tree-shake 되어 번들에서 제외된다.
const missingKeyHandler = import.meta.env.DEV
  ? (lngs: readonly string[], ns: string, key: string, fallbackValue: string) => {
      // eslint-disable-next-line no-console
      console.warn(
        `[i18n missing] ns=${ns} key=${key} lng=${lngs.join(',')} fallback="${fallbackValue}"`
      );
    }
  : undefined;

void i18n
  .use(initReactI18next)
  .init({
    lng: DEFAULT_LANGUAGE,            // 1차 부팅 lng. 실제 사용자 언어는 App.tsx effect 에서 changeLanguage.
    fallbackLng: DEFAULT_LANGUAGE,    // missing key 시 폴백 (ko 노출 → 앱 깨짐 회피)
    supportedLngs: SUPPORTED_LANGUAGES as unknown as string[],
    resources: {
      ko: { translation: ko },
      en: { translation: en },
    },
    interpolation: { escapeValue: false }, // React 가 이미 XSS 가드
    returnNull: false,                 // missing 시 null 대신 key 문자열 반환
    saveMissing: import.meta.env.DEV,
    missingKeyHandler,
    debug: false,
  });

export default i18n;
