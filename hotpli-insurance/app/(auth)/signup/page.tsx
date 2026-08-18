"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Field, Input } from "@/components/ui/input";

export default function SignupPage() {
  const router = useRouter();
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [password2, setPassword2] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [sent, setSent] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (password !== password2) {
      setError("비밀번호가 서로 다릅니다.");
      return;
    }
    if (password.length < 8) {
      setError("비밀번호는 8자 이상이어야 합니다.");
      return;
    }
    setLoading(true);
    const supabase = createClient();
    const { data, error } = await supabase.auth.signUp({
      email,
      password,
      options: {
        data: { name },
        emailRedirectTo: `${window.location.origin}/auth/confirm`,
      },
    });
    setLoading(false);
    if (error) {
      setError(
        error.message.includes("already registered")
          ? "이미 가입된 이메일입니다."
          : "가입에 실패했습니다. 잠시 후 다시 시도해주세요.",
      );
      return;
    }
    // 이메일 확인이 꺼져 있으면 세션이 바로 생긴다 → 곧장 앱으로
    if (data.session) {
      router.replace("/analyses");
      router.refresh();
      return;
    }
    setSent(true);
  }

  if (sent) {
    return (
      <Card className="text-center space-y-3 py-8">
        <p className="text-[28px]">📮</p>
        <h1 className="font-display font-bold text-[20px]">확인 메일을 보냈어요</h1>
        <p className="text-[14px] text-ink/50">
          {email} 로 보낸 링크를 눌러 가입을 완료해주세요.
        </p>
      </Card>
    );
  }

  return (
    <div className="space-y-6">
      <div className="text-center space-y-2">
        <h1 className="font-display font-bold text-[24px]">회원가입</h1>
        <p className="text-[14px] text-ink/50">
          가입하면 무료 분석 3회가 제공됩니다
        </p>
      </div>

      <Card>
        <form onSubmit={handleSubmit} className="space-y-4">
          <Field label="이름">
            <Input
              required
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="홍길동"
              autoComplete="name"
            />
          </Field>
          <Field label="이메일">
            <Input
              type="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="name@example.com"
              autoComplete="email"
            />
          </Field>
          <Field label="비밀번호" hint="8자 이상">
            <Input
              type="password"
              required
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              autoComplete="new-password"
            />
          </Field>
          <Field label="비밀번호 확인">
            <Input
              type="password"
              required
              value={password2}
              onChange={(e) => setPassword2(e.target.value)}
              autoComplete="new-password"
            />
          </Field>

          {error && (
            <p className="text-[13px] text-warn font-medium px-1">{error}</p>
          )}

          <Button type="submit" disabled={loading} className="w-full">
            {loading ? "가입 중…" : "가입하기"}
          </Button>
        </form>
      </Card>

      <p className="text-center text-[14px] text-ink/50">
        이미 계정이 있나요?{" "}
        <Link href="/login" className="text-violet font-semibold">
          로그인
        </Link>
      </p>
    </div>
  );
}
