using SQLForgeCS.Server.Models;

var builder = WebApplication.CreateBuilder(args);

builder.Services.AddSingleton<SqlState>();
builder.Services.AddControllers();

var app = builder.Build();

app.UseDefaultFiles();
app.UseStaticFiles();
app.MapControllers();

app.MapGet("/health", () => Results.Ok(new { ok = true }));

app.Run();

// Exposed for controllers
partial class Program
{
    public static string? CurrentConnection;
}
