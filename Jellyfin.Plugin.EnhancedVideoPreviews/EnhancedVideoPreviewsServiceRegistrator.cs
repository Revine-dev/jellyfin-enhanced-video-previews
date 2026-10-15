using Jellyfin.Plugin.EnhancedVideoPreviews.Web;
using MediaBrowser.Controller;
using MediaBrowser.Controller.Plugins;
using Microsoft.AspNetCore.Hosting;
using Microsoft.Extensions.DependencyInjection;

namespace Jellyfin.Plugin.EnhancedVideoPreviews;

/// <summary>
/// Registers the HTTP pipeline middleware responsible for injecting the client script
/// into the served index.html, independent of whether the disk-based injector can write
/// to the web root.
/// </summary>
public class EnhancedVideoPreviewsServiceRegistrator : IPluginServiceRegistrator
{
    /// <inheritdoc />
    public void RegisterServices(IServiceCollection serviceCollection, IServerApplicationHost applicationHost)
    {
        serviceCollection.AddSingleton<IStartupFilter, ClientScriptInjectionStartupFilter>();
    }
}
