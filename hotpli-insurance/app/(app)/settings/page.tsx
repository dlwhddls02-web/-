import { createClient } from "@/lib/supabase/server";
import { Card } from "@/components/ui/card";
import { LogoutButton } from "./logout-button";

export default async function SettingsPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const { data: profile } = await supabase
    .from("profiles")
    .select("name, free_credits")
    .eq("id", user!.id)
    .single();

  return (
    <div className="space-y-6">
      <header className="space-y-1">
        <h1 className="font-display font-bold text-[22px]">설정</h1>
      </header>

      <Card className="space-y-3">
        <div>
          <p className="text-[13px] text-ink/45">이름</p>
          <p className="text-[15px] font-semibold">
            {profile?.name || "미입력"}
          </p>
        </div>
        <div>
          <p className="text-[13px] text-ink/45">이메일</p>
          <p className="text-[15px] font-semibold">{user?.email}</p>
        </div>
        <div>
          <p className="text-[13px] text-ink/45">남은 무료 분석</p>
          <p className="font-display font-bold text-[24px] text-violet">
            {profile?.free_credits ?? 0}회
          </p>
        </div>
      </Card>

      <LogoutButton />
    </div>
  );
}
