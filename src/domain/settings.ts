export type DateFormat = "MDY" | "DMY" | "YMD" | "DMY_DOT";
export type TimeFormat = "24h" | "12h";
export type FloatStyle = "trailingDot" | "pointZero" | "fixed";

/** Everything that affects how values are displayed and parsed from user input. */
export interface FormatSettings {
  dateFormat: DateFormat;
  timeFormat: TimeFormat;
  floatStyle: FloatStyle;
  floatDecimals: number;
  thousandsSeparator: boolean;
}

export type PgIntType = "int2" | "int4" | "int8";
export type PgFloatType = "float4" | "float8" | "numeric";
export type PgStringType = "text" | "varchar";

export interface PostgresTypeSettings {
  int: PgIntType;
  float: PgFloatType;
  string: PgStringType;
}

export type Theme = "system" | "light" | "dark";
export type Density = "compact" | "comfortable";

export interface ExportDefaults {
  csvDelimiter: string;
  jsonPretty: boolean;
}

export interface AppSettings {
  format: FormatSettings;
  tabsEnabled: boolean;
  postgres: PostgresTypeSettings;
  exportDefaults: ExportDefaults;
  theme: Theme;
  density: Density;
  confirmPermanentDelete: boolean;
}

export const DEFAULT_FORMAT: FormatSettings = {
  dateFormat: "MDY",
  timeFormat: "24h",
  floatStyle: "trailingDot",
  floatDecimals: 2,
  thousandsSeparator: false,
};

export const DEFAULT_SETTINGS: AppSettings = {
  format: DEFAULT_FORMAT,
  tabsEnabled: true,
  postgres: { int: "int4", float: "float4", string: "text" },
  exportDefaults: { csvDelimiter: ",", jsonPretty: true },
  theme: "system",
  density: "compact",
  confirmPermanentDelete: true,
};

export const DATE_FORMAT_LABELS: Record<DateFormat, string> = {
  MDY: "MM/DD/YYYY",
  DMY: "DD/MM/YYYY",
  YMD: "YYYY-MM-DD",
  DMY_DOT: "DD.MM.YYYY",
};
