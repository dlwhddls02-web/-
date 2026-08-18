export default function AuthLayout({ children }: LayoutProps<"/">) {
  return (
    <div className="flex-1 flex flex-col items-center justify-center px-5 py-10">
      <div className="w-full max-w-sm">{children}</div>
    </div>
  );
}
