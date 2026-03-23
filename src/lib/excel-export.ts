import * as XLSX from "xlsx";
import type { ParsedResults } from "./pdf-parser";

export function exportToExcel(data: ParsedResults, fileName = "arrears_analysis_report.xlsx") {
  const wb = XLSX.utils.book_new();

  // Sheet 1: Semester-wise Detailed Results
  for (const sem of data.semesters) {
    const codes = data.semesterSubjects[sem] || [];
    const headers = ["S.No", "Reg. Number", "Student Name", ...codes, "Arrears"];
    const rows: any[][] = [];

    const semStudents = data.students.filter(s => s.semesters.some(ss => ss.semester === sem));
    semStudents.forEach((s, i) => {
      const semData = s.semesters.find(ss => ss.semester === sem);
      const grades = codes.map(code => {
        const subj = semData?.subjects.find(x => x.code === code);
        return subj ? subj.grade : "";
      });
      const arrears = semData?.subjects.filter(x => x.status === "Arrear").length || 0;
      rows.push([i + 1, s.regNo, s.name, ...grades, arrears]);
    });

    const ws = XLSX.utils.aoa_to_sheet([headers, ...rows]);
    ws["!cols"] = headers.map(h => ({ wch: Math.max(String(h).length + 2, 12) }));
    XLSX.utils.book_append_sheet(wb, ws, `Sem ${sem}`);
  }

  // Sheet: Arrears Summary
  const summaryHeaders = ["S.No", "Reg. Number", "Student Name", "Total Arrears", "Arrear Subjects (Code - Semester)"];
  const arrearsStudents = data.students.filter(s => s.totalArrears > 0);
  const summaryRows = arrearsStudents.map((s, i) => [
    i + 1,
    s.regNo,
    s.name,
    s.totalArrears,
    s.arrearSubjects.map(a => `${a.code} (Sem ${a.semester})`).join(", "),
  ]);
  const ws2 = XLSX.utils.aoa_to_sheet([summaryHeaders, ...summaryRows]);
  ws2["!cols"] = [{ wch: 6 }, { wch: 16 }, { wch: 22 }, { wch: 14 }, { wch: 50 }];
  XLSX.utils.book_append_sheet(wb, ws2, "Arrears Summary");

  // Sheet: GPA / CGPA (all-clear students only)
  const clearStudents = data.students.filter(s => s.totalArrears === 0 && s.cgpa !== undefined);
  const gpaHeaders = ["S.No", "Reg. Number", "Student Name", ...data.semesters.map(s => `Sem ${s} GPA`), "CGPA"];
  const gpaRows = clearStudents
    .sort((a, b) => (b.cgpa || 0) - (a.cgpa || 0))
    .map((s, i) => {
      const semGpas = data.semesters.map(sem => {
        const semData = s.semesters.find(ss => ss.semester === sem);
        return semData?.gpa ?? "";
      });
      return [i + 1, s.regNo, s.name, ...semGpas, s.cgpa ?? ""];
    });
  const wsGpa = XLSX.utils.aoa_to_sheet([gpaHeaders, ...gpaRows]);
  wsGpa["!cols"] = gpaHeaders.map(h => ({ wch: Math.max(String(h).length + 2, 14) }));
  XLSX.utils.book_append_sheet(wb, wsGpa, "GPA CGPA");

  // Sheet: Cumulative History
  const histHeaders = ["S.No", "Reg. Number", "Student Name", ...data.semesters.map(s => `Sem ${s} Arrears`), "Total Arrears", "Status"];
  const histRows = data.students.map((s, i) => {
    const semArrears = data.semesters.map(sem => {
      const semData = s.semesters.find(ss => ss.semester === sem);
      return semData?.subjects.filter(x => x.status === "Arrear").length || 0;
    });
    return [
      i + 1, s.regNo, s.name, ...semArrears, s.totalArrears,
      s.totalArrears > 0 ? "Has Arrears" : "All Clear",
    ];
  });
  const ws3 = XLSX.utils.aoa_to_sheet([histHeaders, ...histRows]);
  ws3["!cols"] = histHeaders.map(h => ({ wch: Math.max(String(h).length + 2, 14) }));
  XLSX.utils.book_append_sheet(wb, ws3, "Cumulative History");

  // Sheet: Statistics
  const clearCount = data.students.length - arrearsStudents.length;
  const statsData: any[][] = [
    ["Class Arrears Analysis Report"],
    [],
    ["Institution", data.institution],
    ["Branch", data.branch],
    ["Examination", data.examination],
    [],
    ["Total Students", data.students.length],
    ["Students with Arrears", arrearsStudents.length],
    ["Students All Clear", clearCount],
    ["Total Class Arrears", data.totalClassArrears],
    ["Pass Percentage", `${(clearCount / Math.max(data.students.length, 1) * 100).toFixed(1)}%`],
    [],
    ["Semester-wise Arrear Count"],
    ["Semester", "Subject Code", "Arrear Count", "Pass %"],
  ];

  for (const sem of data.semesters) {
    const codes = data.semesterSubjects[sem] || [];
    for (const code of codes) {
      const failCount = data.students.filter(s => {
        const semData = s.semesters.find(ss => ss.semester === sem);
        return semData?.subjects.find(x => x.code === code)?.status === "Arrear";
      }).length;
      const total = data.students.filter(s => s.semesters.some(ss => ss.semester === sem && ss.subjects.some(x => x.code === code))).length;
      const passCount = total - failCount;
      statsData.push([`Sem ${sem}`, code, failCount, total > 0 ? `${(passCount / total * 100).toFixed(1)}%` : "N/A"]);
    }
  }

  const ws4 = XLSX.utils.aoa_to_sheet(statsData);
  ws4["!cols"] = [{ wch: 24 }, { wch: 18 }, { wch: 14 }, { wch: 14 }];
  XLSX.utils.book_append_sheet(wb, ws4, "Statistics");

  XLSX.writeFile(wb, fileName);
}
