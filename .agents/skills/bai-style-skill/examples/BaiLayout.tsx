/**
 * B.AI 风格主布局（sidebar + main）
 * 直接复制到 app/layout.tsx 或作为组件嵌入
 *
 * 依赖：lucide-react, clsx
 */

'use client';

import {
  MessageSquare, Database, Cpu, Wallet,
  ListChecks, Sparkles, Plus, ArrowRight,
  Leaf, Mic, CheckCircle, Coins,
} from 'lucide-react';
import clsx from 'clsx';
import { useState } from 'react';

const NAV_ITEMS = [
  { icon: MessageSquare, label: '新对话',   key: 'chat' },
  { icon: Database,      label: '用量信息', key: 'usage' },
  { icon: Cpu,           label: 'API',      key: 'api' },
  { icon: Wallet,        label: '充值',     key: 'topup' },
  { icon: ListChecks,    label: '订阅',     key: 'plan' },
  { icon: Sparkles,      label: '记忆',     key: 'memory' },
];

export default function BaiLayout() {
  const [active, setActive] = useState('chat');

  return (
    <div className="flex h-screen bg-cream-100 text-cream-900 font-sans">
      {/* ========== 侧边栏 ========== */}
      <aside className="w-60 bg-cream-200 border-r border-cream-300
                        flex flex-col p-3">
        {/* Logo */}
        <div className="px-3 py-4 mb-2">
          <div className="text-xl font-semibold tracking-tight">
            <span className="font-serif italic">B</span>.AI
          </div>
        </div>

        {/* Nav */}
        <nav className="flex flex-col gap-0.5">
          {NAV_ITEMS.map(({ icon: Icon, label, key }) => (
            <button
              key={key}
              onClick={() => setActive(key)}
              className={clsx(
                'flex items-center gap-3 px-3 py-2 rounded-lg text-sm transition',
                active === key
                  ? 'bg-cream-300 text-cream-900 font-medium'
                  : 'text-cream-700 hover:bg-cream-300/60'
              )}
            >
              <Icon strokeWidth={1.5} size={18} />
              {label}
            </button>
          ))}
        </nav>

        {/* 底部语言切换 */}
        <button className="mt-auto self-start w-9 h-9 rounded-lg
                           bg-white border border-cream-400
                           flex items-center justify-center text-xs">
          中
        </button>
      </aside>

      {/* ========== 主区域 ========== */}
      <main className="flex-1 flex flex-col">
        {/* 顶部 bar */}
        <header className="flex items-center justify-between px-6 py-4">
          <ModelSelector />
          <div className="flex items-center gap-3">
            <PeachPill icon={CheckCircle}>领取免费积分</PeachPill>
            <NeutralPill icon={Coins}>500K</NeutralPill>
            <Avatar />
          </div>
        </header>

        {/* 内容区——主轴居中是关键 */}
        <section className="flex-1 flex flex-col items-center justify-center
                            px-6 gap-6 -mt-20">
          <h1 className="text-3xl font-medium tracking-tight">
            欢迎使用 <span className="font-serif italic">B</span>.AI，有什么可以帮忙的？
          </h1>
          <ChatInput />
        </section>
      </main>
    </div>
  );
}

/* ========== 模型选择器 ========== */
function ModelSelector() {
  return (
    <button className="inline-flex items-center gap-2 rounded-full
                       bg-violet-500/10 text-cream-900 px-3 py-1.5
                       text-sm hover:bg-violet-500/15 transition">
      <span className="w-5 h-5 rounded-full
                       bg-[conic-gradient(from_180deg,#FFB8C0,#B8C5FF,#FFD9A8)]" />
      GPT-5 mini
      <span className="text-cream-600">▾</span>
    </button>
  );
}

/* ========== 桃色 pill（彩色锚点） ========== */
function PeachPill({
  icon: Icon, children,
}: { icon: any; children: React.ReactNode }) {
  return (
    <button className="inline-flex items-center gap-1.5 rounded-full
                       bg-peach-100 text-cream-900 px-3 py-1.5
                       text-xs font-medium hover:bg-peach-200/70 transition">
      <Icon strokeWidth={1.5} size={14} />
      {children}
    </button>
  );
}

/* ========== 中性 pill ========== */
function NeutralPill({
  icon: Icon, children,
}: { icon: any; children: React.ReactNode }) {
  return (
    <button className="inline-flex items-center gap-1.5 rounded-full
                       bg-white border border-cream-400 text-cream-900
                       px-3 py-1.5 text-xs font-medium
                       hover:bg-cream-200 transition num">
      <Icon strokeWidth={1.5} size={14} />
      {children}
    </button>
  );
}

/* ========== 头像（彩色 signature） ========== */
function Avatar() {
  return (
    <button className="inline-flex items-center gap-2 rounded-full
                       bg-white border border-cream-400 pl-1 pr-3 py-1
                       hover:bg-cream-200 transition">
      <span className="w-6 h-6 rounded-full
                       bg-[conic-gradient(from_180deg,#FFB8C0,#B8C5FF,#FFD9A8,#FFB8C0)]" />
      <span className="text-xs text-cream-700">AO_y...aq8af</span>
    </button>
  );
}

/* ========== Chat 输入框 ========== */
function ChatInput() {
  return (
    <div className="w-full max-w-2xl rounded-3xl border border-cream-400
                    bg-white px-5 py-4 shadow-card
                    focus-within:border-cream-500 transition">
      <input
        className="w-full bg-transparent outline-none text-cream-900
                   placeholder:text-cream-600 text-base"
        placeholder="询问任何问题"
      />
      <div className="flex items-center justify-between mt-3">
        <div className="flex items-center gap-1">
          <IconBtn><Plus strokeWidth={1.5} size={18} /></IconBtn>
          {/* 1% 彩色点缀——这就是 B.AI 的灵魂 */}
          <IconBtn><Leaf strokeWidth={1.5} size={18}
                         className="text-mint-500" /></IconBtn>
          <IconBtn><Sparkles strokeWidth={1.5} size={18}
                             className="text-violet-500" /></IconBtn>
          <IconBtn><Mic strokeWidth={1.5} size={18}
                        className="text-violet-500" /></IconBtn>
        </div>
        <button className="w-9 h-9 rounded-full bg-cream-200
                           hover:bg-cream-300 flex items-center justify-center
                           transition">
          <ArrowRight strokeWidth={1.5} size={16} />
        </button>
      </div>
    </div>
  );
}

function IconBtn({ children }: { children: React.ReactNode }) {
  return (
    <button className="p-2 rounded-full hover:bg-cream-200 transition">
      {children}
    </button>
  );
}
