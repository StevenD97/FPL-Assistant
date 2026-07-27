export function CaptainBadge({ type = "C" }: { type?: string }) {
  return (
    <span className="ml-1 inline-flex h-[18px] w-[18px] items-center justify-center rounded-full bg-pl-purple text-[10px] font-bold text-white">
      {type}
    </span>
  );
}
