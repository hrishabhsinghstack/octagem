import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Compass } from "lucide-react";
import { Link, useLocation } from "react-router-dom";

/**
 * The catch-all for any path inside the app shell that no route claims. Without it an old bookmark or a
 * mistyped URL rendered the sidebar around an empty page, which reads as a crash rather than a wrong address.
 */
export function NotFoundPage() {
  const { pathname } = useLocation();

  return (
    <div className="p-8 max-w-[1200px]">
      <Card>
        <CardContent className="flex flex-col items-center gap-3 py-16 text-center">
          <span className="flex h-11 w-11 items-center justify-center rounded-full bg-muted">
            <Compass className="h-5 w-5 text-muted-foreground" />
          </span>
          <div>
            <h1 className="text-sm font-medium">Page not found</h1>
            <p className="text-sm text-muted-foreground mt-1 max-w-md">
              Nothing lives at <span className="font-mono text-foreground">{pathname}</span>. It may have moved, or the link may be mistyped.
            </p>
          </div>
          <Button asChild variant="outline" size="sm" className="mt-2">
            <Link to="/">Back to dashboard</Link>
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}
