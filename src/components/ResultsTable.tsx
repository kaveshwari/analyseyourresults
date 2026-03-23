import { useState } from "react";
import type { ParsedResults } from "@/lib/pdf-parser";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";

interface ResultsTableProps {
  data: ParsedResults;
}

function GradeBadge({ grade, status }: { grade: string; status: string }) {
  const colorMap: Record<string, string> = {
    Pass: "bg-success/12 text-success",
    Arrear: "bg-destructive/12 text-destructive",
    Hold: "bg-warning/12 text-warning",
    Absent: "bg-muted text-muted-foreground",
    Withheld: "bg-muted text-muted-foreground",
  };
  return (
    <span className={`inline-flex items-center justify-center min-w-[2.25rem] px-1.5 py-0.5 rounded-md text-xs font-semibold tabular-nums ${colorMap[status] || "bg-muted text-muted-foreground"}`}>
      {grade}
    </span>
  );
}

function SemesterTable({ data, semester }: { data: ParsedResults; semester: number }) {
  const codes = data.semesterSubjects[semester] || [];
  const students = data.students
    .filter(s => s.semesters.some(ss => ss.semester === semester))
    .sort((a, b) => a.regNo.localeCompare(b.regNo));

  if (students.length === 0) {
    return <p className="p-6 text-muted-foreground text-sm">No student data for this semester.</p>;
  }

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="bg-muted/50">
            <th className="text-left px-3 py-2.5 font-medium text-muted-foreground text-xs">#</th>
            <th className="text-left px-3 py-2.5 font-medium text-muted-foreground text-xs whitespace-nowrap">Reg. Number</th>
            <th className="text-left px-3 py-2.5 font-medium text-muted-foreground text-xs">Name</th>
            {codes.map(code => (
              <th key={code} className="text-center px-2 py-2.5 font-medium text-muted-foreground text-xs whitespace-nowrap">{code}</th>
            ))}
            <th className="text-center px-3 py-2.5 font-medium text-muted-foreground text-xs">Arrears</th>
          </tr>
        </thead>
        <tbody>
          {students.map((student, i) => {
            const semData = student.semesters.find(s => s.semester === semester);
            const semArrears = semData?.subjects.filter(s => s.status === "Arrear").length || 0;
            return (
              <tr key={student.regNo} className="border-t border-border/40 hover:bg-muted/30 transition-colors">
                <td className="px-3 py-2.5 text-muted-foreground tabular-nums text-xs">{i + 1}</td>
                <td className="px-3 py-2.5 font-medium text-foreground whitespace-nowrap text-xs tabular-nums">{student.regNo}</td>
                <td className="px-3 py-2.5 text-foreground whitespace-nowrap text-xs">{student.name}</td>
                {codes.map(code => {
                  const subj = semData?.subjects.find(x => x.code === code);
                  return (
                    <td key={code} className="px-2 py-2.5 text-center">
                      {subj ? <GradeBadge grade={subj.grade} status={subj.status} /> : <span className="text-muted-foreground/40 text-xs">—</span>}
                    </td>
                  );
                })}
                <td className="px-3 py-2.5 text-center">
                  {semArrears > 0 ? (
                    <span className="inline-flex items-center justify-center w-6 h-6 rounded-full bg-destructive/10 text-destructive font-bold text-xs">{semArrears}</span>
                  ) : (
                    <span className="text-success text-xs font-medium">✓</span>
                  )}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

function CumulativeTable({ data }: { data: ParsedResults }) {
  const studentsWithArrears = data.students.filter(s => s.totalArrears > 0).sort((a, b) => b.totalArrears - a.totalArrears);

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="bg-muted/50">
            <th className="text-left px-3 py-2.5 font-medium text-muted-foreground text-xs">#</th>
            <th className="text-left px-3 py-2.5 font-medium text-muted-foreground text-xs whitespace-nowrap">Reg. Number</th>
            <th className="text-left px-3 py-2.5 font-medium text-muted-foreground text-xs">Name</th>
            {data.semesters.map(sem => (
              <th key={sem} className="text-center px-3 py-2.5 font-medium text-muted-foreground text-xs whitespace-nowrap">Sem {sem}</th>
            ))}
            <th className="text-center px-3 py-2.5 font-medium text-muted-foreground text-xs">Total</th>
            <th className="text-left px-3 py-2.5 font-medium text-muted-foreground text-xs">Arrear Subjects</th>
          </tr>
        </thead>
        <tbody>
          {studentsWithArrears.map((student, i) => (
            <tr key={student.regNo} className="border-t border-border/40 hover:bg-muted/30 transition-colors">
              <td className="px-3 py-2.5 text-muted-foreground tabular-nums text-xs">{i + 1}</td>
              <td className="px-3 py-2.5 font-medium text-foreground whitespace-nowrap text-xs tabular-nums">{student.regNo}</td>
              <td className="px-3 py-2.5 text-foreground whitespace-nowrap text-xs">{student.name}</td>
              {data.semesters.map(sem => {
                const semData = student.semesters.find(s => s.semester === sem);
                const count = semData?.subjects.filter(s => s.status === "Arrear").length || 0;
                return (
                  <td key={sem} className="px-3 py-2.5 text-center">
                    {count > 0 ? (
                      <span className="inline-flex items-center justify-center w-6 h-6 rounded-full bg-destructive/10 text-destructive font-bold text-xs">{count}</span>
                    ) : (
                      <span className="text-muted-foreground/40 text-xs">0</span>
                    )}
                  </td>
                );
              })}
              <td className="px-3 py-2.5 text-center">
                <span className="inline-flex items-center justify-center min-w-[1.75rem] px-1.5 py-0.5 rounded-full bg-destructive/10 text-destructive font-bold text-xs">{student.totalArrears}</span>
              </td>
              <td className="px-3 py-2.5 text-xs text-muted-foreground max-w-[200px]">
                <div className="flex flex-wrap gap-1">
                  {student.arrearSubjects.map((a, j) => (
                    <span key={j} className="inline-flex px-1.5 py-0.5 rounded bg-destructive/8 text-destructive text-[10px] font-medium whitespace-nowrap">
                      {a.code}
                    </span>
                  ))}
                </div>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      {studentsWithArrears.length === 0 && (
        <p className="p-6 text-center text-muted-foreground text-sm">All students are clear! 🎉</p>
      )}
    </div>
  );
}

function GpaCgpaTable({ data }: { data: ParsedResults }) {
  const clearStudents = data.students
    .filter(s => s.totalArrears === 0 && s.cgpa !== undefined)
    .sort((a, b) => (b.cgpa || 0) - (a.cgpa || 0));

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="bg-muted/50">
            <th className="text-left px-3 py-2.5 font-medium text-muted-foreground text-xs">#</th>
            <th className="text-left px-3 py-2.5 font-medium text-muted-foreground text-xs whitespace-nowrap">Reg. Number</th>
            <th className="text-left px-3 py-2.5 font-medium text-muted-foreground text-xs">Name</th>
            {data.semesters.map(sem => (
              <th key={sem} className="text-center px-3 py-2.5 font-medium text-muted-foreground text-xs whitespace-nowrap">Sem {sem} GPA</th>
            ))}
            <th className="text-center px-3 py-2.5 font-medium text-muted-foreground text-xs whitespace-nowrap">CGPA</th>
          </tr>
        </thead>
        <tbody>
          {clearStudents.map((student, i) => (
            <tr key={student.regNo} className="border-t border-border/40 hover:bg-muted/30 transition-colors">
              <td className="px-3 py-2.5 text-muted-foreground tabular-nums text-xs">{i + 1}</td>
              <td className="px-3 py-2.5 font-medium text-foreground whitespace-nowrap text-xs tabular-nums">{student.regNo}</td>
              <td className="px-3 py-2.5 text-foreground whitespace-nowrap text-xs">{student.name}</td>
              {data.semesters.map(sem => {
                const semData = student.semesters.find(s => s.semester === sem);
                return (
                  <td key={sem} className="px-3 py-2.5 text-center">
                    {semData?.gpa ? (
                      <span className="inline-flex items-center justify-center min-w-[2.25rem] px-1.5 py-0.5 rounded-md bg-primary/10 text-primary text-xs font-semibold tabular-nums">
                        {semData.gpa.toFixed(2)}
                      </span>
                    ) : (
                      <span className="text-muted-foreground/40 text-xs">—</span>
                    )}
                  </td>
                );
              })}
              <td className="px-3 py-2.5 text-center">
                <span className="inline-flex items-center justify-center min-w-[2.5rem] px-2 py-0.5 rounded-md bg-success/12 text-success text-xs font-bold tabular-nums">
                  {student.cgpa?.toFixed(2) || "—"}
                </span>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      {clearStudents.length === 0 && (
        <p className="p-6 text-center text-muted-foreground text-sm">No all-clear students found.</p>
      )}
    </div>
  );
}

export function ResultsTable({ data }: ResultsTableProps) {
  const [activeTab, setActiveTab] = useState(data.semesters.length > 0 ? `sem-${data.semesters[0]}` : "cumulative");

  return (
    <div className="glass-card rounded-xl overflow-hidden animate-fade-up-delay-2">
      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <div className="p-4 border-b border-border">
          <TabsList className="w-full justify-start overflow-x-auto">
            {data.semesters.map(sem => (
              <TabsTrigger key={sem} value={`sem-${sem}`} className="text-xs">
                Semester {sem}
              </TabsTrigger>
            ))}
            <TabsTrigger value="cumulative" className="text-xs">
              Cumulative Arrears
            </TabsTrigger>
          </TabsList>
        </div>

        {data.semesters.map(sem => (
          <TabsContent key={sem} value={`sem-${sem}`} className="mt-0">
            <SemesterTable data={data} semester={sem} />
          </TabsContent>
        ))}
        <TabsContent value="cumulative" className="mt-0">
          <CumulativeTable data={data} />
        </TabsContent>
      </Tabs>
    </div>
  );
}
