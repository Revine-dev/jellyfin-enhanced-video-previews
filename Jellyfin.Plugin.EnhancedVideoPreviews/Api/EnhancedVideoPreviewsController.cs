using System.Reflection;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Mvc;

namespace Jellyfin.Plugin.EnhancedVideoPreviews.Api;

/// <summary>
/// Controller to serve Enhanced Video Previews web assets and status.
/// </summary>
[ApiController]
[Route("EnhancedVideoPreviews")]
public class EnhancedVideoPreviewsController : ControllerBase
{
    private const string ScriptResourceName = "Jellyfin.Plugin.EnhancedVideoPreviews.Web.enhancedVideoPreviews.js";

    /// <summary>
    /// Serves the client script file.
    /// </summary>
    /// <returns>The JavaScript content stream.</returns>
    [HttpGet("ClientScript")]
    [AllowAnonymous]
    [Produces("application/javascript")]
    [ProducesResponseType(StatusCodes.Status200OK)]
    [ProducesResponseType(StatusCodes.Status404NotFound)]
    public ActionResult GetClientScript()
    {
        var assembly = Assembly.GetExecutingAssembly();
        var resourceStream = assembly.GetManifestResourceStream(ScriptResourceName);
        if (resourceStream == null)
        {
            return NotFound("Enhanced Video Previews client script resource not found.");
        }

        // Cache for 1 hour in browser
        Response.Headers.Append("Cache-Control", "public, max-age=3600");
        return File(resourceStream, "application/javascript");
    }

    /// <summary>
    /// Retrieves plugin diagnostic status.
    /// </summary>
    /// <returns>Status object.</returns>
    [HttpGet("Status")]
    [Produces("application/json")]
    [ProducesResponseType(StatusCodes.Status200OK)]
    public ActionResult GetStatus()
    {
        var plugin = Plugin.Instance;
        return Ok(new
        {
            Name = plugin?.Name ?? "Enhanced Video Previews",
            Version = plugin?.Version.ToString() ?? "1.0.0.0",
            Enabled = plugin?.Configuration.Enabled ?? false,
            AutoInjectWebScript = plugin?.Configuration.AutoInjectWebScript ?? false,
            IsWebIndexWritable = plugin?.IsWebIndexWritable() ?? false
        });
    }
}
