# Jellyfin Enhanced Video Previews

Hover video previews for movies, series, and episodes in Jellyfin Web.

An adaptation of [bobhasnosoul/jellyfin-video-previews](https://github.com/bobhasnosoul/jellyfin-video-previews) into a full Jellyfin server plugin with in-app configuration, reverse proxy support, and repository distribution.

---

## 🚀 Installation

### Option 1: Plugin Repository (Recommended)

1. In Jellyfin, go to **Dashboard $\rightarrow$ Plugins $\rightarrow$ Repositories** and click **+**.
2. Add this repository URL:
   ```text
   https://raw.githubusercontent.com/Revine-dev/jellyfin-enhanced-video-previews/main/manifest.json
   ```
3. Open the **Catalog** tab, find **Enhanced Video Previews**, click **Install**, and restart Jellyfin.

### Option 2: Manual Install

1. Download `jellyfin-enhanced-video-previews-<version>.zip` from [Releases](https://github.com/Revine-dev/jellyfin-enhanced-video-previews/releases).
2. Extract `Jellyfin.Plugin.EnhancedVideoPreviews.dll` into your Jellyfin plugins directory:
   - **Docker / Linux**: `/config/plugins/EnhancedVideoPreviews/`
   - **Windows**: `%ProgramData%\Jellyfin\Server\plugins\EnhancedVideoPreviews\`
3. Restart Jellyfin.

### Option 3: Userscript / Injector Only

You can also use the standalone script directly with Tampermonkey or Custom JavaScript plugins:

- [`Web/enhancedVideoPreviews.js`](Jellyfin.Plugin.EnhancedVideoPreviews/Web/enhancedVideoPreviews.js)

---

## ⚙️ Configuration

Go to **Dashboard $\rightarrow$ Plugins $\rightarrow$ Enhanced Video Previews** to configure:

- **Preview Start Time**: Timestamp where preview begins (default: 840s / 14m; automatically scales down for short videos).
- **Hover Delay**: Wait time before playback starts (default: 150ms).
- **Playback Speed**: 0.75x to 2.0x (default: 1.0x).
- **Transcode Resolution**: Fallback resolution if direct play isn't supported (default: 360p).
- **Direct Play / Transcode Fallback**: Tries direct play first with zero CPU usage, transcodes only when needed.
- **Audio / Loop**: Mute audio (default: on) and loop preview (default: on). When muting is off, previews still start muted (browsers block autoplay with sound) and auto-unmute once playback begins; a manual mute/unmute button also appears on the preview.

> **Docker Note**: If your container has a read-only web directory, add this tag before `</body>` in `index.html`:
>
> ```html
> <script
>   plugin="EnhancedVideoPreviews"
>   defer
>   src="/EnhancedVideoPreviews/ClientScript"
> ></script>
> ```

---

## 🙏 Credits

Adapted from [bobhasnosoul/jellyfin-video-previews](https://github.com/bobhasnosoul/jellyfin-video-previews).

## 📄 License

[MIT](LICENSE)
