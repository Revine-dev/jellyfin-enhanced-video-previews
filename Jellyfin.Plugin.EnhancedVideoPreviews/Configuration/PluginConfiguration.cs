using MediaBrowser.Model.Plugins;

namespace Jellyfin.Plugin.EnhancedVideoPreviews.Configuration;

/// <summary>
/// Plugin configuration model for Enhanced Video Previews.
/// </summary>
public class PluginConfiguration : BasePluginConfiguration
{
    /// <summary>
    /// Initializes a new instance of the <see cref="PluginConfiguration"/> class.
    /// </summary>
    public PluginConfiguration()
    {
        Enabled = true;
        PreviewStartTime = 840;
        PlaybackSpeed = 1.0f;
        HoverDelay = 150;
        TranscodeWidth = 360;
        MuteAudio = true;
        LoopPreview = true;
        PreferDirectStream = true;
        FallbackToTranscoding = true;
        AutoInjectWebScript = true;
    }

    /// <summary>
    /// Gets or sets a value indicating whether preview playback is enabled.
    /// </summary>
    public bool Enabled { get; set; }

    /// <summary>
    /// Gets or sets the preferred start time for video previews in seconds (e.g. 840 for 14 minutes).
    /// If the item duration is shorter than this start time, an intelligent fraction of the duration is used.
    /// </summary>
    public int PreviewStartTime { get; set; }

    /// <summary>
    /// Gets or sets the playback speed for previews (1.0 = normal, 1.25 = 1.25x, 1.5 = 1.5x, etc.).
    /// </summary>
    public float PlaybackSpeed { get; set; }

    /// <summary>
    /// Gets or sets the delay before preview begins playing in milliseconds.
    /// </summary>
    public int HoverDelay { get; set; }

    /// <summary>
    /// Gets or sets the target width for transcoded video stream fallback in pixels.
    /// </summary>
    public int TranscodeWidth { get; set; }

    /// <summary>
    /// Gets or sets a value indicating whether preview audio should be muted.
    /// </summary>
    public bool MuteAudio { get; set; }

    /// <summary>
    /// Gets or sets a value indicating whether previews should loop continuously while hovering.
    /// </summary>
    public bool LoopPreview { get; set; }

    /// <summary>
    /// Gets or sets a value indicating whether direct streaming should be attempted first.
    /// </summary>
    public bool PreferDirectStream { get; set; }

    /// <summary>
    /// Gets or sets a value indicating whether transcoding should be used as fallback when direct streaming fails.
    /// </summary>
    public bool FallbackToTranscoding { get; set; }

    /// <summary>
    /// Gets or sets a value indicating whether the plugin should automatically inject the client script tag into index.html.
    /// </summary>
    public bool AutoInjectWebScript { get; set; }
}
