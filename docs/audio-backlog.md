# Audio integration backlog

Phones, media and CarPlay remain primary. Local music files stored on the Pi are desired later at lower priority; no scanner, library or decoder is added in this checkpoint.

A future external DSP is likely Helix, but the exact model is undecided. RCA versus optical output is also undecided. Keep a hardware-independent audio-output boundary and select the actual endpoint only after the hardware is chosen. Do not assume a vendor control protocol or claim DSP control.

One master-volume/mute owner must be agreed before native implementation to avoid competing software, projection and DSP gains. The current normalized LIVI volume adapter does not settle that system-level ownership. Test music/call/navigation ducking and restoration with manual volume changes against actual outputs.

Sensor audible rules only produce capability-gated notification intents in a pure model. They do not play a sound, open an audio device, alter master volume, or supersede independent critical warning hardware.

## Call UI and capture path

Use CarPlay's own call UI for normal CarPlay calls; do not add duplicate call overlays or an extra global microphone mute. A future standalone Bluetooth phone screen should use familiar contextual answer/end/mute/keypad controls, exposed only when its backend supports them.

A microphone array and controller are planned. Its output type (aux microphone, line level or USB) is not yet verified. Preserve a configurable capture-path boundary rather than assuming an input level, connector or driver. Real microphone gain, echo cancellation and call routing still require hardware testing.
