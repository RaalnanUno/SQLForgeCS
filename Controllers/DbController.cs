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
    // OPEN / CLOSE
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
            return Ok(new DbOpenResponse(true, Redact(cs)));
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
    // LISTS
    // -----------------------------
    [HttpPost("listDatabases")]
    public async Task<IActionResult> ListDatabases() =>
        await ListAsync("SELECT name FROM sys.databases WHERE database_id > 4 ORDER BY name;",
            r => r.GetString(0),
            items => new DbListDatabasesResponse(true, items));

    [HttpPost("listTables")]
    public async Task<IActionResult> ListTables() =>
        await ListAsync(
            "SELECT s.name + '.' + t.name FROM sys.tables t JOIN sys.schemas s ON t.schema_id = s.schema_id;",
            r => r.GetString(0),
            items => new DbListTablesResponse(true, items));

    [HttpPost("listViews")]
    public async Task<IActionResult> ListViews() =>
        await ListAsync(
            "SELECT s.name + '.' + v.name FROM sys.views v JOIN sys.schemas s ON v.schema_id = s.schema_id;",
            r => r.GetString(0),
            items => new DbListViewsResponse(true, items));

    // -----------------------------
    // QUERY
    // -----------------------------
    [HttpPost("query")]
    public async Task<IActionResult> Query([FromBody] dynamic body)
    {
        try
        {
            var sql = (string)body.sql;
            using var conn = OpenConn();
            using var cmd = new SqlCommand(sql, conn);
            using var reader = await cmd.ExecuteReaderAsync();

            var cols = Enumerable.Range(0, reader.FieldCount).Select(reader.GetName).ToArray();
            var rows = new List<object?[]>();

            while (await reader.ReadAsync())
            {
                var r = new object?[reader.FieldCount];
                reader.GetValues(r);
                rows.Add(r.Select(v => v == DBNull.Value ? null : v).ToArray());
            }

            return Ok(new DbQueryResponse(true, new DbQueryResult(cols, rows.ToArray()), rows.Count));
        }
        catch (Exception ex)
        {
            return Ok(new DbQueryResponse(false, null, 0, ex.Message));
        }
    }

    // -----------------------------
    // Helpers
    // -----------------------------
    private SqlConnection OpenConn()
    {
        if (string.IsNullOrWhiteSpace(_state.ConnectionString))
            throw new InvalidOperationException("No open connection.");

        var c = new SqlConnection(_state.ConnectionString);
        c.Open();
        return c;
    }

    private static async Task<IActionResult> ListAsync<T>(
        string sql,
        Func<SqlDataReader, T> map,
        Func<string[], object> result)
    {
        try
        {
            using var conn = new SqlConnection(Program.CurrentConnection!);
            await conn.OpenAsync();
            using var cmd = new SqlCommand(sql, conn);
            using var reader = await cmd.ExecuteReaderAsync();

            var items = new List<string>();
            while (await reader.ReadAsync())
                items.Add(map(reader)!.ToString()!);

            return new OkObjectResult(result(items.ToArray()));
        }
        catch (Exception ex)
        {
            return new OkObjectResult(new { ok = false, error = ex.Message });
        }
    }

    private static string BuildConnectionString(SqlServerConnectionProfile p)
    {
        if (!string.IsNullOrWhiteSpace(p.ConnectionString))
            return p.ConnectionString;

        var b = new SqlConnectionStringBuilder
        {
            DataSource = string.IsNullOrWhiteSpace(p.Server) ? "." : p.Server,
            InitialCatalog = p.Database ?? "master",
            Encrypt = p.Encrypt ?? false,
            TrustServerCertificate = p.TrustServerCertificate ?? true,
            IntegratedSecurity = p.Auth.Kind != "sql"
        };

        if (p.Auth.Kind == "sql")
        {
            b.UserID = p.Auth.User;
            b.Password = p.Auth.Password;
        }

        return b.ConnectionString;
    }

    private static string Redact(string cs)
    {
        var b = new SqlConnectionStringBuilder(cs);
        if (!string.IsNullOrEmpty(b.Password)) b.Password = "***";
        return b.ConnectionString;
    }
}
