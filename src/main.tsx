import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App";
import "./index.css";
import "./i18n";

// dev 전용: 콘솔에서 store 를 직접 조작할 수 있도록 window 에 노출
// import.meta.env.DEV 는 vite 가 production 빌드 시 false 로 치환 → 이 블록은 tree-shake 되어 제외됨
if (import.meta.env.DEV) {
  import("./store/uiStore").then(({ useUiStore }) => {
    (window as unknown as { __uiStore: typeof useUiStore }).__uiStore = useUiStore;
  });
}

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);
