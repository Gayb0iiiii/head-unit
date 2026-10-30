# Local audio

The Audio destination replaces the Radio tile, dock entry and Home shortcut. It works without a phone-system connection or internet. Existing weather work is preserved; this branch starts from `codex/weather-pi-network` at `bafb0e2`.

## Use

While parked, open Audio and choose **Add files** or **Add folder** from local storage or a mounted USB drive. Files are copied into the Electron profile's IndexedDB; disconnecting the source drive after import does not interrupt playback. Import is bounded to 2,000 tracks and 512 MiB per file. Storage quota/full-disk failures retain successful imports and report the failure. Keep the original collection backed up: clearing the application profile removes these copies. Persistence across release-directory/profile migrations has not been validated.

Browse tracks, albums, artists or folders; search title, artist, album and folder. MP3 ID3v2.3/v2.4 and FLAC Vorbis comments supply basic tags. Supported embedded PNG/JPEG artwork appears in Now Playing; untagged files use their filename, source folder, and a neutral record symbol. Tag parsing reads at most 1 MiB and accepts artwork up to 256 KiB. Unsupported/compressed/unsynchronised ID3 tags and other containers fall back without blocking playback. No online artwork lookup or metadata service runs.

Select a track to replace the queue and play; **+** appends without interrupting playback. Queue supports explicit selection, earlier/later, remove and clear. Favourites, shuffle, repeat off/all/one, previous/next, pause and seeking are supported. Manual Next advances even with repeat-one enabled. At the end of a queue with repeat off, playback stops. A decode/missing-file error stops and invites another track; it does not spin through a broken queue.

Queue, current item, favourites, shuffle/repeat and approximate position persist. Position is checkpointed about every five seconds and on pause. Restart is always paused and loads the current file only after explicit Play. There is no automatic resume after native takeover. Manage/Delete removes only the imported copy, not the source file. Known moving state hides browsing and blocks import/queue/file management. Unknown motion is not treated as a verified parked state; manage music only when safely parked.

## Output and source ownership

One HTMLAudioElement, outside the rendered DOM, owns playback across shell navigation. Audio uses the existing OS default output without setting volume, requesting a new device, changing DSP controls or adding processing. Production CSP allows blob media only; no new IPC, privileged filesystem access or network request is introduced.

Selecting CarPlay, Bluetooth or Phones pauses local audio. An observed native projection/camera/cluster takeover or observed phone media playback also pauses it. Opening Audio from active projection requests the shell surface through the existing allowlisted navigation command. Phone playback may need to be paused before local playback can start. Native call/navigation audio-focus and ducking events are not exposed by the current public view; full arbitration and restoration require a native integration increment. No call-safe mixing claim is made.

The target is Orange Pi 5 Plus / Armbian / Electron feeding HELIX DSP PRO MK3. Stereo input remains stereo; channel routing, crossovers, time alignment, EQ and tuning belong to the DSP. No ten-channel conversion, DSP control, master-volume ownership, bit-perfect output, gapless playback, ReplayGain or physical audio quality is claimed.

## Verification and limits

`npm test`, `npm run build`, and `npm run test:electron:fixture` cover the software boundaries. `python3 tests/local-audio-browser.py` (with `npm start`, Python Playwright and `/usr/bin/chromium`) exercises production CSP, real IndexedDB storage, generated stereo WAV decoding/time progress, transport, queue edits, favourites, search/folders, reload-paused persistence, file removal, source-navigation pause and responsive bounds. The bridge is a disconnected fixture; it is not native LIVI. Screenshots use generated test filenames and neutral artwork.

Codec support depends on the installed Electron/Chromium build. WAV decoding was exercised here; MP3/M4A/AAC/FLAC/Ogg/Opus playback, embedded artwork rendering on the Pi, actual USB import, full-disk/power-loss behavior, touch ergonomics, call/navigation mixing, OS output selection and physical HELIX output still need hardware acceptance. No services were changed and no deployment or native engine launch was performed.
