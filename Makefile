VERSION ?= 1.0.0.0
CONFIG ?= Release
REPO ?= revine-dev/jellyfin-enhanced-video-previews
ZIP_NAME = jellyfin-enhanced-video-previews-$(VERSION).zip

.PHONY: all build clean package manifest release

all: build package

build:
	dotnet restore Jellyfin.Plugin.EnhancedVideoPreviews.sln
	dotnet build Jellyfin.Plugin.EnhancedVideoPreviews.sln -c $(CONFIG) /p:Version=$(VERSION)

package:
	@mkdir -p release
	@cp Jellyfin.Plugin.EnhancedVideoPreviews/bin/$(CONFIG)/net8.0/Jellyfin.Plugin.EnhancedVideoPreviews.dll release/
	@cd release && zip -r ../$(ZIP_NAME) .
	@echo "Package created: $(ZIP_NAME)"

checksum:
	@which md5sum >/dev/null 2>&1 && md5sum $(ZIP_NAME) | awk '{print $$1}' || md5 -q $(ZIP_NAME)

manifest:
	@node scripts/generate-manifest.js --version=$(VERSION) --repo=$(REPO)

clean:
	@rm -rf release $(ZIP_NAME)
	@dotnet clean Jellyfin.Plugin.EnhancedVideoPreviews.sln
