import { Users, AlertTriangle, CheckCircle, BarChart3 } from "lucide-react";
import type { ParsedResults } from "@/lib/pdf-parser";

interface StatsCardsProps {
  data: ParsedResults;
}

export function StatsCards({ data }: StatsCardsProps) {
  const arrearsStudents = data.students.filter(s => s.arrearCount > 0).length;
  const clearStudents = data.students.length - arrearsStudents;
  const passRate = data.students.length > 0
    ? ((clearStudents / data.students.length) * 100).toFixed(1)
    : "0";

  const cards = [
    { label: "Total Students", value: data.students.length, icon: Users, color: "text-info", bg: "bg-info/10" },
    { label: "Total Arrears", value: data.totalClassArrears, icon: AlertTriangle, color: "text-warning", bg: "bg-warning/10" },
    { label: "All Clear", value: clearStudents, icon: CheckCircle, color: "text-success", bg: "bg-success/10" },
    { label: "Pass Rate", value: `${passRate}%`, icon: BarChart3, color: "text-primary", bg: "bg-primary/10" },
  ];

  return (
    <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 animate-fade-up-delay">
      {cards.map((card) => (
        <div key={card.label} className="glass-card rounded-xl p-5">
          <div className="flex items-center gap-3 mb-3">
            <div className={`w-10 h-10 rounded-lg ${card.bg} flex items-center justify-center`}>
              <card.icon className={`w-5 h-5 ${card.color}`} />
            </div>
          </div>
          <p className="text-2xl font-bold text-foreground tracking-tight tabular-nums">{card.value}</p>
          <p className="text-sm text-muted-foreground mt-0.5">{card.label}</p>
        </div>
      ))}
    </div>
  );
}