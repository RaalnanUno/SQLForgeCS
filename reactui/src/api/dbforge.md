import type {
  DbListDatabasesResponse,
  DbListTablesResponse,
  DbListViewsResponse,
  DbOpenResponse,
  DbOkResponse,
  DbQueryResponse,
  DbDescribeTableResponse,
  DbPrimaryKeyResponse,
  DbUpdateCellRequest,
  DbInsertRowRequest,
  SqlServerConnectionProfile,
} from "../../../shared/types";

async function post<T>(path: string, body?: Record<string, unknown>): Promise<T> {
  const r = await fetch(`/api/db/${path}`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body ?? {}),
  });
  return (await r.json()) as T;
}

export const dbforge = {
  open: (profile: SqlServerConnectionProfile) => post<DbOpenResponse>("open", profile),
  close: () => post<DbOkResponse>("close"),

  listDatabases: () => post<DbListDatabasesResponse>("listDatabases"),
  listTables: () => post<DbListTablesResponse>("listTables"),
  listViews: () => post<DbListViewsResponse>("listViews"),

  query: (sql: string) => post<DbQueryResponse>("query", { sql }),

  describeTable: (fullName: string) => post<DbDescribeTableResponse>("describeTable", { fullName }),
  getPrimaryKey: (fullName: string) => post<DbPrimaryKeyResponse>("getPrimaryKey", { fullName }),

  updateCell: (req: DbUpdateCellRequest) => post<DbOkResponse & { rowCount?: number }>("updateCell", req),
  insertRow: (req: DbInsertRowRequest) => post<DbOkResponse & { rowCount?: number }>("insertRow", req),
};
