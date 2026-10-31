# Camera integration boundary

Required behavior: reverse automatically takes the main screen, then restores the previous screen after shifting out. A dedicated Cameras page must also support intentional manual viewing, with room for future front/trailer sources.

Implemented here: the controller follows authoritative native camera-front overrides, preserves the explicit prior screen, and restores it when native authority returns. A startup camera overlay does not consume a pending saved projection restoration. Camera is not persisted as the user's startup preference.

Pending: dedicated manual Cameras page and distinction between manual camera ownership and reverse ownership; verified reverse signal; video capture/source selection; capture readiness and stale-frame detection; actual compositor/camera tests. No camera hardware, connector, wiring, resolution, latency or reverse signal source has been selected. No fake or stale camera image is displayed in this checkpoint.

The host must not infer reverse merely because a camera page is open. A disconnected or stale feed must show its unavailable state, never a cached frame as live. Manual route changes during an override need deliberate restoration ownership, as in the separate call arbitration model. Camera display and safe touch release remain hardware/runtime gates.

Pinned LIVI `4bcd1335c2daedba40640e6dc432cd2ed7acfaa4` implements camera content in `Camera.tsx` using browser `getUserMedia`, unlike the native projection/cluster planes. Earlier descriptions grouping camera with those planes were inaccurate. This shell does not request capture or enumerate devices. Main and secondary camera ownership now show an opaque “Camera unavailable” surface instead of clearing the panel and implying a feed exists. Repeated camera/cluster transitions and disconnects are source-tested.

Choose the capture source and permission/ownership policy before implementing capture. Then test late permission/capture completion, track disposal on replacement/disconnect/shutdown, source loss, repeated manual/reverse takeovers and restoration. Actual reverse-signal behavior remains unverified; authoritative camera-front state alone does not identify its cause.
