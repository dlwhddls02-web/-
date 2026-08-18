"use client";

import { Suspense, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Field, Input } from "@/components/ui/input";

function LoginForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    const supabase = createClient();
    const { error } = await supabase.auth.signInWithPassword({
      email,
      password,
    });
    setLoading(false);
    if (error) {
      setError(
        error.message === "Invalid login credentials"
          ? "이메일 또는 비밀번호가 올바르지 않습니다."
          : "로그인에 실패했습니다. 잠시 후 다시 시도해주세요.",
      );
      return;
    }
    const next = searchParams.get("next");
    router.replace(next && next.startsWith("/") ? next : "/analyses");
    router.refresh();
  }

  return (
    <div className="space-y-6">
      <div className="text-center space-y-2">
        <h1 className="font-display font-bold text-[24px]">로그인</h1>
        <p className="text-[14px] text-ink/50">
          고지사항 분석을 시작하려면 로그인하세요
        </p>
      </div>

      <Card className="space-y-4">
        <form onSubmit={handleSubmit} className="space-y-4">
          <Field label="이메일">
            <Input
              type="email"
              autoComplete="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="name@example.com"
            />
          </Field>
          <Field label="비밀번호">
            <Input
              type="password"
              autoComplete="current-password"
              required
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="••••••••"
            />
          </Field>

          {error && (
            <p className="text-[13px] text-warn font-medium px-1">{error}</p>
          )}

          <Button type="submit" disabled={loading} className="w-full">
            {loading ? "로그인 중…" : "이메일로 로그인"}
          </Button>
        </form>

        {/* 카카오 로그인: 개발자 앱 키 발급 후 활성화 (supabase/README.md 5번) */}
        <Button variant="secondary" disabled className="w-full" title="준비 중">
          카카오로 로그인 (준비 중)
        </Button>
      </Card>

      <p className="text-center text-[14px] text-ink/50">
        아직 계정이 없나요?{" "}
        <Link href="/signup" className="text-violet font-semibold">
          회원가입
        </Link>
      </p>
    </div>
  );
}

export default function LoginPage() {
  return (
    <Suspense>
      <LoginForm />
    </Suspense>
  );
}
