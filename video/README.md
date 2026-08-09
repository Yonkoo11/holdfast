# Holdfast demo video

The main judge cut is a 90-second, screenshot-driven demonstration built from
the verified product captures in `public/assets/`. It uses one continuous
narration track, sentence captions, and no simulated wallet transactions.

Build both local deliverables:

```bash
bash video/assemble.sh
```

Expected local outputs (ignored by Git until explicitly uploaded):

- `video/out/holdfast-demo.mp4` — H.264/AAC, 1280×720, 30 fps, 90 seconds
- `video/out/holdfast-social.mp4` — H.264, 1080×1920, 30 fps, 10 seconds

The narration was generated as one continuous Edge TTS recording. Captions are
authored from the approved rehearsal script. Publishing either file requires
explicit approval.
