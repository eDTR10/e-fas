import { NTCA, FundCluster } from "./ntcaApi";

export interface ParseResult {
  rows: ParsedLedgerRow[];
  // Extra "Date / ADA" blocks found in the pasted text that were NOT
  // included because no secondaryBlockNcaNo was supplied — surfaced so
  // the UI can warn "found N more rows, fill in the NCA field to include
  // them" instead of silently importing an incomplete picture.
  undetectedSecondaryBlocks: number;
  undetectedSecondaryRows: number;
  // Set when secondary blocks WERE found and merged in, either because an
  // explicit NCA No. was supplied or one was confidently auto-detected —
  // surfaced so the UI can confirm what happened rather than merging
  // silently.
  includedSecondaryBlocks: number;
  includedSecondaryRows: number;
  secondaryNcaUsed: string | null;
}

export interface ParsedLedgerRow {
  rowNumber: number;
  rawDate: string;
  rawNtca: string;
  rawAda: string;
  rawAmount: string;
  particulars: string;
  date: string | null;
  ntcaMatch: NTCA | null;
  adaNo: string;
  amount: number | null;
  issues: string[];
  // True when rawNtca doesn't match any NTCA record in this fund cluster at
  // all — an "advance" disbursement, paid before its NCA has been received/
  // logged yet. Unlike a real issue, this doesn't block import: the row is
  // still sent, just with no `ntca` link (see NtcaDisbursement.ntca in the
  // backend model) and rawNtca preserved for the UI to flag red.
  advance: boolean;
}

const HEADER_SCAN_WINDOW = 3;
const STOP_KEYWORDS = ["sub-total", "subtotal", "total ntca", "balance as of", "balance forwarded"];

function normalizeCell(value: string | undefined): string {
  return (value ?? "").replace(/ /g, " ").trim();
}

// "NTCA#1647", "NTCA #1647", "1647" all match the same underlying record —
// only the digits carry meaning. Leading zeros are stripped too: the sheet
// writes "NTCA#0771" but the NTCA record's own NCA No. is stored as "771".
function normalizeNtcaNo(value: string): string {
  const digits = value.replace(/[^0-9]/g, "");
  return digits.replace(/^0+(?=\d)/, "");
}

// Matches the backend's own normalization (NtcaDisbursementSerializer.
// _normalize_ada_no): strip a leading "#", and strip leading zeros off a
// purely numeric value so "#002", "002", and "2" all compare equal.
function normalizeAdaNo(value: string): string {
  const trimmed = value.trim().replace(/^#/, "").trim();
  if (/^\d+$/.test(trimmed)) return String(Number(trimmed));
  return trimmed;
}

function parseLedgerDate(raw: string): string | null {
  const value = raw.trim();
  if (!value) return null;
  const match = value.match(/^(\d{1,2})[/\-](\d{1,2})[/\-](\d{2,4})$/);
  if (match) {
    const [, m, d, y] = match;
    const year = y.length === 2 ? 2000 + Number(y) : Number(y);
    const month = Number(m);
    const day = Number(d);
    if (month >= 1 && month <= 12 && day >= 1 && day <= 31) {
      return `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
    }
  }
  const isoMatch = value.match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/);
  if (isoMatch) {
    const [, y, m, d] = isoMatch;
    return `${y}-${m.padStart(2, "0")}-${d.padStart(2, "0")}`;
  }
  return null;
}

function parseLedgerAmount(raw: string): number | null {
  const cleaned = raw.replace(/[₱$,\s]/g, "").trim();
  if (!cleaned) return null;
  const negative = /^\(.*\)$/.test(cleaned);
  const numeric = cleaned.replace(/[()]/g, "");
  if (!/^-?\d+(\.\d+)?$/.test(numeric)) return null;
  const value = Number(numeric);
  if (!Number.isFinite(value)) return null;
  return negative ? -value : value;
}

interface HeaderMatch {
  rowIndex: number;
  dateCol: number;
  ntcaCol: number; // -1 for a secondary block with no NTCA column of its own
  adaCol: number;
  amountCol: number;
  particularsCol: number;
}

// "NTCA#0771", "NTCA #0771" — same signal normalizeNtcaNo() strips down to
// digits, used here just to recognize the column, not to read a value.
function looksLikeNtcaValue(value: string): boolean {
  return /ntca\s*#?\s*\d+/i.test(value);
}

// ADA numbers in these sheets are consistently "#329" — a bare "#" plus a
// short run of digits, no commas or decimal point (which is what tells
// this apart from an Amount column sitting right next to it).
function looksLikeAdaValue(value: string): boolean {
  return /^#\s*\d{1,6}$/.test(value.trim());
}

// Scans a handful of data rows below a candidate header row and returns
// whichever column in [fromCol, toCol] has the most cells matching
// `matcher` — used when a sheet's header row is missing a label (some
// months drop "NTCA" entirely, see findHeaderRow) so the column still gets
// found from what's actually sitting in it.
function detectColumnByValues(
  grid: string[][],
  headerRowIndex: number,
  fromCol: number,
  toCol: number,
  matcher: (value: string) => boolean,
  sampleRows = 8,
): number {
  let bestCol = -1;
  let bestMatches = 0;
  for (let c = Math.max(fromCol, 0); c <= toCol; c++) {
    let matches = 0;
    let seen = 0;
    for (let r = headerRowIndex + 1; r < grid.length && r < headerRowIndex + 1 + sampleRows; r++) {
      const cell = normalizeCell(grid[r][c]);
      if (!cell) continue;
      seen += 1;
      if (matcher(cell)) matches += 1;
    }
    if (seen > 0 && matches > bestMatches && matches / seen >= 0.5) {
      bestMatches = matches;
      bestCol = c;
    }
  }
  return bestCol;
}

function findHeaderRow(grid: string[][]): HeaderMatch | null {
  for (let r = 0; r < grid.length; r++) {
    const row = grid[r];
    for (let c = 0; c < row.length; c++) {
      if (normalizeCell(row[c]).toLowerCase() !== "date") continue;

      let ntcaCol = -1;
      for (let k = c + 1; k <= c + HEADER_SCAN_WINDOW && k < row.length; k++) {
        if (normalizeCell(row[k]).toLowerCase() === "ntca") { ntcaCol = k; break; }
      }
      // Some months' header row drops the "NTCA" label even though the
      // column is right there — fall back to recognizing "NTCA#nnnn"
      // values in the data itself.
      if (ntcaCol === -1) {
        ntcaCol = detectColumnByValues(grid, r, c + 1, c + HEADER_SCAN_WINDOW + 2, looksLikeNtcaValue);
      }
      if (ntcaCol === -1) continue;

      let adaCol = -1;
      for (let k = ntcaCol + 1; k <= ntcaCol + HEADER_SCAN_WINDOW && k < row.length; k++) {
        if (normalizeCell(row[k]).toLowerCase() === "ada") { adaCol = k; break; }
      }
      if (adaCol === -1) {
        adaCol = detectColumnByValues(grid, r, ntcaCol + 1, ntcaCol + HEADER_SCAN_WINDOW + 1, looksLikeAdaValue);
      }
      if (adaCol === -1) continue;

      // Amount/particulars are usually unlabeled in these sheets — they're
      // just the next two columns after ADA. Only trust an explicit header
      // if one is actually there.
      let amountCol = adaCol + 1;
      let particularsCol = adaCol + 2;
      for (let k = adaCol + 1; k <= adaCol + HEADER_SCAN_WINDOW && k < row.length; k++) {
        const label = normalizeCell(row[k]).toLowerCase();
        if (label === "amount" || label === "total") { amountCol = k; particularsCol = k + 1; break; }
      }
      return { rowIndex: r, dateCol: c, ntcaCol, adaCol, amountCol, particularsCol };
    }
  }
  return null;
}

// Some months split a single NCA's disbursements across three or more
// side-by-side blocks on the same sheet (a primary Date/NTCA/ADA block
// plus one or more further "Date / Balance forwarded/ADA" blocks with no
// NTCA column of their own) — find every one of them, not just the first.
// Detection always runs regardless of whether an NCA No. override was
// supplied (see parseNtcaLedgerPaste's undetectedSecondaryBlocks), but
// rows only get merged into the import when it was, so a sheet's
// unrelated "Summary" mini-table (seen on another month, restating
// existing entries rather than adding new ones) never gets misread as
// new data by default.
function findSecondaryAdaBlocks(grid: string[][], excludeDateCol: number): HeaderMatch[] {
  const blocks: HeaderMatch[] = [];
  for (let r = 0; r < grid.length; r++) {
    const row = grid[r];
    for (let c = 0; c < row.length; c++) {
      if (c === excludeDateCol) continue;
      if (blocks.some((b) => b.dateCol === c)) continue;
      if (normalizeCell(row[c]).toLowerCase() !== "date") continue;

      let adaCol = -1;
      for (let k = c + 1; k <= c + HEADER_SCAN_WINDOW && k < row.length; k++) {
        if (normalizeCell(row[k]).toLowerCase() === "ada") { adaCol = k; break; }
      }
      if (adaCol === -1) {
        adaCol = detectColumnByValues(grid, r, c + 1, c + HEADER_SCAN_WINDOW, looksLikeAdaValue);
      }
      if (adaCol === -1) continue;

      let amountCol = adaCol + 1;
      let particularsCol = adaCol + 2;
      for (let k = adaCol + 1; k <= adaCol + HEADER_SCAN_WINDOW && k < row.length; k++) {
        const label = normalizeCell(row[k]).toLowerCase();
        if (label === "amount" || label === "total") { amountCol = k; particularsCol = k + 1; break; }
      }
      blocks.push({ rowIndex: r, dateCol: c, ntcaCol: -1, adaCol, amountCol, particularsCol });
    }
  }
  return blocks;
}

function rowLooksLikeStop(row: string[], header: HeaderMatch): boolean {
  const anyCellStop = row.some((cell) => {
    const lower = normalizeCell(cell).toLowerCase();
    return lower && STOP_KEYWORDS.some((kw) => lower.includes(kw));
  });
  if (anyCellStop) return true;
  const ntca = header.ntcaCol >= 0 ? normalizeCell(row[header.ntcaCol]) : "";
  const ada = normalizeCell(row[header.adaCol]);
  const amount = normalizeCell(row[header.amountCol]);
  return !ntca && !ada && !amount;
}

interface RawRow {
  effectiveRawDate: string;
  rawNtca: string;
  rawAda: string;
  rawAmount: string;
  particulars: string;
}

function extractBlockRows(grid: string[][], header: HeaderMatch, ncaOverride?: string): RawRow[] {
  const rows: RawRow[] = [];
  let lastDate = "";
  for (let r = header.rowIndex + 1; r < grid.length; r++) {
    const row = grid[r];
    if (rowLooksLikeStop(row, header)) break;

    const rawDate = normalizeCell(row[header.dateCol]);
    const rawNtca = ncaOverride ?? normalizeCell(row[header.ntcaCol]);
    const rawAda = normalizeCell(row[header.adaCol]);
    const rawAmount = normalizeCell(row[header.amountCol]);
    const particulars = normalizeCell(row[header.particularsCol]);

    const isEmpty = ncaOverride ? (!rawAda && !rawAmount) : (!rawNtca && !rawAda && !rawAmount);
    if (isEmpty) continue;

    // Date is merged/blank on continuation rows in the source sheet —
    // carry the last real date forward rather than treating it as missing.
    const effectiveRawDate = rawDate || lastDate;
    if (rawDate) lastDate = rawDate;

    rows.push({ effectiveRawDate, rawNtca, rawAda, rawAmount, particulars });
  }
  return rows;
}

// Builds the existingAdaNumbersByYear lookup parseNtcaLedgerPaste expects,
// from whatever disbursements are already on file (any fund cluster — ADA
// numbers are shared across all three).
export function buildExistingAdaIndex(disbursements: { date: string; ada_no: string }[]): Map<number, Set<string>> {
  const index = new Map<number, Set<string>>();
  for (const entry of disbursements) {
    if (!entry.ada_no || !entry.date) continue;
    const year = Number(entry.date.slice(0, 4));
    const set = index.get(year) ?? new Set<string>();
    set.add(normalizeAdaNo(entry.ada_no));
    index.set(year, set);
  }
  return index;
}

export function parseNtcaLedgerPaste(
  text: string,
  ntcaList: NTCA[],
  fundCluster: FundCluster,
  // Normalized ADA numbers already used, keyed by year — ADA numbers are
  // shared across every fund cluster and are unique per year, so a row
  // whose number is already taken would be rejected at import time even
  // though its balance/date checks pass; catching it here means "Ready"
  // actually means importable, not just balance-valid.
  existingAdaNumbersByYear: Map<number, Set<string>> = new Map(),
  // NCA No. to assume for a second Date/ADA block with no NTCA column of
  // its own, if the pasted range has one — see findSecondaryAdaBlocks.
  secondaryBlockNcaNo?: string,
): ParseResult {
  const grid = text
    .replace(/\r\n/g, "\n")
    .split("\n")
    .map((line) => line.split("\t"));

  const header = findHeaderRow(grid);
  if (!header) {
    return {
      rows: [], undetectedSecondaryBlocks: 0, undetectedSecondaryRows: 0,
      includedSecondaryBlocks: 0, includedSecondaryRows: 0, secondaryNcaUsed: null,
    };
  }

  // The sheet's "NTCA#1647" cell is actually the NCA No. (e.g. "1647"),
  // not the NTCA No. (e.g. "26-03-012") — match against nca_no. One NCA
  // No. commonly spans many separate NTCA "tranches" (each its own
  // receipt, with its own date and amount) that the sheet — and the real
  // bookkeeping — treats as a single pooled balance, not tracked
  // per-tranche. Every row for that NCA No. links to the same
  // representative tranche (the earliest one — which specific tranche it
  // is doesn't matter, the backend validates against the pooled group,
  // not that one tranche's own amount) and draws against the sum of
  // whichever sibling tranches were already received by that row's own
  // date — a later tranche can't fund an earlier row just because it'll
  // eventually arrive.
  const poolsByNo = new Map<string, { representative: NTCA; siblings: NTCA[]; usedInBatch: number }>();
  for (const ntca of ntcaList) {
    if (ntca.fund_cluster !== fundCluster) continue;
    const key = normalizeNtcaNo(ntca.nca_no);
    if (!key) continue;
    const existing = poolsByNo.get(key);
    if (!existing) {
      poolsByNo.set(key, { representative: ntca, siblings: [ntca], usedInBatch: 0 });
    } else {
      existing.siblings.push(ntca);
      if (ntca.date_of_ntca < existing.representative.date_of_ntca) {
        existing.representative = ntca;
      }
    }
  }

  const rawRows: RawRow[] = extractBlockRows(grid, header);

  // A headerless secondary block (see findSecondaryAdaBlocks) has no NCA
  // No. of its own to read — default to whichever NCA No. is dominant in
  // the primary block (the one that actually appears in an "NTCA#nnnn"
  // column), since in practice a sheet split across extra blocks is
  // always still just one NCA's disbursements laid out side by side. An
  // explicit secondaryBlockNcaNo always wins when given, for the rare
  // sheet where that assumption doesn't hold. A restated "Summary" block
  // repeating already-counted ADA numbers isn't a real risk here either:
  // the ADA-duplicate check below would flag those rows rather than
  // double-count them.
  const ncaFrequency = new Map<string, number>();
  for (const row of rawRows) {
    const key = normalizeNtcaNo(row.rawNtca);
    if (!key) continue;
    ncaFrequency.set(key, (ncaFrequency.get(key) ?? 0) + 1);
  }
  let dominantNca: string | null = null;
  let dominantCount = 0;
  for (const [key, count] of ncaFrequency) {
    if (count > dominantCount) { dominantNca = key; dominantCount = count; }
  }
  const effectiveSecondaryNca = (secondaryBlockNcaNo?.trim()) || dominantNca || "";

  const secondaryHeaders = findSecondaryAdaBlocks(grid, header.dateCol);
  const secondaryRowSets = secondaryHeaders.map((h) => extractBlockRows(grid, h, effectiveSecondaryNca || " "));

  let undetectedSecondaryBlocks = 0;
  let undetectedSecondaryRows = 0;
  let includedSecondaryBlocks = 0;
  let includedSecondaryRows = 0;
  if (effectiveSecondaryNca) {
    for (const rows of secondaryRowSets) rawRows.push(...rows);
    includedSecondaryBlocks = secondaryRowSets.filter((rows) => rows.length > 0).length;
    includedSecondaryRows = secondaryRowSets.reduce((sum, rows) => sum + rows.length, 0);
  } else {
    undetectedSecondaryBlocks = secondaryRowSets.filter((rows) => rows.length > 0).length;
    undetectedSecondaryRows = secondaryRowSets.reduce((sum, rows) => sum + rows.length, 0);
  }

  // Two blocks' rows need to interleave by actual date, not "all of block
  // 1 then all of block 2" — the pool simulation and ADA-duplicate check
  // below both depend on processing rows in the order the money actually
  // moved, regardless of which block a row physically came from.
  const orderedRows = rawRows
    .map((row, originalIndex) => ({ row, originalIndex, parsedDate: parseLedgerDate(row.effectiveRawDate) }))
    .sort((a, b) => (a.parsedDate ?? "").localeCompare(b.parsedDate ?? "") || a.originalIndex - b.originalIndex);

  const results: ParsedLedgerRow[] = [];
  const usedAdaByYear = new Map<number, Set<string>>();
  let rowNumber = 0;

  for (const { row, parsedDate } of orderedRows) {
    const { effectiveRawDate, rawNtca, rawAda, rawAmount, particulars } = row;
    rowNumber += 1;
    const date = parsedDate;
    const amount = parseLedgerAmount(rawAmount);
    const adaNo = normalizeAdaNo(rawAda);

    // Checked before touching the pool: a row that can't actually be
    // imported (its ADA number is already taken) shouldn't consume
    // simulated balance, or a later legitimate row could get wrongly
    // flagged as insufficient because of a draw that will never happen.
    let adaDuplicateYear: number | null = null;
    if (date && adaNo) {
      const year = Number(date.slice(0, 4));
      const existingSet = existingAdaNumbersByYear.get(year);
      const batchSet = usedAdaByYear.get(year) ?? new Set<string>();
      if (existingSet?.has(adaNo) || batchSet.has(adaNo)) {
        adaDuplicateYear = year;
      } else {
        batchSet.add(adaNo);
        usedAdaByYear.set(year, batchSet);
      }
    }

    const normalizedNtca = normalizeNtcaNo(rawNtca);
    const pool = poolsByNo.get(normalizedNtca);
    let ntcaMatch: NTCA | null = null;
    let availableAsOfDate = 0;
    if (date && pool && adaDuplicateYear === null) {
      const requiredAmount = amount ?? 0;
      const receivedByDate = pool.siblings
        .filter((s) => s.date_of_ntca <= date)
        .reduce((sum, s) => sum + (Number(s.remaining_balance) || 0), 0);
      availableAsOfDate = receivedByDate - pool.usedInBatch;
      if (availableAsOfDate >= requiredAmount - 0.004) {
        ntcaMatch = pool.representative;
        if (amount !== null) pool.usedInBatch += amount;
      }
    }

    const issues: string[] = [];
    // Genuinely no NTCA record for this NCA No. yet is NOT a blocker — the
    // row still imports as an advance disbursement (see the `advance` flag
    // on ParsedLedgerRow). A record that *does* exist but can't cover the
    // amount (not received yet as of this date, or insufficient overall)
    // stays a real, blocking issue — that's an actual balance problem, not
    // just a timing/ordering one.
    let advance = false;
    if (!effectiveRawDate || !date) issues.push("Missing or unparseable date");
    if (!rawNtca) issues.push("Missing NCA number");
    else if (!pool) advance = true;
    else if (adaDuplicateYear !== null) { /* reported below, don't also report a balance issue for a row that was never simulated */ }
    else if (!ntcaMatch && date && availableAsOfDate <= 0) issues.push(`NCA "${rawNtca}" wasn't received yet as of ${date}`);
    else if (!ntcaMatch && date) issues.push(`NCA "${rawNtca}" doesn't have enough combined balance left as of ${date}`);
    if (adaDuplicateYear !== null) issues.push(`ADA number "${rawAda}" is already used in ${adaDuplicateYear}`);
    if (!rawAda) issues.push("Missing ADA number");
    if (amount === null || amount <= 0) issues.push("Missing or invalid amount");

    results.push({
      rowNumber,
      rawDate: effectiveRawDate,
      rawNtca,
      rawAda,
      rawAmount,
      particulars,
      date,
      ntcaMatch,
      adaNo,
      amount,
      issues,
      advance,
    });
  }

  return {
    rows: results,
    undetectedSecondaryBlocks,
    undetectedSecondaryRows,
    includedSecondaryBlocks,
    includedSecondaryRows,
    secondaryNcaUsed: includedSecondaryBlocks > 0 ? effectiveSecondaryNca : null,
  };
}
