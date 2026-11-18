# FieldLens

[![Made with pollinations.ai](https://raw.githubusercontent.com/pollinations/pollinations/main/packages/ui/src/brand/badge-made-with.svg)](https://pollinations.ai/?ref=badge)

**Point your phone at anything. FieldLens tells you what it is and what to look for.**

FieldLens is a small mobile web app. Take a photo of a plant, a rock, a bird, a dish or a building, and a vision model reads the picture, names the subject, explains it, and lists the signs that confirm the identification. You can then ask follow-up questions, have an image model draw a field-guide plate of what you photographed, and have a speech model read the answer back to you.

Every request is paid for by you, from your own Pollinations balance. The app never holds a secret key and never pays on your behalf.

Live app: **https://marcus-mok-gh.github.io/fieldlens/**

![FieldLens in the browser](screenshot.png)

## How it works

1. **Sign in.** The app uses [Pollinations Pay](https://github.com/pollinations/pollinations/blob/main/BRING_YOUR_OWN_POLLEN.md). Pollinations hands the visitor a scoped `sk_` key for their own balance; the key lives in `sessionStorage` and never leaves the browser. This checkout ships without an App Key, so it uses the plain **Sign in** link to the same authorize screen and the traffic is not attributed to an app. Add a publishable `pk_` key in `app.js` and the official *Connect* button appears instead, with the budget, expiry and model scopes the visitor approves.
2. **Point and shoot.** `getUserMedia` opens the rear camera. The photo is downscaled in the browser and sent as a data URL.
3. **Read.** The photo goes to a vision model on `https://gen.pollinations.ai/v1/chat/completions` as an `image_url` part. The answer streams back and is rendered as a title, a short explanation and a *Look for* list.
4. **Draw.** *Illustrate* sends the field notes to an image model on `/v1/images/generations` and shows a natural-history plate of your specimen.
5. **Listen.** *Read aloud* sends the summary to a speech model on `/v1/audio/speech` and plays it.

## Models

Every default is in the live model catalog with `paid_only: false`, so a user can run them on a Quest balance.

| Role | Model | `paid_only` | Input | Output | Endpoint |
| --- | --- | --- | --- | --- | --- |
| Vision + text | `openai/gpt-5.4-nano` | false | text, image | text | `/v1/chat/completions` |
| Image | `tongyi-mai/z-image-turbo` | false | text | image | `/v1/images/generations` |
| Speech | `openai/tts-1` | false | text | audio | `/v1/audio/speech` |

The catalog entries are copied verbatim into [`models.json`](models.json), read from <https://gen.pollinations.ai/models> on 2026-11-18:

```json
{"name":"openai/gpt-5.4-nano","paid_only":false,"input_modalities":["text","image"],"output_modalities":["text"]}
{"name":"tongyi-mai/z-image-turbo","paid_only":false,"input_modalities":["text"],"output_modalities":["image"]}
{"name":"openai/tts-1","paid_only":false,"input_modalities":["text"],"output_modalities":["audio"]}
```

The models are constants at the top of `app.js`, so you can point the app at a different vision, image or speech model without touching anything else.

## Run it locally

The app is plain HTML, CSS and JavaScript with no build step. Any static server works, but the camera needs a secure context, so use `localhost` or HTTPS.

```bash
git clone https://github.com/Marcus-Mok-GH/fieldlens.git
cd fieldlens
python3 -m http.server 8000
# open http://localhost:8000
```

Set your own App Key in `app.js` if you fork it:

```js
const CONFIG = {
    appKey: "pk_your_app_key",
    ...
```

Register `http://localhost:8000` as a Redirect URI on that App Key.

## Files

| File | What it holds |
| --- | --- |
| `index.html` | Markup: capture view and result view |
| `styles.css` | Mobile-first dark theme, safe-area aware |
| `app.js` | Camera, Pollinations calls, rendering |
| `favicon.svg` | App icon |
| `screenshot.png` | Screenshot used for the app catalog |

## Privacy

Photos are resized in the browser and sent straight to `gen.pollinations.ai` for analysis. Nothing is stored on a server, and FieldLens has no backend of its own.

## License

MIT
