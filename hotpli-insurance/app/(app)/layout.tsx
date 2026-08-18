import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { TabNav } from "@/components/tab-nav";

export default async function AppLayout({ children }: LayoutProps<"/">) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  return (
    <div className="flex-1 flex flex-col">
      <main className="flex-1 mx-auto w-full max-w-md px-5 pt-6 pb-24">
        {children}
      </main>
      <TabNav />
    </div>
  );
}
