export type SqlAuth =
  | { kind: "windows" }
  | { kind: "sql"; user: string; password: string };

export type SqlServerConnectionProfile = {
  name?: string;
  server?: string;
  database?: string;
  auth: SqlAuth;
  encrypt?: boolean;
  trustServerCertificate?: boolean;
  connectionString?: string;
};

export type DbOkResponse = { ok: true } | { ok: false; error: string };

export type DbOpenResponse =
  | { ok: true; connectionString?: string }
  | { ok: false; error: string };

export type DbQueryResult = {
  columns: string[];
  rows: any[][];
};

export type DbQueryResponse =
  | { ok: true; result: DbQueryResult; rowCount: number }
  | { ok: false; error: string };

export type DbListDatabasesResponse =
  | { ok: true; databases: string[] }
  | { ok: false; error: string };

export type DbListTablesResponse =
  | { ok: true; tables: string[] }
  | { ok: false; error: string };

export type DbListViewsResponse =
  | { ok: true; views: string[] }
  | { ok: false; error: string };

export type DbColumnInfo = {
  name: string;
  dataType: string;
  isNullable: boolean;
  maxLength: number | null;
  numericPrecision: number | null;
  numericScale: number | null;
  isIdentity: boolean;
};

export type DbDescribeTableResponse =
  | { ok: true; columns: DbColumnInfo[] }
  | { ok: false; error: string };

export type DbPrimaryKeyResponse =
  | { ok: true; primaryKey: string[] }
  | { ok: false; error: string };

export type DbUpdateCellRequest = {
  fullName: string;
  pk: Record<string, any>;
  column: string;
  value: any;
};

export type DbInsertRowRequest = {
  fullName: string;
  values: Record<string, any>;
};
