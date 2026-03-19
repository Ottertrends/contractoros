import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import Link from "next/link";

export default function InvoicesPlaceholderPage() {
  return (
    <div className="flex flex-col gap-6">
      <Card>
        <CardHeader>
          <CardTitle>Invoices</CardTitle>
        </CardHeader>
        <CardContent className="text-sm text-slate-600">
          Phase 3 will add invoice creation and management.
          <div className="mt-4">
            <Link href="/dashboard/projects" className="text-primary hover:underline">
              Go to Projects
            </Link>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

