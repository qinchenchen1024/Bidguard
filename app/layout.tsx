import type { Metadata, Viewport } from 'next';
import Link from 'next/link';
import './globals.css';
import PwaRegister from '@/components/PwaRegister';
import LlmSettingsButton from '@/components/LlmSettings';

export const metadata: Metadata = {
  title: 'BidGuard 标智核 — 招标投标文件智能校验',
  description: '招标/投标文件智能校验平台：完整性、条款合规、雷同检测与串标嫌疑识别',
  manifest: '/manifest.json',
  appleWebApp: { capable: true, statusBarStyle: 'default', title: '标智核' },
};

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  themeColor: '#1f43f5',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="zh-CN">
      <body>
        <header className="sticky top-0 z-10 border-b border-slate-200 bg-white/90 backdrop-blur print:hidden">
          <div className="container-page flex items-center justify-between py-3">
            <Link href="/" className="flex items-center gap-2 font-semibold text-slate-900">
              <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-brand-600 text-white">标</span>
              <span>BidGuard 标智核</span>
            </Link>
            <LlmSettingsButton />
          </div>
        </header>
        <main className="container-page">{children}</main>
        <PwaRegister />
      </body>
    </html>
  );
}
