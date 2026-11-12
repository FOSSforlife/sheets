/** Core data model. Everything stored is plain JSON. */

export const COLUMN_TYPES = ["string", "int", "float", "bool", "date", "datetime"] as const;
export type ConcreteType = (typeof COLUMN_TYPES)[number];
export type ColumnType = ConcreteType | "untyped";

/**
 * A stored cell value.
 * - string/int/float/bool map to JS string/number/number/boolean
 * - date is an ISO `YYYY-MM-DD` string, datetime an ISO `YYYY-MM-DDTHH:mm:ss` string (naive, no zone)
 */
export type CellValue = string | number | boolean | null;

export interface Column {
  id: string;
  name: string;
  type: ColumnType;
  width?: number;
}

export interface Row {
  id: string;
  cells: Record<string, CellValue>;
}

/** The full contents of one table. */
export interface TableDoc {
  id: string;
  columns: Column[];
  rows: Row[];
}

export interface DatabaseMeta {
  id: string;
  name: string;
  tableIds: string[];
  createdAt: number;
  deletedAt: number | null;
}

export interface TableMeta {
  id: string;
  name: string;
  databaseId: string;
  createdAt: number;
  deletedAt: number | null;
}

export const TYPE_LABELS: Record<ColumnType, string> = {
  untyped: "?",
  string: "str",
  int: "int",
  float: "float",
  bool: "bool",
  date: "date",
  datetime: "datetime",
};

export const TYPE_NAMES: Record<ColumnType, string> = {
  untyped: "Untyped",
  string: "String",
  int: "Integer",
  float: "Float",
  bool: "Boolean",
  date: "Date",
  datetime: "Date & time",
};
