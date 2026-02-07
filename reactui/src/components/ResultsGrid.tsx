import type { DbQueryResult } from "../../../shared/types";

type Props = {
  result: DbQueryResult | null;
};

export default function ResultsGrid({ result }: Props) {
  if (!result) {
    return <div className="text-muted">No results yet.</div>;
  }

  const { columns, rows } = result;

  if (!columns.length) {
    return <div className="text-muted">Query ran, but returned no tabular results.</div>;
  }

  return (
    <div className="table-responsive" style={{ maxHeight: "100%", overflow: "auto" }}>
      <table className="table table-sm table-hover align-middle">
        <thead className="table-light">
          <tr>
            {columns.map((c: string) => (
              <th key={c} className="text-nowrap">
                {c}
              </th>
            ))}
          </tr>
        </thead>

        <tbody>
          {rows.map((r: (string | number | boolean | null | undefined)[], idx: number) => (
            <tr key={idx}>
              {r.map((cell: string | number | boolean | null | undefined, cidx: number) => (
                <td key={cidx} style={{ minWidth: 140 }}>
                  {cell === null || cell === undefined ? "" : String(cell)}
                </td>
              ))}
            </tr>
          ))}

          {!rows.length && (
            <tr>
              <td colSpan={columns.length} className="text-muted">
                No rows.
              </td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  );
}
