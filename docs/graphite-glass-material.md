# Glass definition on the default graphite wallpaper

The previous translucent paint and blur were real, but the default graphite wallpaper has little detail and almost the same luminance as the cards. Lowering opacity alone did not make their material clearly distinguishable. This change leaves the selected wallpaper, wallpaper brightness/dim controls and saved glass strength unchanged.

Production glass cards and the shared app bar now have a muted slate reflection that fades toward their lower edge, a fine illuminated upper rim, a restrained side rim and a contact shadow. This lighting is drawn within the existing surface, without adding another opaque panel or altering content opacity. No animated reflections or vehicle-dependent effects were added. The actual backdrop blur and transmission remain present. A smooth wallpaper cannot demonstrate blur by itself; the default screenshots establish surface definition, while the patterned test separately establishes optical transmission and blur.

The tint floor rises slightly to retain contrast with the added reflection. At the default strength, night opacity is approximately 75%, day 78% (still below the earlier 83%/94%). The contrast test now includes both the unlit surface and maximum reflection over black, white and saturated backgrounds at all 101 glass-strength values. Primary and secondary text remain at least 4.5:1, focus rings at least 3:1. These are token-composition tests, not a claim of measured physical display contrast.

Reduced transparency and increased contrast remove the lighting and use the existing opaque fallback. Forced colours remove lighting and retain CanvasText borders. No-blur browsers also use a plain surface.

## Verification

- The new default-graphite pixel regression fails against 129247a's CSS: the sampled day upper/lower interior intensity differs by only 2.67 (24.00 versus 21.33). It passes with the new material: day 30.99 versus 21.31, night 25.44 versus 15.31. Sampling excludes text and borders. Screenshots were inspected directly; graphite remains selected throughout.
- Default screenshots cover Home, Audio and Settings at 1280×720 in day/night, plus 800×480, 480×800 and 1920×1080; reduced-transparency screenshots are included.
- Patterned surface tests continue to pass: day/night broad-pattern standard deviation 7.24/8.39; reduced transparency 0.00. Fine-pattern deviation with blur is 1.39/1.29 versus 9.33/10.79 with blur alone disabled.
- Shared top-bar browser regression passes all sizes, touch swipe, mouse wheel, keyboard, repeated navigation and supported scale extremes.
- 728 Node tests, production build and Unix-socket fixture pass.

Evidence: `evidence/graphite-material/`. `before/home-day-1280x720.png` uses the previous committed CSS through a browser test response; it does not modify production source. `regression-screenshots/` contains the navigation and patterned screenshots captured for this change.

Physical display/touch, sunlight legibility and subjective glass appearance on the Pi still require acceptance. No Pi services/configuration, deployment or reboot were performed. This improves the actual default composition; it does not claim the patterned test alone resolves the user's visual concern.
