import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

export default function StatsPlaceholderPage() {
  return (
    <div className="flex flex-col gap-6">
      <Card>
        <CardHeader>
          <CardTitle>Stats</CardTitle>
        </CardHeader>
        <CardContent className="text-sm text-slate-600">
          Phase 5 will add stats and insights.
        </CardContent>
      </Card>
    </div>
  );
}

