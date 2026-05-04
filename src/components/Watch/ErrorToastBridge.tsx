// 앱 레벨 sonner Toaster wrapper

import { Toaster } from "sonner";

export function ErrorToastBridge() {
  return (
    <Toaster
      position="bottom-right"
      richColors
      visibleToasts={3}
      theme="dark"
    />
  );
}
