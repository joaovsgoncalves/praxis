import { cn } from "@/lib/utils"

function Skeleton({
  className,
  ...props
}) {
  return (
    (<div
      className={cn("praxis-skeleton rounded-md", className)}
      aria-hidden
      {...props} />)
  );
}

export { Skeleton }
