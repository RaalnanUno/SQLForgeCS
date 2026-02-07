type Props = {
  disabled: boolean;
  sql: string;
  onChange: (sql: string) => void;
  onRun: () => void;
};

export default function QueryEditor({ disabled, sql, onChange, onRun }: Props) {
  return (
    <div>
      <div className="d-flex align-items-center mb-2">
        <strong>Query</strong>
        <button className="btn btn-sm btn-success ms-auto" onClick={onRun} disabled={disabled}>
          <i className="bi bi-play-fill me-1" />
          Run
        </button>
      </div>

      <textarea
        className="form-control font-monospace"
        rows={7}
        value={sql}
        onChange={(e) => onChange(e.target.value)}
        disabled={disabled}
        spellCheck={false}
      />
      <div className="form-text">
        Tip: try <code>SELECT name FROM sys.tables;</code>
      </div>
    </div>
  );
}
