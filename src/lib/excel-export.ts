import * as XLSX from "xlsx";
import type { ParsedResults } from "./pdf-parser";

export function exportToExcel(data: ParsedResults, fileName = "student_arrears_report.xlsx") {
  const wb = XLSX.utils.book_new();

  // Sheet 1: Detailed Results
  const detailHeaders = ["S.No", "Roll No", "Student Name", ...data.subjectNames, "Total Marks", "Arrear Count", "Status"];
  const detailData = data.students.map((s, i) => {
    const subjectMarks = data.subjectNames.map(subName => {
      const sub = s.subjects.find(x => x.name === subName);
      return sub ? sub.marks : "-";
    });
    return [
      i + 1,
      s.rollNo,
      s.name,
      ...subjectMarks,
      s.totalMarks,
      s.arrearCount,
      s.arrearCount > 0 ? "Has Arrears" : "All Clear",
    ];
  });

  const ws1 = XLSX.utils.aoa_to_sheet([detailHeaders, ...detailData]);
  
  // Set column widths
  ws1["!cols"] = detailHeaders.map((h) => ({ wch: Math.max(h.length + 2, 14) }));
  XLSX.utils.book_append_sheet(wb, ws1, "Detailed Results");

  // Sheet 2: Arrears Summary
  const summaryHeaders = ["S.No", "Roll No", "Student Name", "Arrear Count", "Arrear Subjects"];
  const arrearsStudents = data.students.filter(s => s.arrearCount > 0);
  const summaryData = arrearsStudents.map((s, i) => [
    i + 1,
    s.rollNo,
    s.name,
    s.arrearCount,
    s.subjects.filter(x => x.status !== "Pass").map(x => x.name).join(", "),
  ]);

  const ws2 = XLSX.utils.aoa_to_sheet([summaryHeaders, ...summaryData]);
  ws2["!cols"] = summaryHeaders.map((h) => ({ wch: Math.max(h.length + 2, 18) }));
  XLSX.utils.book_append_sheet(wb, ws2, "Arrears Summary");

  // Sheet 3: Class Statistics
  const statsData = [
    ["Class Arrears Report"],
    [],
    ["Total Students", data.students.length],
    ["Students with Arrears", arrearsStudents.length],
    ["Students All Clear", data.students.length - arrearsStudents.length],
    ["Total Class Arrears", data.totalClassArrears],
    ["Pass Percentage", `${((data.students.length - arrearsStudents.length) / Math.max(data.students.length, 1) * 100).toFixed(1)}%`],
    [],
    ["Subject-wise Arrears"],
    ["Subject", "Fail Count", "Pass Count", "Pass %"],
    ...data.subjectNames.map(subName => {
      const failCount = data.students.filter(s => s.subjects.find(x => x.name === subName)?.status !== "Pass").length;
      const passCount = data.students.length - failCount;
      return [subName, failCount, passCount, `${(passCount / Math.max(data.students.length, 1) * 100).toFixed(1)}%`];
    }),
  ];

  const ws3 = XLSX.utils.aoa_to_sheet(statsData);
  ws3["!cols"] = [{ wch: 24 }, { wch: 14 }, { wch: 14 }, { wch: 14 }];
  XLSX.utils.book_append_sheet(wb, ws3, "Statistics");

  XLSX.writeFile(wb, fileName);
}