# Store listing

Copy each block into the matching field. Texts are shared by the Chrome Web Store and addons.mozilla.org unless noted otherwise.

## Name

```
Volume Scroll and Auto HD for YouTube
```

## Summary

Chrome Web Store takes this from `manifest.json`. On addons.mozilla.org paste it into **Summary**.

```
Control YouTube volume with your mouse wheel and play every video in your preferred quality automatically.
```

## Description

```
Volume Scroll and Auto HD adds two things YouTube is missing: volume control with your mouse wheel, and a default video quality that sticks.

VOLUME WITH YOUR MOUSE WHEEL
• Hover over a video and scroll up or down to change the volume
• Choose the step size, from 1% to 20% per scroll
• Fine 1% steps below 10% for precise control at low volume
• Optional activation key: scroll always, only while holding Shift, or only while holding the right mouse button
• Volume boost up to 150%, 200% or 300% for videos that are too quiet. Levels above 100% are shown in red
• A small, unobtrusive indicator shows the current level at the top or center of the player, or not at all
• Middle click on the video to mute or unmute
• Your volume is kept after reloading the page

AUTO QUALITY
• Choose your preferred quality: 360p, 480p, 720p, 1080p, 1440p, 4K or the highest available
• If a video doesn't offer your choice, the next lower quality is used
• Applies to every video automatically, including autoplay and playlists, and waits until ads have finished

WORKS EVERYWHERE YOU WATCH
• Regular videos, theater mode, fullscreen and the miniplayer
• Shorts: scroll over the video to change the volume, scroll beside it to move to the next Short
• YouTube Music and embedded YouTube players on other websites, each with its own on/off switch

PRIVATE BY DESIGN
No data collection, no tracking, no ads and no network requests. Your settings stay in your browser.

OPEN SOURCE
The full source code is available on GitHub under the MIT license:
https://github.com/init201/volume-scroll-and-auto-hd

This extension is not affiliated with, endorsed by or sponsored by YouTube or Google LLC.
```

## Links

| Field | Value |
| --- | --- |
| Homepage / website | https://github.com/init201/volume-scroll-and-auto-hd |
| Support | https://github.com/init201/volume-scroll-and-auto-hd/issues |
| Privacy policy | https://github.com/init201/volume-scroll-and-auto-hd/blob/main/PRIVACY.md |

## Chrome Web Store

| Field | Value |
| --- | --- |
| Category | Functionality & UI |
| Language | English |

### Privacy practices

**Single purpose**

```
Improves video playback control on YouTube: change the volume with the mouse wheel and play videos in a preferred quality automatically.
```

**Permission justification: storage**

```
Saves the user's settings, such as step size, activation key and preferred video quality.
```

**Permission justification: host permissions**

```
The extension runs only on youtube.com, music.youtube.com and youtube-nocookie.com to control the video player's volume and playback quality.
```

**Remote code:** No, I am not using remote code.

**Data usage:** Leave every data type unchecked. Confirm all three certifications.

## addons.mozilla.org

| Field | Value |
| --- | --- |
| Add-on URL | volume-scroll-and-auto-hd |
| Category | Photos, Music & Videos |
| License | MIT License |
| This add-on is experimental | No |
| Requires payment | No |

**Release notes for 1.0.0**

```
First release.
```

**Notes to reviewer**

```
No build step, bundler or minification. The submitted files are the original source, also available at https://github.com/init201/volume-scroll-and-auto-hd.

src/player.js runs in the MAIN world because it has to call YouTube's own player API (setVolume, setPlaybackQualityRange) on the #movie_player element. It receives settings from src/bridge.js through a DOM CustomEvent. Volume boost above 100% routes the video element through a Web Audio GainNode, entirely local. The extension makes no network requests.
```
