namespace SQLForgeCS.Server.Models;

// -----------------------------
// Connection
// -----------------------------
public sealed record SqlServerAuth(
    string Kind,
    string? User = null,
    string? Password = null
);

public sealed record SqlServerConnectionProfile(
    string? Name,
    string? Server,
    string? Database,
    SqlServerAuth Auth,
    bool? Encrypt,
    bool? TrustServerCertificate,
    string? ConnectionString
);

// -----------------------------
// Generic
// -----------------------------
public sealed record DbOkResponse(bool Ok, string? Error = null);

public sealed record DbOpenResponse(bool Ok, string? ConnectionString = null, string? Error = null);

// -----------------------------
// Query
// -----------------------------
public sealed record DbQueryResult(string[] Columns, object?[][] Rows);

public sealed record DbQueryResponse(bool Ok, DbQueryResult? Result, int RowCount, string? Error = null);

// -----------------------------
// Lists
// -----------------------------
public sealed record DbListDatabasesResponse(bool Ok, string[] Databases, string? Error = null);
public sealed record DbListTablesResponse(bool Ok, string[] Tables, string? Error = null);
public sealed record DbListViewsResponse(bool Ok, string[] Views, string? Error = null);

// -----------------------------
// Metadata
// -----------------------------
public sealed record DbColumnInfo(
    string Name,
    string DataType,
    bool IsNullable,
    int? MaxLength,
    int? NumericPrecision,
    int? NumericScale,
    bool IsIdentity
);

public sealed record DbDescribeTableResponse(bool Ok, DbColumnInfo[] Columns, string? Error = null);
public sealed record DbPrimaryKeyResponse(bool Ok, string[] PrimaryKey, string? Error = null);

// -----------------------------
// Mutations
// -----------------------------
public sealed record DbUpdateCellRequest(
    string FullName,
    Dictionary<string, object?> Pk,
    string Column,
    object? Value
);

public sealed record DbInsertRowRequest(
    string FullName,
    Dictionary<string, object?> Values
);
