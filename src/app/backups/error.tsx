"use client";

import { RouteError } from "@/app/components/RouteBoundaries";

export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return <RouteError error={error} reset={reset} routeLabel="backups" />;
}
