import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

export default function PriceBookPlaceholderPage() {
  return (
    <div className="flex flex-col gap-6">
      <Card>
        <CardHeader>
          <CardTitle>Price Book</CardTitle>
        </CardHeader>
        <CardContent className="text-sm text-slate-600">
          Phase 4 will add the materials/pricing price book CRUD.
        </CardContent>
      </Card>
    </div>
  );
}

