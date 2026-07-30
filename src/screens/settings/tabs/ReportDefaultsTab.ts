export interface ReportDefaults {
  entity_name: string;
  regular_fund_cluster: string;
  regular_bank_name: string;
  special_fund_cluster: string;
  special_bank_name: string;
  tf_fund_cluster: string;
  tf_bank_name: string;
  prepared_by_name: string;
  prepared_by_position: string;
  certified_by_name: string;
  certified_by_position: string;
}

const STORAGE_KEY = "efas_report_defaults";

const EMPTY_DEFAULTS: ReportDefaults = {
  entity_name: "",
  regular_fund_cluster: "",
  regular_bank_name: "",
  special_fund_cluster: "",
  special_bank_name: "",
  tf_fund_cluster: "",
  tf_bank_name: "",
  prepared_by_name: "",
  prepared_by_position: "",
  certified_by_name: "",
  certified_by_position: "",
};

export function loadReportDefaults(): ReportDefaults {
  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    return saved
      ? { ...EMPTY_DEFAULTS, ...JSON.parse(saved) as Partial<ReportDefaults> }
      : { ...EMPTY_DEFAULTS };
  } catch {
    return { ...EMPTY_DEFAULTS };
  }
}

export function saveReportDefaults(defaults: ReportDefaults): void {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(defaults));
}
