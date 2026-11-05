# Voice-over for the demo video

The video is finished and silent. This adds a voice track without changing the picture. Nothing here costs money.

**Script with timings:** [`voiceover.srt`](voiceover.srt), 28 cues, written to match the on-screen captions and ending at
2:51.9. It needs the video, `proofpay-demo.mp4`, from Dang.

## Record

1. Open the video in VLC, muted, and load the subtitles: **Subtitle > Add Subtitle File > `voiceover.srt`**.
2. Start recording in Audacity (free) or on a phone, in a quiet room, with a clap at the start if using a phone.
3. Play the video and read each line while it's on screen. It's about 2.2 words a second, so an easy pace fits.
4. Export as WAV or MP3. A retake of one line is fine: send it with its cue number.

One line is tight: cue 26, the held-out numbers. Keep this one even if it means reading a little faster.

## Say these exactly

Don't reword these, because they are the claims we stand behind:

- **Cue 7:** "This run uses a saved AI result for the sample, so the demo needs no AI key."
- **Cue 26:** "On 3 held-out orders, one run each: 4 of 4 planted issues found, 0 false blocking findings, 3 of 4 artwork
  re-check fields as expected."
- **Cue 28:** "AI-assisted verification backed by merchant and customer confirmation."

Other lines can be adjusted to sound natural, as long as they don't add a claim. Don't say the AI guarantees a correct
print, don't quote the tuning numbers, and don't add music.

## How to say it

| Written | Say |
|---|---|
| `qwen3-vl` | "kwen three V L" (check with Dang if unsure) |
| 120 / 150 shirts | "a hundred and twenty" / "a hundred and fifty" |
| 2025 | "twenty twenty-five" |
| $1,425 | "fourteen twenty-five" or "one thousand four hundred twenty-five dollars", if there's time |
| `custom_id` | "custom ID" |

## Add it to the video

```bash
ffmpeg -i proofpay-demo.mp4 -i voiceover.wav -map 0:v -map 1:a -c:v copy -c:a aac -b:a 160k -shortest proofpay-demo-vo.mp4
```

This keeps the picture as it is. The result must stay under 3:00, and the voice should finish before the picture ends.

## The limits line

The numbers card also shows "Small sample, written by the same person who did the final tuning. No general accuracy
claim." There isn't time to read it in the 10 seconds the card is up, so it's on screen but not spoken. Speaking it needs
about 6 more seconds on that card, which is possible (2:58 in total) but means rebuilding S6, the last scene, and
exporting again.

## YouTube captions

`voiceover.srt` can also be uploaded as YouTube captions. They sit at the bottom of the frame and can cover the page text
and the S4 caption bar, so leave them off by default and don't burn them in.
