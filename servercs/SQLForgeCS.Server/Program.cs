using System.Text.Json;
using SQLForgeCS.Server.Models;

var builder = WebApplication.CreateBuilder(args);


builder.Services.AddSingleton<SqlState>();
builder.Services.AddControllers().AddJsonOptions(o =>
{
    o.JsonSerializerOptions.PropertyNamingPolicy = JsonNamingPolicy.CamelCase;
    o.JsonSerializerOptions.DictionaryKeyPolicy = JsonNamingPolicy.CamelCase;
});


// (Optional) if you want Postman from other origins during dev, enable CORS
builder.Services.AddCors(o =>
{
    o.AddDefaultPolicy(p => p.AllowAnyOrigin().AllowAnyHeader().AllowAnyMethod());
});

var app = builder.Build();

app.UseCors();

app.UseDefaultFiles();  // serves index.html from wwwroot if present
app.UseStaticFiles();

app.MapControllers();

app.MapGet("/health", () => Results.Ok(new { ok = true }));

app.Run();
