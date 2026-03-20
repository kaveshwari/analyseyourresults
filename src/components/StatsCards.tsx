import { Users, AlertTriangle, CheckCircle, BarChart3, BookOpen, TrendingDown } from "lucide-react";
import type { ParsedResults } from "@/lib/pdf-parser";

interface StatsCardsProps {
  data: ParsedResults;
}

export function StatsCards({ data }: StatsCardsProps) {
  const arrearsStudents = data.students.filter(s => s.totalArrears > 0).length;
  const clearStudents = data.students.length - arrearsStudents;
  const passRate = data.students.length > 0
    ? ((clearStudents / data.students.length) * 100).toFixed(1)
    : "0";

  const cards = [
    { label: "Total Students", value: data.students.length, icon: Users, color: "text-info", bg: "bg-info/10" },
    { label: "Total Arrears", value: data.totalClassArrears, icon: AlertTriangle, color: "text-warning", bg: "bg-warning/10" },
    { label: "Students with Arrears", value: arrearsStudents, icon: TrendingDown, color: "text-destructive", bg: "bg-destructive/10" },
    { label: "All Clear", value: clearStudents, icon: CheckCircle, color: "text-success", bg: "bg-success/10" },
    { label: "Semesters", value: data.semesters.length, icon: BookOpen, color: "text-primary", bg: "bg-primary/10" },
    { label: "Pass Rate", value: `${passRate}%`, icon: BarChart3, color: "text-accent", bg: "bg-accent/10" },
  ];

  return (
    <div className="grid grid-cols-2 lg:grid-cols-3 xl:grid-cols-6 gap-4 animate-fade-up-delay">
      {cards.map((card) => (
        <div key={card.label} className="glass-card rounded-xl p-4">
          <div className="flex items-center gap-2.5 mb-2.5">
            <div className={`w-9 h-9 rounded-lg ${card.bg} flex items-center justify-center`}>
              <card.icon className={`w-4.5 h-4.5 ${card.color}`} />
            </div>
          </div>
          <p className="text-2xl font-bold text-foreground tracking-tight tabular-nums">{card.value}</p>
          <p className="text-xs text-muted-foreground mt-0.5">{card.label}</p>
        </div>
      ))}
    </div>
  );
}
