import ExcelJS from "exceljs";
import { saveAs } from "file-saver";

// Builds the official government RADAI/RCI worksheet layout (GAM Appendix
// 13-RX style — title block, period/entity/fund-cluster header, a merged
// two-row table header, data rows, total, and a Prepared By/Certification
// footer with signature lines). This is a from-scratch reimplementation of
// that template (not a reuse of the old, unwired screens/reports/reportGenerator.ts)
// so it can consume our own backend-sourced report rows directly.

export interface WorkbookEntry {
  date: string;
  serial_no: string;
  dv_payroll_no: string;
  ors_burs_no: string;
  responsibility_center_code: string;
  payee: string;
  uacs_object_code: string;
  nature_of_payment: string;
  amount: string;
}

interface SheetOptions {
  topRightLabel: string;
  title: string;
  subtypeLabel: string;
  period: string;
  entityName: string;
  fundCluster: string;
  bankNameAcctNo: string;
  reportNo: string;
  sheetNo: string;
  entries: WorkbookEntry[];
  totalLabel: string;
  preparedByName: string;
  preparedByPosition: string;
  certifiedByName: string;
  certifiedByPosition: string;
  certificationLine2: string;
}

function parseAmt(v: string | number): number {
  if (typeof v === "number") return v;
  return String(v).split("\n").map((l) => parseFloat(l.trim().replace(/,/g, "")) || 0).reduce((s, n) => s + n, 0);
}

function fmtAmt(v: string | number): string {
  return parseAmt(v).toLocaleString("en-PH", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function lineCount(v: string | number): number {
  return String(v).split("\n").filter(Boolean).length || 1;
}

function fmtDate(d: string): string {
  if (!d) return "";
  const dt = new Date(`${d}T00:00:00`);
  if (Number.isNaN(dt.getTime())) return d;
  return `${(dt.getMonth() + 1).toString().padStart(2, "0")}/${dt.getDate().toString().padStart(2, "0")}/${dt.getFullYear()}`;
}

const thinBorder = () => { const s = { style: "thin" as const }; return { top: s, bottom: s, left: s, right: s }; };
const medBorder = () => { const s = { style: "medium" as const }; return { top: s, bottom: s, left: s, right: s }; };
const centerAlign = (wrap = false) => ({ horizontal: "center" as const, vertical: "middle" as const, wrapText: wrap });
const leftAlign = (wrap = false) => ({ horizontal: "left" as const, vertical: "middle" as const, wrapText: wrap });
const rightAlign = () => ({ horizontal: "right" as const, vertical: "middle" as const });
const boldFont = (size = 11) => ({ bold: true, size, name: "Times New Roman" });
const normalFont = (size = 11) => ({ size, name: "Times New Roman" });
const mergeRange = (ws: ExcelJS.Worksheet, a: string, b: string) => ws.mergeCells(`${a}:${b}`);
const HEADER_FILL: ExcelJS.Fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFD9E1F2" } };

function buildWorksheet(ws: ExcelJS.Worksheet, opts: SheetOptions) {
  ws.columns = [
    { width: 13 }, { width: 19 }, { width: 18 }, { width: 28 }, { width: 20 },
    { width: 22 }, { width: 16 }, { width: 38 }, { width: 16 },
  ];

  const r1 = ws.addRow(["", "", "", "", "", "", "", "", opts.topRightLabel]);
  r1.height = 14;
  r1.getCell("I").font = normalFont(10);
  r1.getCell("I").alignment = rightAlign();

  ws.addRow([]).height = 4;

  const r3 = ws.addRow([""]);
  r3.height = 20;
  mergeRange(ws, "B3", "I3");
  r3.getCell("B").value = opts.title;
  r3.getCell("B").font = boldFont(14);
  r3.getCell("B").alignment = centerAlign();

  const r4 = ws.addRow([""]);
  r4.height = 14;
  r4.getCell("D").value = "Period Covered:";
  r4.getCell("D").font = normalFont(10);
  r4.getCell("D").alignment = rightAlign();
  mergeRange(ws, "E4", "F4");
  r4.getCell("E").value = opts.period;
  r4.getCell("E").font = { ...normalFont(10), underline: true };
  r4.getCell("E").alignment = centerAlign();
  r4.getCell("E").border = { bottom: { style: "thin" } };

  ws.addRow([]).height = 4;
  ws.addRow([]).height = 4;

  const r6 = ws.addRow(["Entity Name :"]);
  r6.height = 14;
  r6.getCell("A").font = normalFont(10);
  r6.getCell("A").alignment = leftAlign();
  mergeRange(ws, `C${r6.number}`, `H${r6.number}`);
  r6.getCell("C").value = opts.entityName;
  r6.getCell("C").font = normalFont(10);
  r6.getCell("C").alignment = leftAlign();

  const r7 = ws.addRow(["Fund Cluster :"]);
  r7.height = 14;
  r7.getCell("A").font = normalFont(10);
  mergeRange(ws, `C${r7.number}`, `F${r7.number}`);
  r7.getCell("C").value = opts.fundCluster;
  r7.getCell("C").font = normalFont(10);
  r7.getCell("H").value = "Report No.:";
  r7.getCell("H").font = normalFont(10);
  r7.getCell("H").alignment = rightAlign();
  r7.getCell("I").value = opts.reportNo;
  r7.getCell("I").font = { ...normalFont(10), underline: true };
  r7.getCell("I").border = { bottom: { style: "thin" } };
  r7.getCell("I").alignment = leftAlign();

  const r8 = ws.addRow(["Bank Name/ Account No. :"]);
  r8.height = 14;
  r8.getCell("A").font = normalFont(10);
  mergeRange(ws, `C${r8.number}`, `F${r8.number}`);
  r8.getCell("C").value = opts.bankNameAcctNo;
  r8.getCell("C").font = normalFont(10);
  r8.getCell("H").value = "Sheet No.:";
  r8.getCell("H").font = normalFont(10);
  r8.getCell("H").alignment = rightAlign();
  r8.getCell("I").value = opts.sheetNo;
  r8.getCell("I").font = { ...normalFont(10), underline: true };
  r8.getCell("I").border = { bottom: { style: "thin" } };
  r8.getCell("I").alignment = leftAlign();

  ws.addRow([]).height = 4;
  ws.addRow([]).height = 4;

  const r10 = ws.addRow([opts.subtypeLabel, "", "DV/Payroll No.", "ORS/BURS No.", "Responsibility\nCenter Code", "Payee", "UACS Object\nCode", "Nature of Payment", "Amount"]);
  r10.height = 30;
  const r11 = ws.addRow(["Date", "Serial No."]);
  r11.height = 18;

  mergeRange(ws, `A${r10.number}`, `B${r10.number}`);
  for (const col of ["C", "D", "E", "F", "G", "H", "I"]) {
    mergeRange(ws, `${col}${r10.number}`, `${col}${r11.number}`);
  }

  for (const col of ["A", "C", "D", "E", "F", "G", "H", "I"]) {
    const cell = r10.getCell(col);
    cell.font = boldFont(10);
    cell.alignment = centerAlign(true);
    cell.border = thinBorder();
    cell.fill = HEADER_FILL;
  }
  for (const col of ["A", "B"]) {
    const cell = r11.getCell(col);
    cell.font = boldFont(10);
    cell.alignment = centerAlign();
    cell.border = thinBorder();
    cell.fill = HEADER_FILL;
  }

  let totalAmount = 0;
  for (const e of opts.entries) {
    const amt = parseAmt(e.amount);
    totalAmount += amt;
    const amtLines = String(e.amount).split("\n").filter(Boolean);
    const amtCellValue = amtLines.length > 1 ? amtLines.map((l) => fmtAmt(parseFloat(l) || 0)).join("\n") : fmtAmt(amt);

    const dr = ws.addRow([
      fmtDate(e.date), e.serial_no, e.dv_payroll_no, e.ors_burs_no, e.responsibility_center_code,
      e.payee, e.uacs_object_code, e.nature_of_payment, amtCellValue,
    ]);
    const maxLines = Math.max(lineCount(e.ors_burs_no), lineCount(e.uacs_object_code), lineCount(e.amount));
    dr.height = Math.max(36, maxLines * 16);

    ["A", "B", "C", "D", "E", "F", "G", "H", "I"].forEach((col, i) => {
      const cell = dr.getCell(col);
      cell.font = normalFont(11);
      cell.border = thinBorder();
      if (i === 3 || i === 6) cell.alignment = centerAlign(true);
      else if (i === 7) cell.alignment = leftAlign(true);
      else if (i === 8) cell.alignment = { horizontal: "right", vertical: "top", wrapText: true };
      else cell.alignment = centerAlign(false);
    });
  }

  const totalRow = ws.addRow(["", "", "", "", "", "", "", opts.totalLabel, fmtAmt(totalAmount)]);
  totalRow.height = 16;
  for (const col of ["A", "B", "C", "D", "E", "F", "G"]) {
    totalRow.getCell(col).border = { top: { style: "thin" }, bottom: { style: "thin" } };
  }
  const totLbl = totalRow.getCell("H");
  totLbl.font = boldFont(10);
  totLbl.alignment = rightAlign();
  totLbl.border = thinBorder();
  const totVal = totalRow.getCell("I");
  totVal.font = boldFont(10);
  totVal.alignment = rightAlign();
  totVal.border = medBorder();

  ws.addRow([]).height = 8;
  ws.addRow([]).height = 6;

  const prepLbl = ws.addRow(["Prepared by:"]);
  prepLbl.getCell("A").font = normalFont(10);
  prepLbl.height = 14;

  ws.addRow([]).height = 14;
  ws.addRow([]).height = 14;

  const prepName = ws.addRow([opts.preparedByName]);
  prepName.getCell("A").font = boldFont(10);
  prepName.height = 14;
  const prepPos = ws.addRow([opts.preparedByPosition]);
  prepPos.getCell("A").font = normalFont(10);
  prepPos.height = 14;

  ws.addRow([]).height = 8;

  const certHdr = ws.addRow([]);
  certHdr.height = 18;
  mergeRange(ws, `E${certHdr.number}`, `G${certHdr.number}`);
  certHdr.getCell("E").value = "CERTIFICATION";
  certHdr.getCell("E").font = boldFont(13);
  certHdr.getCell("E").alignment = centerAlign();

  ws.addRow([]).height = 6;

  const cert1Row = ws.addRow([]);
  cert1Row.height = 14;
  mergeRange(ws, `B${cert1Row.number}`, `I${cert1Row.number}`);
  cert1Row.getCell("B").value = "I hereby certify on my official oath that the above is a true statement of all transactions issued by me during";
  cert1Row.getCell("B").font = normalFont(10);
  cert1Row.getCell("B").alignment = centerAlign(false);

  const cert2Row = ws.addRow([]);
  cert2Row.height = 14;
  mergeRange(ws, `B${cert2Row.number}`, `I${cert2Row.number}`);
  cert2Row.getCell("B").value = opts.certificationLine2;
  cert2Row.getCell("B").font = normalFont(10);
  cert2Row.getCell("B").alignment = centerAlign(false);

  ws.addRow([]).height = 8;
  ws.addRow([]).height = 14;

  const certName = ws.addRow([]);
  certName.height = 16;
  mergeRange(ws, `E${certName.number}`, `G${certName.number}`);
  certName.getCell("E").value = opts.certifiedByName;
  certName.getCell("E").font = boldFont(12);
  certName.getCell("E").alignment = centerAlign();

  const certLbl = ws.addRow([]);
  certLbl.height = 14;
  mergeRange(ws, `E${certLbl.number}`, `G${certLbl.number}`);
  certLbl.getCell("E").value = "Name and Signature of Disbursing Officer/Cashier";
  certLbl.getCell("E").font = normalFont(11);
  certLbl.getCell("E").alignment = centerAlign();

  const certPos = ws.addRow([]);
  certPos.height = 14;
  mergeRange(ws, `E${certPos.number}`, `G${certPos.number}`);
  certPos.getCell("E").value = opts.certifiedByPosition;
  certPos.getCell("E").font = boldFont(12);
  certPos.getCell("E").alignment = centerAlign();
}

export interface WorkbookGroupInput<T extends WorkbookEntry> {
  sheetName: string;
  subtypeLabel: string;
  entries: T[];
  meta: {
    entity_name: string;
    fund_cluster: string;
    bank_name_account_no: string;
    report_no: string;
    sheet_no: string;
    prepared_by_name: string;
    prepared_by_position: string;
    certified_by_name: string;
    certified_by_position: string;
  };
  certificationLine2: string;
}

export async function generateReportWorkbook<T extends WorkbookEntry>(
  kind: "radai" | "rci",
  period: string,
  topRightLabel: string,
  title: string,
  totalLabel: string,
  groups: WorkbookGroupInput<T>[]
): Promise<void> {
  const wb = new ExcelJS.Workbook();
  wb.creator = "eFAS";
  wb.created = new Date();

  for (const group of groups) {
    if (group.entries.length === 0) continue;
    const ws = wb.addWorksheet(group.sheetName, {
      pageSetup: { paperSize: 9, orientation: "landscape", fitToPage: true, fitToWidth: 1 },
    });
    buildWorksheet(ws, {
      topRightLabel, title, subtypeLabel: group.subtypeLabel, period,
      entityName: group.meta.entity_name,
      fundCluster: group.meta.fund_cluster,
      bankNameAcctNo: group.meta.bank_name_account_no,
      reportNo: group.meta.report_no,
      sheetNo: group.meta.sheet_no,
      entries: group.entries,
      totalLabel,
      preparedByName: group.meta.prepared_by_name,
      preparedByPosition: group.meta.prepared_by_position,
      certifiedByName: group.meta.certified_by_name,
      certifiedByPosition: group.meta.certified_by_position,
      certificationLine2: group.certificationLine2,
    });
  }

  if (wb.worksheets.length === 0) return;

  const buf = await wb.xlsx.writeBuffer();
  const filename = `${kind.toUpperCase()}_${(period || "report").replace(/[^a-zA-Z0-9]/g, "_")}.xlsx`;
  saveAs(new Blob([buf], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" }), filename);
}
