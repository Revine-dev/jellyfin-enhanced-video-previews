using System;
using System.Collections.Generic;
using System.Globalization;
using System.IO;
using System.Text.RegularExpressions;
using Jellyfin.Plugin.EnhancedVideoPreviews.Configuration;
using MediaBrowser.Common.Configuration;
using MediaBrowser.Common.Plugins;
using MediaBrowser.Controller.Configuration;
using MediaBrowser.Model.Plugins;
using MediaBrowser.Model.Serialization;
using Microsoft.Extensions.Logging;

namespace Jellyfin.Plugin.EnhancedVideoPreviews;

/// <summary>
/// The main plugin class for Enhanced Video Previews.
/// </summary>
public class Plugin : BasePlugin<PluginConfiguration>, IHasWebPages
{
    private static readonly Regex InjectedScriptRegex = new(
        @"<script[^>]*plugin=""EnhancedVideoPreviews""[^>]*>.*?</script>",
        RegexOptions.IgnoreCase | RegexOptions.Singleline | RegexOptions.Compiled);

    private readonly IApplicationPaths _applicationPaths;
    private readonly IServerConfigurationManager? _configurationManager;
    private readonly ILogger<Plugin>? _logger;

    /// <summary>
    /// Initializes a new instance of the <see cref="Plugin"/> class.
    /// </summary>
    /// <param name="applicationPaths">Instance of <see cref="IApplicationPaths"/>.</param>
    /// <param name="xmlSerializer">Instance of <see cref="IXmlSerializer"/>.</param>
    /// <param name="configurationManager">Optional instance of <see cref="IServerConfigurationManager"/>.</param>
    /// <param name="logger">Optional instance of <see cref="ILogger{Plugin}"/>.</param>
    public Plugin(
        IApplicationPaths applicationPaths,
        IXmlSerializer xmlSerializer,
        IServerConfigurationManager? configurationManager = null,
        ILogger<Plugin>? logger = null)
        : base(applicationPaths, xmlSerializer)
    {
        Instance = this;
        _applicationPaths = applicationPaths;
        _configurationManager = configurationManager;
        _logger = logger;

        try
        {
            ApplyWebInjection(Configuration);
        }
        catch (Exception ex)
        {
            _logger?.LogError(ex, "Failed to apply web script injection on initialization");
        }
    }

    /// <summary>
    /// Gets the current plugin instance.
    /// </summary>
    public static Plugin? Instance { get; private set; }

    /// <inheritdoc />
    public override string Name => "Enhanced Video Previews";

    /// <inheritdoc />
    public override Guid Id => Guid.Parse("8a9e2d4f-5b12-4c6e-9a8f-12014f3a9e12");

    /// <inheritdoc />
    public override string Description => "Smooth hover video previews for movies, series, and episodes in Jellyfin Web.";

    /// <inheritdoc />
    public override void UpdateConfiguration(BasePluginConfiguration configuration)
    {
        ArgumentNullException.ThrowIfNull(configuration);

        base.UpdateConfiguration(configuration);

        if (configuration is PluginConfiguration pluginConfig)
        {
            try
            {
                ApplyWebInjection(pluginConfig);
            }
            catch (Exception ex)
            {
                _logger?.LogError(ex, "Failed to update web script injection after configuration change");
            }
        }
    }

    /// <summary>
    /// Determines whether the web index.html file is writable.
    /// </summary>
    /// <returns>True if writable, false otherwise.</returns>
    public bool IsWebIndexWritable()
    {
        try
        {
            if (string.IsNullOrWhiteSpace(_applicationPaths.WebPath))
            {
                return false;
            }

            var indexFile = Path.Combine(_applicationPaths.WebPath, "index.html");
            if (!File.Exists(indexFile))
            {
                return false;
            }

            using var stream = File.Open(indexFile, FileMode.Open, FileAccess.ReadWrite);
            return true;
        }
        catch
        {
            return false;
        }
    }

    /// <summary>
    /// Applies or removes the script tag from index.html according to configuration.
    /// </summary>
    /// <param name="config">The plugin configuration.</param>
    public void ApplyWebInjection(PluginConfiguration config)
    {
        if (string.IsNullOrWhiteSpace(_applicationPaths.WebPath))
        {
            _logger?.LogDebug("WebPath is not configured; skipping web script injection.");
            return;
        }

        var indexFile = Path.Combine(_applicationPaths.WebPath, "index.html");
        if (!File.Exists(indexFile))
        {
            _logger?.LogDebug("index.html not found in {WebPath}; skipping web script injection.", _applicationPaths.WebPath);
            return;
        }

        string indexContents = File.ReadAllText(indexFile);
        string scriptElement = GetScriptTag();

        if (config.Enabled && config.AutoInjectWebScript)
        {
            if (indexContents.Contains(scriptElement, StringComparison.Ordinal))
            {
                _logger?.LogDebug("EnhancedVideoPreviews script tag is already present in index.html");
                return;
            }

            // Remove any old/modified variants of our script tag
            indexContents = InjectedScriptRegex.Replace(indexContents, string.Empty);

            int bodyClosing = indexContents.LastIndexOf("</body>", StringComparison.OrdinalIgnoreCase);
            if (bodyClosing != -1)
            {
                indexContents = indexContents.Insert(bodyClosing, scriptElement + "\n");
                File.WriteAllText(indexFile, indexContents);
                _logger?.LogInformation("Successfully injected EnhancedVideoPreviews client script into {IndexFile}", indexFile);
            }
            else
            {
                _logger?.LogWarning("Closing </body> tag was not found in {IndexFile}", indexFile);
            }
        }
        else
        {
            // Remove script tag if disabled
            if (InjectedScriptRegex.IsMatch(indexContents))
            {
                indexContents = InjectedScriptRegex.Replace(indexContents, string.Empty);
                File.WriteAllText(indexFile, indexContents);
                _logger?.LogInformation("Removed EnhancedVideoPreviews client script from {IndexFile}", indexFile);
            }
        }
    }

    /// <summary>
    /// Builds the client script tag markup, shared by the disk-based injector and the
    /// in-memory response rewriter so both stay in sync.
    /// </summary>
    /// <returns>The script element markup.</returns>
    public string GetScriptTag()
    {
        string basePath = GetBaseUrlPath();
        return string.Format(
            CultureInfo.InvariantCulture,
            "<script plugin=\"EnhancedVideoPreviews\" defer=\"defer\" src=\"{0}/EnhancedVideoPreviews/ClientScript\"></script>",
            basePath);
    }

    /// <summary>
    /// Retrieves the configured network base URL prefix, if any.
    /// </summary>
    /// <returns>Base URL prefix (e.g. "/jellyfin" or empty string).</returns>
    private string GetBaseUrlPath()
    {
        if (_configurationManager == null)
        {
            return string.Empty;
        }

        try
        {
            var networkConfig = _configurationManager.GetConfiguration("network");
            if (networkConfig != null)
            {
                var basePathProp = networkConfig.GetType().GetProperty("BaseUrl");
                var confBasePath = basePathProp?.GetValue(networkConfig)?.ToString()?.Trim('/');
                if (!string.IsNullOrEmpty(confBasePath))
                {
                    return "/" + confBasePath;
                }
            }
        }
        catch (Exception ex)
        {
            _logger?.LogDebug(ex, "Unable to extract network BaseUrl; defaulting to root path.");
        }

        return string.Empty;
    }

    /// <inheritdoc />
    public IEnumerable<PluginPageInfo> GetPages()
    {
        return
        [
            new PluginPageInfo
            {
                Name = Name,
                EmbeddedResourcePath = string.Format(CultureInfo.InvariantCulture, "{0}.Configuration.configPage.html", GetType().Namespace)
            },
            new PluginPageInfo
            {
                Name = "enhancedVideoPreviews.js",
                EmbeddedResourcePath = string.Format(CultureInfo.InvariantCulture, "{0}.Web.enhancedVideoPreviews.js", GetType().Namespace)
            }
        ];
    }
}
