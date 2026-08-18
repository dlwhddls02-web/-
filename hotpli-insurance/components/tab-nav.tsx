"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const tabs = [
  { href: "/analyses", label: "이력", icon: "📋" },
  { href: "/analyze/new", label: "새 분석", icon: "＋" },
  { href: "/settings", label: "설정", icon: "⚙" },
] as const;

/** 하단 탭 네비 (모바일 우선) */
export function TabNav() {
  const pathname = usePathname();
  return (
    <nav className="fixed bottom-0 inset-x-0 z-20 bg-white/95 backdrop-blur border-t border-ink/5 print:hidden">
      <div className="mx-auto max-w-md flex">
        {tabs.map((tab) => {
          const active =
            tab.href === "/analyses"
              ? pathname === "/analyses"
              : pathname.startsWith(tab.href.replace("/new", ""));
          return (
            <Link
              key={tab.href}
              href={tab.href}
              className={`flex-1 flex flex-col items-center gap-0.5 py-2.5 text-[11px] font-medium ${
                active ? "text-violet" : "text-ink/40"
              }`}
            >
              <span className="text-[18px] leading-none">{tab.icon}</span>
              {tab.label}
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
