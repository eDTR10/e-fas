import { Construction } from "lucide-react";
import AdminLayout from "./AdminLayout";

interface PlaceholderProps {
  title: string;
  subtitle?: string;
}

const Placeholder = ({ title, subtitle }: PlaceholderProps) => (
  <AdminLayout title={title} subtitle={subtitle}>
    <div className="flex flex-col items-center justify-center text-center py-24 gap-4">
      <div className="p-4 rounded-full bg-primary/10 text-primary">
        <Construction className="w-8 h-8" />
      </div>
      <div>
        <h2 className="text-lg font-semibold text-foreground">{title}</h2>
        <p className="text-sm text-muted-foreground mt-1">This section is coming soon.</p>
      </div>
    </div>
  </AdminLayout>
);

export default Placeholder;
