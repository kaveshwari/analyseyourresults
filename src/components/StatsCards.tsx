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

  // Per-semester pass rates
  const semesterPassRates = data.semesters.map(sem => {
    const studentsInSem = data.students.filter(s => s.semesters.some(ss => ss.semester === sem));
    const passedInSem = studentsInSem.filter(s => {
      const semData = s.semesters.find(ss => ss.semester === sem);
      return semData ? semData.subjects.every(subj => subj.status !== "Arrear") : false;
    });
    const rate = studentsInSem.length > 0 ? ((passedInSem.length / studentsInSem.length) * 100).toFixed(1) : "0";
    return { semester: sem, rate, passed: passedInSem.length, total: studentsInSem.length };
  });

  const cards = [
    { label: "Total Students", value: data.students.length, icon: Users, color: "text-info", bg: "bg-info/10" },
    { label: "Total Arrears", value: data.totalClassArrears, icon: AlertTriangle, color: "text-warning", bg: "bg-warning/10" },
    { label: "Students with Arrears", value: arrearsStudents, icon: TrendingDown, color: "text-destructive", bg: "bg-destructive/10" },
    { label: "All Clear", value: clearStudents, icon: CheckCircle, color: "text-success", bg: "bg-success/10" },
    { label: "Semesters", value: data.semesters.length, icon: BookOpen, color: "text-primary", bg: "bg-primary/10" },
    { label: "Overall Pass Rate", value: `${passRate}%`, icon: BarChart3, color: "text-accent", bg: "bg-accent/10" },
  ];

  return (
    <div className="space-y-4 animate-fade-up-delay">
      {/* Main stats */}
      <div className="grid grid-cols-2 lg:grid-cols-3 xl:grid-cols-6 gap-4">
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

      {/* Semester-wise pass rates */}
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-3">
        {semesterPassRates.map(({ semester, rate, passed, total }) => (
          <div key={semester} className="glass-card rounded-xl p-4">
            <p className="text-xs font-medium text-muted-foreground mb-2">Semester {semester} Pass Rate</p>
            <p className="text-xl font-bold text-foreground tabular-nums">{rate}%</p>
            <div className="mt-2 w-full bg-muted rounded-full h-1.5 overflow-hidden">
              <div
                className="h-full rounded-full bg-primary transition-all"
                style={{ width: `${rate}%` }}
              />
            </div>
            <p className="text-[10px] text-muted-foreground mt-1.5 tabular-nums">{passed}/{total} students</p>
          </div>
        ))}
      </div>
    </div>
  );
}
