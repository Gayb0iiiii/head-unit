# Camera integration boundary

Confirmed behavior: reverse automatically takes the main screen, then restores the previous screen after shifting out. A dedicated Cameras page must also support intentional manual viewing, with room for future front/trailer sources.

Implemented here: the controller follows authoritative native camera-front overrides, preserves the explicit prior screen, and restores it when native authority returns. A startup camera overlay does not consume a pending saved projection restoration. Camera is not persisted as the user's startup preference.

Pending: dedicated manual Cameras page and distinction between manual camera ownership and reverse ownership; verified reverse signal; video capture/source selection; capture readiness, stale-frame detection and unavailable-source UI; actual compositor/camera tests. No camera hardware, connector, wiring, resolution, latency or reverse signal source has been selected. No fake or stale camera image is displayed in this checkpoint.

The host must not infer reverse merely because a camera page is open. A disconnected or stale feed must show its unavailable state, never a cached frame as live. Manual route changes during an override need deliberate restoration ownership, as in the separate call arbitration model. Native camera display and safe touch release remain hardware/runtime gates.
