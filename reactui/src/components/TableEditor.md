
// File: reactui/src/components/TableEditor.tsx
import { useEffect, useMemo, useState } from "react";
import {
  flexRender,
  getCoreRowModel,
  getFilteredRowModel,
  getSortedRowModel,
  useReactTable,
} from "@tanstack/react-table";
import type { ColumnDef } from "@tanstack/react-table";

import { dbforge } from "../api/dbforge";
import type { DbColumnInfo } from "../../../shared/types";




type Props = {
  fullName: string;                 // dbo.Table
  rows: any[][];                    // from query result
  columns: string[];                // from query result
  onStatus: (s: string) => void;
};

type UndoItem = {
  pk: Record<string, any>;
  column: string;
  oldValue: any;
  newValue: any;
};

function isDateType(t: string) {
  const x = t.toLowerCase();
  return x.includes("date") || x.includes("time");
}
function isNumberType(t: string) {
  const x = t.toLowerCase();
  return ["int", "bigint", "smallint", "tinyint", "decimal", "numeric", "float", "real", "money", "smallmoney"].some((k) =>
    x.includes(k),
  );
}
function isBoolType(t: string) {
  return t.toLowerCase() === "bit";
}
function isLongText(col: DbColumnInfo | undefined) {
  if (!col) return false;
  const t = col.dataType.toLowerCase();
  if (t.includes("text") || t.includes("ntext")) return true;
  if (t.includes("xml")) return true;
  if (col.maxLength === null) return true; // nvarchar(max)
  return col.maxLength > 255;
}

export default function TableEditor({ fullName, rows, columns, onStatus }: Props) {
  const [meta, setMeta] = useState<DbColumnInfo[]>([]);
  const [pkCols, setPkCols] = useState<string[]>([]);
  const [filter, setFilter] = useState("");
  const [undo, setUndo] = useState<UndoItem[]>([]);
  const [data, setData] = useState<Record<string, any>[]>([]);

  const canEdit = pkCols.length > 0;

  // convert row arrays into objects: { colName: value }
  useEffect(() => {
    const objRows = rows.map((r) => {
      const o: Record<string, any> = {};
      columns.forEach((c, idx) => (o[c] = r[idx]));
      return o;
    });
    setData(objRows);
  }, [rows, columns]);

  useEffect(() => {
    (async () => {
      const d = await dbforge.describeTable(fullName);
      if (d.ok && d.columns) setMeta(d.columns);
      const p = await dbforge.getPrimaryKey(fullName);
      if (p.ok && p.primaryKey) setPkCols(p.primaryKey);
    })();
  }, [fullName]);

  const metaMap = useMemo(() => {
    const m = new Map<string, DbColumnInfo>();
    for (const c of meta) m.set(c.name.toLowerCase(), c);
    return m;
  }, [meta]);

  function getPkForRow(rowObj: Record<string, any>): Record<string, any> | null {
    if (!pkCols.length) return null;
    const pk: Record<string, any> = {};
    for (const k of pkCols) pk[k] = rowObj[k];
    return pk;
  }

  async function commitCell(rowIndex: number, colName: string, newValue: any) {
    const rowObj = data[rowIndex];
    const pk = getPkForRow(rowObj);
    if (!pk) {
      onStatus("This table has no primary key. Editing is disabled.");
      return;
    }

    const oldValue = rowObj[colName];

    // no-op
    if (oldValue === newValue) return;

    // optimistic update
    setData((prev) => {
      const copy = [...prev];
      copy[rowIndex] = { ...copy[rowIndex], [colName]: newValue };
      return copy;
    });

    onStatus(`Updating ${colName}...`);
    const resp = await dbforge.updateCell({ fullName, pk, column: colName, value: newValue });
    if (!resp.ok) {
      // revert
      setData((prev) => {
        const copy = [...prev];
        copy[rowIndex] = { ...copy[rowIndex], [colName]: oldValue };
        return copy;
      });
      onStatus(`Update failed: ${resp.error}`);
      return;
    }

    setUndo((u) => [...u, { pk, column: colName, oldValue, newValue }]);
    onStatus("Updated.");
  }

  async function undoLast() {
    const last = undo[undo.length - 1];
    if (!last) return;

    onStatus(`Undoing ${last.column}...`);
    const resp = await dbforge.updateCell({ fullName, pk: last.pk, column: last.column, value: last.oldValue });
    if (!resp.ok) {
      onStatus(`Undo failed: ${resp.error}`);
      return;
    }

    // Update UI by finding matching row by PK
    setData((prev) => {
      const copy = [...prev];
      const idx = copy.findIndex((r) => pkCols.every((k) => r[k] === last.pk[k]));
      if (idx >= 0) copy[idx] = { ...copy[idx], [last.column]: last.oldValue };
      return copy;
    });

    setUndo((u) => u.slice(0, -1));
    onStatus("Undo complete.");
  }

  // Add Row
  const [showAdd, setShowAdd] = useState(false);
  const [newRow, setNewRow] = useState<Record<string, any>>({});

  function resetNewRow() {
    const o: Record<string, any> = {};
    // default empty fields for non-identity columns that are visible in current query result
    for (const c of columns) {
      const cm = metaMap.get(c.toLowerCase());
      if (cm?.isIdentity) continue;
      o[c] = null;
    }
    setNewRow(o);
  }

  async function insertRow() {
    onStatus("Inserting row...");
    const resp = await dbforge.insertRow({ fullName, values: newRow });
    if (!resp.ok) {
      onStatus(`Insert failed: ${resp.error}`);
      return;
    }
    onStatus("Inserted. Refresh by re-opening Top 100.");
    setShowAdd(false);
  }

  const columnDefs = useMemo<ColumnDef<Record<string, any>>[]>(() => {
    return columns.map((colName) => {
      const colMeta = metaMap.get(colName.toLowerCase());

      return {
        header: colName,
        accessorKey: colName,
        cell: (ctx) => {
          const rowIndex = ctx.row.index;
          const value = ctx.getValue<any>();
          const readOnly = !canEdit || colMeta?.isIdentity;

          // display-only
          if (readOnly) {
            return <span className="text-nowrap">{value === null || value === undefined ? "" : String(value)}</span>;
          }

          // editors by datatype
          const t = colMeta?.dataType ?? "";

          if (isBoolType(t)) {
            return (
              <input
                type="checkbox"
                className="form-check-input"
                checked={!!value}
                onChange={(e) => commitCell(rowIndex, colName, e.target.checked)}
              />
            );
          }

          if (isDateType(t)) {
            const iso = value ? new Date(value).toISOString().slice(0, 10) : "";
            return (
              <input
                type="date"
                className="form-control form-control-sm"
                defaultValue={iso}
                onBlur={(e) => commitCell(rowIndex, colName, e.target.value || null)}
              />
            );
          }

          if (isNumberType(t)) {
            return (
              <input
                type="number"
                className="form-control form-control-sm"
                defaultValue={value === null || value === undefined ? "" : String(value)}
                onBlur={(e) => {
                  const raw = e.target.value;
                  commitCell(rowIndex, colName, raw === "" ? null : Number(raw));
                }}
              />
            );
          }

          if (isLongText(colMeta)) {
            return (
              <textarea
                className="form-control form-control-sm"
                rows={2}
                defaultValue={value === null || value === undefined ? "" : String(value)}
                onBlur={(e) => commitCell(rowIndex, colName, e.target.value)}
              />
            );
          }

          return (
            <input
              type="text"
              className="form-control form-control-sm"
              defaultValue={value === null || value === undefined ? "" : String(value)}
              onBlur={(e) => commitCell(rowIndex, colName, e.target.value)}
            />
          );
        },
      };
    });
  }, [columns, metaMap, canEdit]);

  const table = useReactTable({
    data,
    columns: columnDefs,
    state: { globalFilter: filter },
    onGlobalFilterChange: setFilter,
    getCoreRowModel: getCoreRowModel(),
    getFilteredRowModel: getFilteredRowModel(),
    getSortedRowModel: getSortedRowModel(),
  });

  return (
    <div className="d-flex flex-column gap-2">
      <div className="d-flex gap-2 align-items-center">
        <input
          className="form-control form-control-sm"
          placeholder="Filter..."
          value={filter}
          onChange={(e) => setFilter(e.target.value)}
          style={{ maxWidth: 260 }}
        />

        <div className="ms-auto d-flex gap-2">
          <button className="btn btn-sm btn-outline-secondary" disabled={!undo.length} onClick={undoLast}>
            <i className="bi bi-arrow-counterclockwise me-1" />
            Undo
          </button>

          <button
            className="btn btn-sm btn-outline-primary"
            onClick={() => {
              resetNewRow();
              setShowAdd(true);
            }}
          >
            <i className="bi bi-plus-lg me-1" />
            Add Row
          </button>
        </div>
      </div>

      {!canEdit && (
        <div className="alert alert-warning py-2 mb-0">
          This table has no primary key — inline editing is disabled.
        </div>
      )}

      <div className="table-responsive" style={{ maxHeight: "100%", overflow: "auto" }}>
        <table className="table table-sm table-hover align-middle">
          <thead className="table-light">
            {table.getHeaderGroups().map((hg) => (
              <tr key={hg.id}>
                {hg.headers.map((h) => (
                  <th
                    key={h.id}
                    className="text-nowrap"
                    style={{ cursor: h.column.getCanSort() ? "pointer" : "default" }}
                    onClick={h.column.getToggleSortingHandler()}
                  >
                    {flexRender(h.column.columnDef.header, h.getContext())}
                    {h.column.getIsSorted() === "asc" ? " ▲" : h.column.getIsSorted() === "desc" ? " ▼" : ""}
                  </th>
                ))}
              </tr>
            ))}
          </thead>
          <tbody>
            {table.getRowModel().rows.map((r) => (
              <tr key={r.id}>
                {r.getVisibleCells().map((c) => (
                  <td key={c.id} style={{ minWidth: 140 }}>
                    {flexRender(c.column.columnDef.cell, c.getContext())}
                  </td>
                ))}
              </tr>
            ))}
            {!table.getRowModel().rows.length && (
              <tr>
                <td colSpan={columns.length} className="text-muted">
                  No rows.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {/* Add Row Modal */}
      {showAdd && (
        <div className="position-fixed top-0 start-0 w-100 h-100" style={{ background: "rgba(0,0,0,0.4)" }}>
          <div className="bg-white rounded shadow position-absolute top-50 start-50 translate-middle p-3" style={{ width: 720, maxHeight: "80vh", overflow: "auto" }}>
            <div className="d-flex align-items-center mb-2">
              <h6 className="mb-0">Add Row: {fullName}</h6>
              <button className="btn btn-sm btn-outline-secondary ms-auto" onClick={() => setShowAdd(false)}>
                Close
              </button>
            </div>

            <div className="row g-2">
              {Object.keys(newRow).map((k) => {
                const m = metaMap.get(k.toLowerCase());
                const t = m?.dataType ?? "";
                const readOnly = m?.isIdentity;

                if (readOnly) return null;

                const v = newRow[k];

                return (
                  <div key={k} className="col-6">
                    <label className="form-label small mb-1">{k}</label>

                    {isBoolType(t) ? (
                      <div className="form-check">
                        <input
                          type="checkbox"
                          className="form-check-input"
                          checked={!!v}
                          onChange={(e) => setNewRow((p) => ({ ...p, [k]: e.target.checked }))}
                        />
                      </div>
                    ) : isDateType(t) ? (
                      <input
                        type="date"
                        className="form-control form-control-sm"
                        value={v ? String(v).slice(0, 10) : ""}
                        onChange={(e) => setNewRow((p) => ({ ...p, [k]: e.target.value || null }))}
                      />
                    ) : isNumberType(t) ? (
                      <input
                        type="number"
                        className="form-control form-control-sm"
                        value={v === null || v === undefined ? "" : String(v)}
                        onChange={(e) => setNewRow((p) => ({ ...p, [k]: e.target.value === "" ? null : Number(e.target.value) }))}
                      />
                    ) : isLongText(m) ? (
                      <textarea
                        className="form-control form-control-sm"
                        rows={2}
                        value={v === null || v === undefined ? "" : String(v)}
                        onChange={(e) => setNewRow((p) => ({ ...p, [k]: e.target.value }))}
                      />
                    ) : (
                      <input
                        type="text"
                        className="form-control form-control-sm"
                        value={v === null || v === undefined ? "" : String(v)}
                        onChange={(e) => setNewRow((p) => ({ ...p, [k]: e.target.value }))}
                      />
                    )}
                  </div>
                );
              })}
            </div>

            <div className="d-flex gap-2 mt-3">
              <button className="btn btn-primary" onClick={insertRow}>
                <i className="bi bi-check2 me-1" />
                Insert
              </button>
              <button className="btn btn-outline-secondary" onClick={() => setShowAdd(false)}>
                Cancel
              </button>
            </div>

            <div className="form-text mt-2">
              Insert is the only action here — once the row exists, edits become per-cell autosave + undo.
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
