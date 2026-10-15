using System;
using System.IO;
using System.Text;
using System.Threading.Tasks;
using Microsoft.AspNetCore.Builder;
using Microsoft.AspNetCore.Hosting;
using Microsoft.AspNetCore.Http;

namespace Jellyfin.Plugin.EnhancedVideoPreviews.Web;

/// <summary>
/// Rewrites the served index.html response in-flight to inject the client script.
/// This makes script injection work even when the web client's index.html file on
/// disk cannot be modified (e.g. read-only containers or a non-root app user), since
/// it never needs filesystem write access.
/// </summary>
public class ClientScriptInjectionStartupFilter : IStartupFilter
{
    /// <inheritdoc />
    public Action<IApplicationBuilder> Configure(Action<IApplicationBuilder> next)
    {
        return app =>
        {
            app.Use(InjectClientScriptAsync);
            next(app);
        };
    }

    private static async Task InjectClientScriptAsync(HttpContext context, Func<Task> next)
    {
        var plugin = Plugin.Instance;
        var path = context.Request.Path.Value ?? string.Empty;

        // The web client is served from under "/web" for "/web", "/web/", and
        // "/web/index.html" alike (ASP.NET's UseDefaultFiles resolves the first two
        // to the third internally). Restricting to paths containing "/web" keeps this
        // from ever buffering API/media routes (e.g. /Videos/{id}/stream), which never
        // include that segment and could be arbitrarily large.
        var lastSegment = path.Length == 0 ? string.Empty : path[(path.LastIndexOf('/') + 1)..];
        var looksLikeHtmlDocument = lastSegment.Length == 0 ||
            lastSegment.Equals("index.html", StringComparison.OrdinalIgnoreCase) ||
            !lastSegment.Contains('.');
        var isWebClientPath = path.Contains("/web", StringComparison.OrdinalIgnoreCase);

        if (plugin is null ||
            !HttpMethods.IsGet(context.Request.Method) ||
            !isWebClientPath ||
            !looksLikeHtmlDocument)
        {
            await next().ConfigureAwait(false);
            return;
        }

        var config = plugin.Configuration;
        if (!config.Enabled || !config.AutoInjectWebScript)
        {
            await next().ConfigureAwait(false);
            return;
        }

        // Strip Accept-Encoding so downstream response compression skips this request,
        // keeping the buffered body below as plain-text HTML we can safely rewrite.
        context.Request.Headers.Remove("Accept-Encoding");

        // Strip conditional-request headers so the static file middleware always
        // returns a full 200 body instead of a 304 against stale validators, which
        // would otherwise make the browser/proxy reuse whatever it cached previously.
        context.Request.Headers.Remove("If-None-Match");
        context.Request.Headers.Remove("If-Modified-Since");

        var originalBody = context.Response.Body;
        using var buffer = new MemoryStream();
        context.Response.Body = buffer;

        try
        {
            await next().ConfigureAwait(false);
        }
        finally
        {
            context.Response.Body = originalBody;
        }

        buffer.Seek(0, SeekOrigin.Begin);

        var isHtml = context.Response.ContentType?.Contains("text/html", StringComparison.OrdinalIgnoreCase) ?? false;
        if (context.Response.StatusCode != StatusCodes.Status200OK || !isHtml)
        {
            await buffer.CopyToAsync(originalBody).ConfigureAwait(false);
            return;
        }

        string html;
        using (var reader = new StreamReader(buffer, Encoding.UTF8, detectEncodingFromByteOrderMarks: true, bufferSize: 1024, leaveOpen: true))
        {
            html = await reader.ReadToEndAsync().ConfigureAwait(false);
        }

        // Prevent the browser or any reverse proxy/CDN in front of Jellyfin from
        // caching this response, so a stale (pre-injection, or otherwise outdated)
        // copy can never be served instead of this freshly rewritten one.
        context.Response.Headers.Remove("ETag");
        context.Response.Headers.Remove("Last-Modified");
        context.Response.Headers["Cache-Control"] = "no-store, no-cache, must-revalidate, max-age=0";
        context.Response.Headers["Pragma"] = "no-cache";
        context.Response.Headers["Expires"] = "0";

        if (!html.Contains("EnhancedVideoPreviews", StringComparison.OrdinalIgnoreCase))
        {
            int bodyIndex = html.LastIndexOf("</body>", StringComparison.OrdinalIgnoreCase);
            if (bodyIndex != -1)
            {
                html = html.Insert(bodyIndex, plugin.GetScriptTag() + "\n");
            }
        }

        var bytes = Encoding.UTF8.GetBytes(html);
        context.Response.Headers.Remove("Content-Length");
        context.Response.ContentLength = bytes.Length;
        await originalBody.WriteAsync(bytes, 0, bytes.Length).ConfigureAwait(false);
    }
}
