'use client';

import { useEffect } from 'react';

/** 注册 Service Worker，使应用可作为 PWA 安装使用 */
export default function PwaRegister() {
  useEffect(() => {
    if (typeof window === 'undefined' || !('serviceWorker' in navigator)) return;
    const onLoad = () => {
      navigator.serviceWorker.register('/sw.js').catch(() => {
        /* 忽略注册失败（如开发环境或非 HTTPS） */
      });
    };
    window.addEventListener('load', onLoad);
    return () => window.removeEventListener('load', onLoad);
  }, []);
  return null;
}
