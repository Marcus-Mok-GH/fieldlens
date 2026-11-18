# FieldLens

**Point your phone at something. FieldLens names it and tells you what to look for.**

FieldLens is a mobile web app that reads the photo on your phone and explains it: what
the thing is, how to tell it apart from its look-alikes, and which details are worth a
closer look. It then draws a field-guide plate of your subject and can read the answer
aloud.

[![Made with pollinations.ai](https://raw.githubusercontent.com/pollinations/pollinations/main/packages/ui/src/brand/badge-made-with.svg)](https://pollinations.ai/?ref=badge)

## Try it

**[fieldlens.app](https://marcus-mok-gh.github.io/fieldlens/)** — open it on a phone,
sign in with Pollinations, point the camera at something.

## How it works

Everything runs on Pollinations, through one API and one account:

| Step | Model | What it does |
| --- | --- | --- |
| Identify | `openai/gpt-5.4-nano` (vision) | Reads the photo and streams the field notes back |
| Illustrate | `tongyi-mai/z-image-turbo` | Draws a natural-history plate of what you photographed |
| Read aloud | `openai/tts-1` | Speaks the summary |

Every model is free-tier, so a Quest balance is enough.

### You pay from your own balance

FieldLens never holds a key of its own. Sign-in is
[Pollinations Pay](https://github.com/pollinations/pollinations/blob/main/BRING_YOUR_OWN_POLLEN.md):
the `<polli-connect>` button sends the visitor to Pollinations, the visitor approves a
scoped key from their own account, and that key is what pays for every request. The
header shows the remaining balance, so the cost of each scan is visible.

The app key (`pk_…`) is a publishable App Key. It identifies the app and carries no
value of its own.

## Features

- **Live camera** with a one-tap shutter, plus photo upload when the camera is not
  available.
- **Focus chips** — Auto, Plant, Tree, Rock, Animal, Bird, Insect, Food, Art, Text,
  Landmark — that steer the model towards what you actually want to know.
- **Streamed answers** in three parts: what it is, why it looks like that, and a
  *Look for* list of the signs that confirm it.
- **Follow-up questions** about the same photo.
- **Illustrate** draws a field-guide plate from the identification.
- **Read aloud** speaks the summary.

## Run it locally

It is a static page with no build step:

```bash
git clone https://github.com/Marcus-Mok-GH/fieldlens.git
cd fieldlens
python3 -m http.server 8080
```

Then open <http://localhost:8080>. The camera needs a secure context, so use HTTPS or
a tunnel for camera access on a phone; the upload button works over plain HTTP.

## Configuration

Everything configurable sits at the top of `app.js`:

```js
const CONFIG = {
    appKey: "pk_…",
    genUrl: "https://gen.pollinations.ai",
    visionModel: "openai/gpt-5.4-nano",
    imageModel: "tongyi-mai/z-image-turbo",
    speechModel: "openai/tts-1",
    maxImageEdge: 1280,
};
```

The App Key's Redirect URI must be the page URL, for example
`https://marcus-mok-gh.github.io/fieldlens/`.

## Files

```
index.html   markup
styles.css   styling
app.js       camera, Pollinations calls, rendering
```

## Credits

Built with [Pollinations](https://pollinations.ai) models and Pollinations Pay.
