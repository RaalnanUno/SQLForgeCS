using Microsoft.AspNetCore.Mvc;
using Microsoft.Data.SqlClient;
using SQLForgeCS.Server.Models;
using System.Text.RegularExpressions;

namespace SQLForgeCS.Server.Controllers;

[ApiController]
[Route("api/db")]
public sealed class DbController : ControllerBase
{
    private readonly SqlState _state;

    public DbController(SqlState state)
    {
        _state = state;
    }

    // -----------------------------
    // Open / Close
    // -----------------------------
    [HttpPost("open")]
    public IActionResult Open([FromBody] SqlServerConnectionProfile profile)
    {
        try
        {
            var cs = BuildConnectionString(profile);

            using var conn = new SqlConnection(cs);
            conn.Open();

            _state.ConnectionString = cs;
            return Ok(new DbOpenResponse(true, RedactPassword(cs)));
        }
        catch (Exception ex)
        {
            return Ok(new DbOpenResponse(false, null, ex.Message));
        }
    }

    [HttpPost("close")]
    public IActionResult Close()
    {
        _state.ConnectionString = null;
        return Ok(new DbOkResponse(true));
    }

    // -----------------------------
    // Lists
    // -----------------------------
    [HttpPost("listDatabases")]
    public async Task<IActionResult> ListDatabases()
    {
        const string sql = "SELECT name FROM sys.databases WHERE database_id > 4 ORDER BY name;";
        return await ExecStringList(sql, items => new DbListDatabasesResponse(true, items));
    }

    [HttpPost("listTables")]
    public async Task<IActionResult> ListTables()
    {
        const string sql = "SELECT s.name + '.' + t.name AS [name] FROM sys.tables t JOIN sys.schemas s ON t.schema_id = s.schema_id ORDER BY s.name, t.name;";
        return await ExecStringList(sql, items => new DbListTablesResponse(true, items));
    }

    [HttpPost("listViews")]
    public async Task<IActionResult> ListViews()
    {
        const string sql = "SELECT s.name + '.' + v.name AS [name] FROM sys.views v JOIN sys.schemas s ON v.schema_id = s.schema_id ORDER BY s.name, v.name;";
        return await ExecStringList(sql, items => new DbListViewsResponse(true, items));
    }

    // -----------------------------
    // Query
    // -----------------------------
    [HttpPost("query")]
    public async Task<IActionResult> Query([FromBody] DbQueryRequest req)
    {
        try
        {
            using var conn = OpenConn();
            using var cmd = new SqlCommand(req.Sql ?? "", conn);
            using var reader = await cmd.ExecuteReaderAsync();

            var cols = Enumerable.Range(0, reader.FieldCount).Select(reader.GetName).ToArray();
            var rows = new List<object?[]>();

            while (await reader.ReadAsync())
            {
                var arr = new object?[reader.FieldCount];
                reader.GetValues(arr);

                for (int i = 0; i < arr.Length; i++)
                    if (arr[i] == DBNull.Value) arr[i] = null;

                rows.Add(arr);
            }

            return Ok(new DbQueryResponse(true, new DbQueryResult(cols, rows.ToArray()), rows.Count));
        }
        catch (Exception ex)
        {
            return Ok(new DbQueryResponse(false, null, 0, ex.Message));
        }
    }

    // -----------------------------
    // Describe Table (TableEditor metadata)
    // -----------------------------
    [HttpPost("describeTable")]
    public async Task<IActionResult> DescribeTable([FromBody] DbDescribeTableRequest req)
    {
        try
        {
            var (schema, table) = SplitFullName(req.FullName);
            if (!IsSafeIdent(schema) || !IsSafeIdent(table))
                return Ok(new DbDescribeTableResponse(false, Array.Empty<DbColumnInfo>(), $"Unsafe table name: {req.FullName}"));

            using var conn = OpenConn();
            const string sql = @"
SELECT
  c.COLUMN_NAME AS [name],
  c.DATA_TYPE AS [dataType],
  CASE WHEN c.IS_NULLABLE = 'YES' THEN 1 ELSE 0 END AS [isNullable],
  CASE WHEN c.CHARACTER_MAXIMUM_LENGTH IS NULL THEN NULL ELSE c.CHARACTER_MAXIMUM_LENGTH END AS [maxLength],
  CASE WHEN c.NUMERIC_PRECISION IS NULL THEN NULL ELSE c.NUMERIC_PRECISION END AS [numericPrecision],
  CASE WHEN c.NUMERIC_SCALE IS NULL THEN NULL ELSE c.NUMERIC_SCALE END AS [numericScale],
  CASE WHEN ic.column_id IS NULL THEN 0 ELSE 1 END AS [isIdentity]
FROM INFORMATION_SCHEMA.COLUMNS c
LEFT JOIN sys.tables t ON t.name = c.TABLE_NAME
LEFT JOIN sys.schemas s ON s.schema_id = t.schema_id AND s.name = c.TABLE_SCHEMA
LEFT JOIN sys.columns sc ON sc.object_id = t.object_id AND sc.name = c.COLUMN_NAME
LEFT JOIN sys.identity_columns ic ON ic.object_id = t.object_id AND ic.column_id = sc.column_id
WHERE c.TABLE_SCHEMA = @schema AND c.TABLE_NAME = @table
ORDER BY c.ORDINAL_POSITION;";

            using var cmd = new SqlCommand(sql, conn);
            cmd.Parameters.AddWithValue("@schema", schema);
            cmd.Parameters.AddWithValue("@table", table);

            using var reader = await cmd.ExecuteReaderAsync();

            var cols = new List<DbColumnInfo>();
            while (await reader.ReadAsync())
            {
                cols.Add(new DbColumnInfo(
                    Name: reader.GetString(reader.GetOrdinal("name")),
                    DataType: reader.GetString(reader.GetOrdinal("dataType")),
                    IsNullable: reader.GetInt32(reader.GetOrdinal("isNullable")) == 1,
                    MaxLength: reader.IsDBNull(reader.GetOrdinal("maxLength")) ? null : reader.GetInt32(reader.GetOrdinal("maxLength")),
                    NumericPrecision: reader.IsDBNull(reader.GetOrdinal("numericPrecision")) ? null : Convert.ToInt32(reader["numericPrecision"]),
                    NumericScale: reader.IsDBNull(reader.GetOrdinal("numericScale")) ? null : Convert.ToInt32(reader["numericScale"]),
                    IsIdentity: reader.GetInt32(reader.GetOrdinal("isIdentity")) == 1
                ));
            }

            return Ok(new DbDescribeTableResponse(true, cols.ToArray()));
        }
        catch (Exception ex)
        {
            return Ok(new DbDescribeTableResponse(false, Array.Empty<DbColumnInfo>(), ex.Message));
        }
    }

    // -----------------------------
    // Primary Key (TableEditor)
    // -----------------------------
    [HttpPost("getPrimaryKey")]
    public async Task<IActionResult> GetPrimaryKey([FromBody] DbPrimaryKeyRequest req)
    {
        try
        {
            var (schema, table) = SplitFullName(req.FullName);
            if (!IsSafeIdent(schema) || !IsSafeIdent(table))
                return Ok(new DbPrimaryKeyResponse(false, Array.Empty<string>(), $"Unsafe table name: {req.FullName}"));

            using var conn = OpenConn();
            const string sql = @"
SELECT kcu.COLUMN_NAME AS [name]
FROM INFORMATION_SCHEMA.TABLE_CONSTRAINTS tc
JOIN INFORMATION_SCHEMA.KEY_COLUMN_USAGE kcu
  ON tc.CONSTRAINT_NAME = kcu.CONSTRAINT_NAME
 AND tc.TABLE_SCHEMA = kcu.TABLE_SCHEMA
 AND tc.TABLE_NAME = kcu.TABLE_NAME
WHERE tc.CONSTRAINT_TYPE = 'PRIMARY KEY'
  AND tc.TABLE_SCHEMA = @schema
  AND tc.TABLE_NAME = @table
ORDER BY kcu.ORDINAL_POSITION;";

            using var cmd = new SqlCommand(sql, conn);
            cmd.Parameters.AddWithValue("@schema", schema);
            cmd.Parameters.AddWithValue("@table", table);

            using var reader = await cmd.ExecuteReaderAsync();
            var pk = new List<string>();

            while (await reader.ReadAsync())
                pk.Add(reader.GetString(0));

            return Ok(new DbPrimaryKeyResponse(true, pk.ToArray()));
        }
        catch (Exception ex)
        {
            return Ok(new DbPrimaryKeyResponse(false, Array.Empty<string>(), ex.Message));
        }
    }

    // -----------------------------
    // Update Cell (TableEditor)
    // -----------------------------
    [HttpPost("updateCell")]
    public async Task<IActionResult> UpdateCell([FromBody] DbUpdateCellRequest req)
    {
        try
        {
            var (schema, table) = SplitFullName(req.FullName);
            if (!IsSafeIdent(schema) || !IsSafeIdent(table))
                return Ok(new DbOkRowCountResponse(false, 0, $"Unsafe table name: {req.FullName}"));

            if (!IsSafeIdent(req.Column))
                return Ok(new DbOkRowCountResponse(false, 0, $"Unsafe column: {req.Column}"));

            if (req.Pk == null || req.Pk.Count == 0)
                return Ok(new DbOkRowCountResponse(false, 0, "Missing primary key values."));

            foreach (var k in req.Pk.Keys)
                if (!IsSafeIdent(k))
                    return Ok(new DbOkRowCountResponse(false, 0, $"Unsafe PK column: {k}"));

            var tableSql = $"{QIdent(schema)}.{QIdent(table)}";
            var setSql = $"{QIdent(req.Column)} = @val";
            var whereSql = string.Join(" AND ", req.Pk.Keys.Select(k => $"{QIdent(k)} = @pk_{k}"));
            var sql = $"UPDATE {tableSql} SET {setSql} WHERE {whereSql};";

            using var conn = OpenConn();
            using var cmd = new SqlCommand(sql, conn);

            cmd.Parameters.AddWithValue("@val", req.Value ?? DBNull.Value);

            foreach (var kv in req.Pk)
                cmd.Parameters.AddWithValue("@pk_" + kv.Key, kv.Value ?? DBNull.Value);

            var affected = await cmd.ExecuteNonQueryAsync();
            return Ok(new DbOkRowCountResponse(true, affected));
        }
        catch (Exception ex)
        {
            return Ok(new DbOkRowCountResponse(false, 0, ex.Message));
        }
    }

    // -----------------------------
    // Insert Row (TableEditor)
    // -----------------------------
    [HttpPost("insertRow")]
    public async Task<IActionResult> InsertRow([FromBody] DbInsertRowRequest req)
    {
        try
        {
            var (schema, table) = SplitFullName(req.FullName);
            if (!IsSafeIdent(schema) || !IsSafeIdent(table))
                return Ok(new DbOkRowCountResponse(false, 0, $"Unsafe table name: {req.FullName}"));

            var values = req.Values ?? new Dictionary<string, object?>();
            if (values.Count == 0)
                return Ok(new DbOkRowCountResponse(false, 0, "No values provided."));

            // load table meta to exclude identity columns
            var meta = await DescribeTableInternal(schema, table);
            var colMap = meta.ToDictionary(c => c.Name, c => c, StringComparer.OrdinalIgnoreCase);

            var safeKeys = new List<string>();
            foreach (var k in values.Keys)
            {
                if (!IsSafeIdent(k))
                    return Ok(new DbOkRowCountResponse(false, 0, $"Unsafe column: {k}"));

                if (!colMap.TryGetValue(k, out var col))
                    return Ok(new DbOkRowCountResponse(false, 0, $"Unknown column: {k}"));

                if (col.IsIdentity) continue;

                safeKeys.Add(k);
            }

            if (safeKeys.Count == 0)
                return Ok(new DbOkRowCountResponse(false, 0, "All provided fields were identity or invalid."));

            var tableSql = $"{QIdent(schema)}.{QIdent(table)}";
            var colSql = string.Join(", ", safeKeys.Select(QIdent));
            var valSql = string.Join(", ", safeKeys.Select(k => "@v_" + k));
            var sql = $"INSERT INTO {tableSql} ({colSql}) VALUES ({valSql});";

            using var conn = OpenConn();
            using var cmd = new SqlCommand(sql, conn);

            foreach (var k in safeKeys)
                cmd.Parameters.AddWithValue("@v_" + k, values[k] ?? DBNull.Value);

            var affected = await cmd.ExecuteNonQueryAsync();
            return Ok(new DbOkRowCountResponse(true, affected));
        }
        catch (Exception ex)
        {
            return Ok(new DbOkRowCountResponse(false, 0, ex.Message));
        }
    }

    // =====================================================
    // Internals
    // =====================================================
    private SqlConnection OpenConn()
    {
        if (string.IsNullOrWhiteSpace(_state.ConnectionString))
            throw new InvalidOperationException("No open connection.");

        var c = new SqlConnection(_state.ConnectionString);
        c.Open();
        return c;
    }

    private async Task<DbColumnInfo[]> DescribeTableInternal(string schema, string table)
    {
        using var conn = OpenConn();

        const string sql = @"
SELECT
  c.COLUMN_NAME AS [name],
  c.DATA_TYPE AS [dataType],
  CASE WHEN c.IS_NULLABLE = 'YES' THEN 1 ELSE 0 END AS [isNullable],
  CASE WHEN c.CHARACTER_MAXIMUM_LENGTH IS NULL THEN NULL ELSE c.CHARACTER_MAXIMUM_LENGTH END AS [maxLength],
  CASE WHEN c.NUMERIC_PRECISION IS NULL THEN NULL ELSE c.NUMERIC_PRECISION END AS [numericPrecision],
  CASE WHEN c.NUMERIC_SCALE IS NULL THEN NULL ELSE c.NUMERIC_SCALE END AS [numericScale],
  CASE WHEN ic.column_id IS NULL THEN 0 ELSE 1 END AS [isIdentity]
FROM INFORMATION_SCHEMA.COLUMNS c
LEFT JOIN sys.tables t ON t.name = c.TABLE_NAME
LEFT JOIN sys.schemas s ON s.schema_id = t.schema_id AND s.name = c.TABLE_SCHEMA
LEFT JOIN sys.columns sc ON sc.object_id = t.object_id AND sc.name = c.COLUMN_NAME
LEFT JOIN sys.identity_columns ic ON ic.object_id = t.object_id AND ic.column_id = sc.column_id
WHERE c.TABLE_SCHEMA = @schema AND c.TABLE_NAME = @table
ORDER BY c.ORDINAL_POSITION;";

        using var cmd = new SqlCommand(sql, conn);
        cmd.Parameters.AddWithValue("@schema", schema);
        cmd.Parameters.AddWithValue("@table", table);

        using var reader = await cmd.ExecuteReaderAsync();

        var cols = new List<DbColumnInfo>();
        while (await reader.ReadAsync())
        {
            cols.Add(new DbColumnInfo(
                Name: reader.GetString(reader.GetOrdinal("name")),
                DataType: reader.GetString(reader.GetOrdinal("dataType")),
                IsNullable: reader.GetInt32(reader.GetOrdinal("isNullable")) == 1,
                MaxLength: reader.IsDBNull(reader.GetOrdinal("maxLength")) ? null : reader.GetInt32(reader.GetOrdinal("maxLength")),
                NumericPrecision: reader.IsDBNull(reader.GetOrdinal("numericPrecision")) ? null : Convert.ToInt32(reader["numericPrecision"]),
                NumericScale: reader.IsDBNull(reader.GetOrdinal("numericScale")) ? null : Convert.ToInt32(reader["numericScale"]),
                IsIdentity: reader.GetInt32(reader.GetOrdinal("isIdentity")) == 1
            ));
        }

        return cols.ToArray();
    }

    private async Task<IActionResult> ExecStringList(string sql, Func<string[], object> okFactory, string failType)
    {
        try
        {
            using var conn = OpenConn();
            using var cmd = new SqlCommand(sql, conn);
            using var reader = await cmd.ExecuteReaderAsync();

            var items = new List<string>();
            while (await reader.ReadAsync())
                items.Add(reader.GetString(0));

            return Ok(okFactory(items.ToArray()));
        }
        catch (Exception ex)
        {
            return Ok(new { ok = false, error = ex.Message, type = failType });
        }
    }

    private Task<IActionResult> ExecStringList(string sql, Func<string[], object> okFactory)
        => ExecStringList(sql, okFactory, "list");

    private static string BuildConnectionString(SqlServerConnectionProfile p)
    {
        if (!string.IsNullOrWhiteSpace(p.ConnectionString))
            return p.ConnectionString.Trim();

        var server = string.IsNullOrWhiteSpace(p.Server) ? "." : p.Server.Trim();
        var database = string.IsNullOrWhiteSpace(p.Database) ? "master" : p.Database.Trim();

        var b = new SqlConnectionStringBuilder
        {
            DataSource = server,
            InitialCatalog = database,
            Encrypt = p.Encrypt ?? false,
            TrustServerCertificate = p.TrustServerCertificate ?? true,
        };

        if (p.Auth?.Kind == "sql")
        {
            b.IntegratedSecurity = false;
            b.UserID = p.Auth.User ?? "";
            b.Password = p.Auth.Password ?? "";
        }
        else
        {
            b.IntegratedSecurity = true;
        }

        return b.ConnectionString;
    }

    private static string RedactPassword(string cs)
    {
        try
        {
            var b = new SqlConnectionStringBuilder(cs);
            if (!string.IsNullOrEmpty(b.Password)) b.Password = "***";
            return b.ConnectionString;
        }
        catch
        {
            return cs;
        }
    }

    private static (string schema, string table) SplitFullName(string? fullName)
    {
        var raw = (fullName ?? "").Trim();
        var parts = raw.Split('.');
        if (parts.Length == 2) return (parts[0], parts[1]);
        return ("dbo", raw);
    }

    private static readonly Regex SafeIdent = new(@"^[A-Za-z_][A-Za-z0-9_]*$", RegexOptions.Compiled);

    private static bool IsSafeIdent(string? s) => SafeIdent.IsMatch((s ?? "").Trim());

    private static string QIdent(string name)
    {
        var n = (name ?? "").Trim();
        if (!IsSafeIdent(n)) throw new InvalidOperationException($"Unsafe identifier: {name}");
        return $"[{n}]";
    }
}
