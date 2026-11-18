/**
 * FieldLens — point your phone at something and learn what it is.
 *
 * One Pollinations account pays for everything: a vision model reads the
 * photo, an image model draws a field-guide plate, a speech model reads the
 * answer out. The key comes from Pollinations Pay (<polli-connect>), so the
 * user spends from their own balance.
 */

const CONFIG = {
    // Publishable App Key (pk_...) from enter.pollinations.ai/keys?tab=app.
    // It identifies FieldLens on the consent screen. Without it the app falls
    // back to a plain Pollinations sign-in link.
    appKey: "",
    genUrl: "https://gen.pollinations.ai",
    enterUrl: "https://enter.pollinations.ai",
    visionModel: "openai/gpt-5.4-nano",
    imageModel: "tongyi-mai/z-image-turbo",
    speechModel: "openai/tts-1",
    maxImageEdge: 1280,
};

const STORAGE_KEY = "fieldlens:api-key";

const FOCUSES = [
    { id: "auto", label: "Auto", hint: "" },
    {
        id: "plant",
        label: "Plant",
        hint: "Focus on the plant: likely species or family, leaf arrangement, flowers or fruit, and whether any part of it is toxic.",
    },
    {
        id: "tree",
        label: "Tree",
        hint: "Focus on the tree: likely species, bark, leaf shape and arrangement, and how to tell it apart from its look-alikes.",
    },
    {
        id: "rock",
        label: "Rock",
        hint: "Focus on the rock: rock type, minerals, how it formed, and any fossils or unusual features.",
    },
    {
        id: "bird",
        label: "Bird",
        hint: "Focus on the bird: species, age and sex if the photo allows it, the field marks to check, and what it eats and does.",
    },
    {
        id: "insect",
        label: "Insect",
        hint: "Focus on the insect: order, likely family, and whether it stings, bites or is harmless.",
    },
    {
        id: "animal",
        label: "Animal",
        hint: "Focus on the animal: species, size and age, behaviour, and what to do around it.",
    },
    {
        id: "fungus",
        label: "Fungus",
        hint: "Focus on the fungus: likely species, the features that identify it, and a clear warning about edibility.",
    },
    {
        id: "food",
        label: "Food",
        hint: "Focus on the food or drink: what it is, how it is made, and what it tastes like.",
    },
    {
        id: "building",
        label: "Building",
        hint: "Focus on the building or structure: architectural style, period, likely use, and the details worth noticing.",
    },
    {
        id: "artwork",
        label: "Artwork",
        hint: "Focus on the artwork or object: what it is, the period or school, the artist if you recognise them, and the technique.",
    },
    {
        id: "text",
        label: "Text",
        hint: "Focus on the text or sign: transcribe it, then explain what it says and where it comes from.",
    },
    {
        id: "tool",
        label: "Tool",
        hint: "Focus on the tool or object: what it is, what it is used for, and any maker's marks.",
    },
    {
        id: "sky",
        label: "Sky",
        hint: "Focus on the sky and weather: what is happening in the clouds, and what it is likely to do next.",
    },
];

const ANALYST_SYSTEM = `You are FieldLens, a field naturalist who looks through the reader's phone camera.

Reply with exactly these three sections and nothing else:

<title>
What is in the photo: the common name first, the scientific name in brackets only when you are sure of it.
</title>

<body>
Two or three short paragraphs. What it is, where it belongs, and the details in the photo that give it away. Plain, concrete and useful. Do not compliment the photo.
</body>

<look_for>
Three to five short lines, one per line, each a sign that confirms your identification or a detail worth checking next. No numbering and no extra commentary.
</look_for>

Rules:
- If you are not sure, say so plainly in the first line of <body> and name the two most likely candidates.
- Never invent measurements, dates, places or scientific names you are not sure of.
- Write for someone standing in front of the subject, not for a textbook.`;

const FOLLOWUP_SYSTEM = `You are FieldLens, a field naturalist answering a follow-up question about the photo the reader just sent.
Answer in two or three short sentences. Be concrete and practical. Use no section tags and no headings. If the photo does not show enough to answer, say what you would need to see.`;

const els = {};
const state = {
    apiKey: null,
    focus: FOCUSES[0],
    photo: null,
    analysis: "",
    title: "",
    body: "",
    lookFor: [],
    facingMode: "environment",
    stream: null,
    busy: false,
    audioUrl: null,
};

function $(id) {
    return document.getElementById(id);
}

/* ------------------------------------------------------------------ text */

function escapeHtml(value) {
    return value
        .replaceAll("&", "&amp;")
        .replaceAll("<", "&lt;")
        .replaceAll(">", "&gt;");
}

function inlineMarkdown(value) {
    return escapeHtml(value)
        .replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>")
        .replace(/(^|\W)\*([^*\n]+)\*(?=\W|$)/g, "$1<em>$2</em>");
}

function section(text, name) {
    const match = text.match(
        new RegExp(`<${name}>([\\s\\S]*?)</${name}>`, "i"),
    );
    return match ? match[1].trim() : "";
}

function parseGuide(text) {
    const title = section(text, "title");
    const body = section(text, "body");
    const lookFor = section(text, "look_for");
    const fallbackTitle = text.split("\n")[0]?.trim() ?? "";
    return {
        title: title || fallbackTitle || "Something in the frame",
        body: body || text.trim(),
        lookFor: lookFor
            .split("\n")
            .map((line) => line.replace(/^[-*•\d.)]+\s*/, "").trim())
            .filter(Boolean),
    };
}

function paragraphs(text) {
    return text
        .split(/\n{2,}/)
        .map((part) => part.trim())
        .filter(Boolean)
        .map((part) => `<p>${inlineMarkdown(part).replace(/\n/g, "<br>")}</p>`)
        .join("");
}

/* ----------------------------------------------------------------- toast */

let toastTimer;
function toast(message, isError = false) {
    els.toast.textContent = message;
    els.toast.classList.toggle("error", isError);
    els.toast.hidden = false;
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => {
        els.toast.hidden = true;
    }, isError ? 6000 : 3200);
}

async function apiError(response, fallback) {
    let detail = "";
    try {
        const body = await response.json();
        detail =
            body?.error?.message ??
            body?.error ??
            body?.message ??
            body?.detail ??
            "";
        if (typeof detail === "object") detail = detail.message ?? "";
    } catch {
        detail = "";
    }
    if (response.status === 402) {
        return "Not enough Pollen on this key. Add more at enter.pollinations.ai.";
    }
    if (response.status === 401) {
        return "That key was refused. Connect your Pollinations account again.";
    }
    return detail ? `${fallback}: ${detail}` : fallback;
}

/* ------------------------------------------------------------------ auth */

/* ------------------------------------------------------------- sign in */

/**
 * The key of a visitor who just came back from the consent screen, either in
 * the URL fragment or from an earlier visit in this tab.
 */
function readStoredKey() {
    const hash = new URLSearchParams(location.hash.slice(1));
    const fromHash = hash.get("api_key");
    if (fromHash) {
        history.replaceState({}, "", location.pathname + location.search);
        sessionStorage.setItem(STORAGE_KEY, fromHash);
        return fromHash;
    }
    try {
        return sessionStorage.getItem(STORAGE_KEY);
    } catch {
        return null;
    }
}

function adoptKey(key) {
    state.apiKey = key || null;
    try {
        if (state.apiKey) {
            sessionStorage.setItem(STORAGE_KEY, state.apiKey);
        } else {
            sessionStorage.removeItem(STORAGE_KEY);
        }
    } catch {
        /* A blocked sessionStorage must not break the sign-in. */
    }
    setConnected(Boolean(state.apiKey));
    if (state.apiKey) refreshBalance();
}

function setConnected(connected) {
    els.balance.hidden = !connected;
    els.veilTitle.textContent = connected
        ? "Point your camera at something"
        : "Connect your Pollinations account";
    els.veilNote.textContent = connected
        ? "A plant, a rock, a bird, a dish, a building — FieldLens names it and tells you what to look for."
        : "Sign in with Pollinations to identify photos. You pay from your own balance, one request at a time.";
    els.shutter.disabled = !connected;
    if (els.connect) return;
    els.signinBtn.hidden = false;
    els.signinBtn.textContent = connected ? "Sign out" : "Sign in";
}

async function refreshBalance() {
    if (!state.apiKey) return;
    try {
        const response = await fetch(`${CONFIG.genUrl}/account/balance`, {
            headers: { Authorization: `Bearer ${state.apiKey}` },
        });
        if (!response.ok) return;
        const body = await response.json();
        const total = body?.accountBalance?.total ?? body?.balance;
        if (typeof total !== "number") return;
        els.balance.textContent = `$${total.toFixed(2)}`;
        els.balance.classList.toggle("low", total < 0.25);
        els.balance.title = "Your Pollinations balance";
    } catch {
        /* The balance chip is a nicety; a failed refresh must not break the app. */
    }
}

/* ---------------------------------------------------------------- camera */

async function startCamera() {
    if (!navigator.mediaDevices?.getUserMedia) {
        els.stage.classList.add("no-camera");
        els.veilNote.textContent =
            "This browser cannot open a camera. Use the Photo button to upload a picture instead.";
        return;
    }
    try {
        const stream = await navigator.mediaDevices.getUserMedia({
            video: {
                facingMode: { ideal: state.facingMode },
                width: { ideal: 1280 },
                height: { ideal: 960 },
            },
            audio: false,
        });
        state.stream = stream;
        els.stage.classList.remove("no-camera");
        els.preview.srcObject = stream;
        els.preview.hidden = false;
        await els.preview.play().catch(() => {});
    } catch {
        els.stage.classList.add("no-camera");
        els.preview.hidden = true;
        els.veilNote.textContent =
            "No camera available. Use the Photo button to upload a picture instead.";
    }
}

function stopCamera() {
    state.stream?.getTracks().forEach((track) => track.stop());
    state.stream = null;
}

function resizeToEdge(source, sourceWidth, sourceHeight) {
    const scale = Math.min(
        1,
        CONFIG.maxImageEdge / Math.max(sourceWidth, sourceHeight),
    );
    const canvas = document.createElement("canvas");
    canvas.width = Math.round(sourceWidth * scale);
    canvas.height = Math.round(sourceHeight * scale);
    canvas.getContext("2d").drawImage(source, 0, 0, canvas.width, canvas.height);
    return canvas.toDataURL("image/jpeg", 0.85);
}

function frameToDataUrl() {
    const video = els.preview;
    if (!video.videoWidth) return null;
    return resizeToEdge(video, video.videoWidth, video.videoHeight);
}

async function fileToDataUrl(file) {
    const bitmap = await createImageBitmap(file, {
        imageOrientation: "from-image",
    }).catch(() => null);
    if (bitmap) {
        const dataUrl = resizeToEdge(bitmap, bitmap.width, bitmap.height);
        bitmap.close?.();
        return dataUrl;
    }
    const url = URL.createObjectURL(file);
    try {
        const image = new Image();
        image.src = url;
        await image.decode();
        return resizeToEdge(image, image.naturalWidth, image.naturalHeight);
    } finally {
        URL.revokeObjectURL(url);
    }
}

/* ----------------------------------------------------------------- model */

async function* streamChat(messages, signal) {
    const response = await fetch(`${CONFIG.genUrl}/v1/chat/completions`, {
        method: "POST",
        headers: {
            Authorization: `Bearer ${state.apiKey}`,
            "Content-Type": "application/json",
        },
        body: JSON.stringify({
            model: CONFIG.visionModel,
            stream: true,
            messages,
        }),
        signal,
    });
    if (!response.ok) {
        throw new Error(await apiError(response, "The vision model failed"));
    }
    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let buffer = "";
    for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        let boundary = buffer.indexOf("\n\n");
        while (boundary !== -1) {
            const chunk = buffer.slice(0, boundary);
            buffer = buffer.slice(boundary + 2);
            const line = chunk
                .split("\n")
                .find((part) => part.startsWith("data:"));
            if (line) {
                const payload = line.slice(5).trim();
                if (payload && payload !== "[DONE]") {
                    try {
                        const parsed = JSON.parse(payload);
                        const delta =
                            parsed?.choices?.[0]?.delta?.content ?? "";
                        if (delta) yield delta;
                    } catch {
                        /* Ignore keep-alive frames and partial JSON. */
                    }
                }
            }
            boundary = buffer.indexOf("\n\n");
        }
    }
}

function renderGuide(text) {
    const guide = parseGuide(text);
    els.guideTitle.textContent = guide.title;
    els.guideBody.innerHTML = paragraphs(guide.body);
    els.guideLook.hidden = guide.lookFor.length === 0;
    els.guideLookList.innerHTML = guide.lookFor
        .map((line) => `<li>${inlineMarkdown(line)}</li>`)
        .join("");
    return guide;
}

async function analysePhoto() {
    const photo = state.photo ?? frameToDataUrl();
    if (!photo) {
        toast("Take a photo or upload one first.", true);
        return;
    }
    if (!state.apiKey) {
        toast("Connect your Pollinations account first.", true);
        return;
    }

    state.photo = photo;
    els.shotImg.src = photo;
    els.shotFocus.textContent = state.focus.label;
    els.shotImg.alt = `Photo analysed as ${state.focus.label}`;

    const hint = state.focus.hint ? `\n\n${state.focus.hint}` : "";
    const messages = [
        { role: "system", content: ANALYST_SYSTEM },
        {
            role: "user",
            content: [
                {
                    type: "text",
                    text: `What is this?${hint}`,
                },
                { type: "image_url", image_url: { url: photo } },
            ],
        },
    ];

    setBusy(true);
    showResult();
    els.guideBody.innerHTML = "";
    els.guideLook.hidden = true;
    els.guideTitle.textContent = "Looking…";
    state.analysis = "";

    try {
        for await (const delta of streamChat(messages)) {
            state.analysis += delta;
            renderGuide(state.analysis);
        }
        const guide = renderGuide(state.analysis);
        state.title = guide.title;
        state.body = guide.body;
        state.lookFor = guide.lookFor;
    } catch (error) {
        els.guideTitle.textContent = "Could not read that photo";
        els.guideBody.innerHTML = `<p>${escapeHtml(
            error instanceof Error ? error.message : String(error),
        )}</p>`;
    } finally {
        setBusy(false);
        refreshBalance();
    }
}

async function askFollowUp(question) {
    if (!state.apiKey || !state.photo) return;
    const bubble = document.createElement("div");
    bubble.className = "bubble bot streaming";
    bubble.textContent = "…";
    els.chatLog.append(bubble);
    bubble.scrollIntoView({ block: "nearest" });

    const messages = [
        { role: "system", content: FOLLOWUP_SYSTEM },
        {
            role: "user",
            content: [
                { type: "text", text: "What is this?" },
                { type: "image_url", image_url: { url: state.photo } },
            ],
        },
        { role: "assistant", content: state.analysis || state.title },
        { role: "user", content: question },
    ];

    let answer = "";
    try {
        for await (const delta of streamChat(messages)) {
            answer += delta;
            bubble.textContent = answer;
            bubble.scrollIntoView({ block: "nearest" });
        }
    } catch (error) {
        bubble.textContent =
            error instanceof Error ? error.message : String(error);
    } finally {
        bubble.classList.remove("streaming");
        refreshBalance();
    }
}

async function illustrate() {
    if (!state.apiKey) return;
    const title = state.title || "the subject of the photo";
    const firstLine = (state.body || "").split("\n")[0].slice(0, 220);
    const prompt = `A vintage natural history field guide plate of ${title}. ${firstLine}. Hand-painted watercolour and ink on cream paper, one subject centred, botanical plate style, fine detail, muted natural colours, no text, no frame, no watermark.`;
    els.illustrateBtn.disabled = true;
    els.illustrateBtn.textContent = "Drawing…";
    try {
        const response = await fetch(`${CONFIG.genUrl}/v1/images/generations`, {
            method: "POST",
            headers: {
                Authorization: `Bearer ${state.apiKey}`,
                "Content-Type": "application/json",
            },
            body: JSON.stringify({
                model: CONFIG.imageModel,
                prompt,
                size: "1024x1024",
                n: 1,
                response_format: "url",
            }),
        });
        if (!response.ok) {
            throw new Error(await apiError(response, "The image model failed"));
        }
        const body = await response.json();
        const url = body?.data?.[0]?.url;
        if (!url) throw new Error("The image model returned no image.");
        els.plateImg.src = url;
        els.plate.hidden = false;
        els.plate.scrollIntoView({ behavior: "smooth", block: "nearest" });
    } catch (error) {
        toast(
            error instanceof Error ? error.message : String(error),
            true,
        );
    } finally {
        els.illustrateBtn.disabled = false;
        els.illustrateBtn.textContent = "Illustrate";
        refreshBalance();
    }
}

async function speak() {
    if (!state.apiKey) return;
    const text = `${state.title}. ${(state.body || "").split("\n\n")[0]}`;
    els.speakBtn.disabled = true;
    try {
        const response = await fetch(`${CONFIG.genUrl}/v1/audio/speech`, {
            method: "POST",
            headers: {
                Authorization: `Bearer ${state.apiKey}`,
                "Content-Type": "application/json",
            },
            body: JSON.stringify({
                model: CONFIG.speechModel,
                input: text.slice(0, 1200),
                voice: "alloy",
                response_format: "mp3",
            }),
        });
        if (!response.ok) {
            throw new Error(await apiError(response, "The speech model failed"));
        }
        const blob = await response.blob();
        if (state.audioUrl) URL.revokeObjectURL(state.audioUrl);
        state.audioUrl = URL.createObjectURL(blob);
        const audio = new Audio(state.audioUrl);
        await audio.play().catch(() => {});
    } catch (error) {
        toast(error instanceof Error ? error.message : String(error), true);
    } finally {
        els.speakBtn.disabled = false;
        refreshBalance();
    }
}

/* ------------------------------------------------------------------ view */

function showResult() {
    document.body.classList.remove("mode-capture");
    document.body.classList.add("mode-result");
    els.result.hidden = false;
    els.capture.hidden = true;
    stopCamera();
}

function showCapture() {
    document.body.classList.remove("mode-result");
    document.body.classList.add("mode-capture");
    els.result.hidden = true;
    els.capture.hidden = false;
    els.chatLog.innerHTML = "";
    els.plate.hidden = true;
    state.photo = null;
    state.analysis = "";
    startCamera();
}

function setBusy(busy) {
    state.busy = busy;
    els.shutter.disabled = busy || !state.apiKey;
    els.illustrateBtn.disabled = busy;
    els.speakBtn.disabled = busy;
}

/* ------------------------------------------------------------------- init */

/**
 * Pollinations Pay renders the official connect button, but only for an app
 * with a publishable App Key. Without one the app falls back to the plain
 * authorize link, which still hands the visitor a scoped key for their own
 * balance.
 */
function createConnectButton() {
    if (!CONFIG.appKey.startsWith("pk_")) return null;
    if (!customElements.get("polli-connect")) return null;
    const connect = document.createElement("polli-connect");
    connect.setAttribute("app-key", CONFIG.appKey);
    connect.setAttribute("budget", "5");
    connect.setAttribute("expiry", "30");
    connect.setAttribute("models", "text,image,audio");
    connect.setAttribute("permissions", "usage");
    connect.setAttribute(
        "menu-links",
        JSON.stringify([
            {
                label: "Quests",
                href: "https://enter.pollinations.ai/quests",
                icon: "app",
            },
        ]),
    );
    els.topbarRight.prepend(connect);
    return connect;
}

function buildFocusStrip() {
    els.focusStrip.innerHTML = "";
    for (const focus of FOCUSES) {
        const chip = document.createElement("button");
        chip.type = "button";
        chip.className = "chip";
        chip.textContent = focus.label;
        chip.setAttribute(
            "aria-pressed",
            String(focus.id === state.focus.id),
        );
        chip.addEventListener("click", () => {
            state.focus = focus;
            for (const other of els.focusStrip.children) {
                other.setAttribute(
                    "aria-pressed",
                    String(other === chip),
                );
            }
        });
        els.focusStrip.append(chip);
    }
}

function bind() {
    els.shutter.addEventListener("click", () => {
        if (!state.apiKey) {
            toast("Connect your Pollinations account first.", true);
            return;
        }
        analysePhoto();
    });

    els.uploadBtn.addEventListener("click", () => els.fileInput.click());

    els.fileInput.addEventListener("change", async (event) => {
        const file = event.target.files?.[0];
        event.target.value = "";
        if (!file) return;
        try {
            state.photo = await fileToDataUrl(file);
            await analysePhoto();
        } catch {
            toast("That file could not be read as a photo.", true);
        }
    });

    els.flipBtn.addEventListener("click", () => {
        state.facingMode =
            state.facingMode === "environment" ? "user" : "environment";
        startCamera();
    });

    els.againBtn.addEventListener("click", showCapture);
    els.illustrateBtn.addEventListener("click", illustrate);
    els.speakBtn.addEventListener("click", speak);

    els.chatForm.addEventListener("submit", async (event) => {
        event.preventDefault();
        const question = els.chatInput.value.trim();
        if (!question) return;
        els.chatInput.value = "";
        const bubble = document.createElement("div");
        bubble.className = "bubble user";
        bubble.textContent = question;
        els.chatLog.append(bubble);
        await askFollowUp(question);
    });

    els.connect?.addEventListener("change", () => {
        adoptKey(els.connect.apiKey || null);
    });

    els.signinBtn.addEventListener("click", () => {
        if (state.apiKey) {
            adoptKey(null);
            return;
        }
        const params = new URLSearchParams({
            redirect_uri: `${location.origin}${location.pathname}`,
            scope: "usage",
        });
        location.href = `${CONFIG.enterUrl}/authorize?${params}`;
    });

    document.addEventListener("visibilitychange", () => {
        if (document.hidden) stopCamera();
    });
}

function init() {
    Object.assign(els, {
        preview: $("preview"),
        veilTitle: $("veil-title"),
        veilNote: $("veil-note"),
        focusStrip: $("focus-strip"),
        shutter: $("shutter"),
        uploadBtn: $("upload-btn"),
        flipBtn: $("flip-btn"),
        fileInput: $("file-input"),
        capture: $("capture"),
        result: $("result"),
        shotImg: $("shot-img"),
        shotFocus: $("shot-focus"),
        guideTitle: $("guide-title"),
        guideBody: $("guide-body"),
        guideLook: $("guide-look"),
        guideLookList: $("guide-look-list"),
        plate: $("plate"),
        plateImg: $("plate-img"),
        illustrateBtn: $("illustrate-btn"),
        speakBtn: $("speak-btn"),
        againBtn: $("again-btn"),
        chatLog: $("chat-log"),
        chatForm: $("chat-form"),
        chatInput: $("chat-input"),
        balance: $("balance"),
        topbarRight: $("topbar-right"),
        stage: $("stage"),
        connect: null,
        signinBtn: $("signin-btn"),
        toast: $("toast"),
    });

    els.connect = createConnectButton();
    els.signinBtn.hidden = Boolean(els.connect);

    buildFocusStrip();
    bind();
    setConnected(false);
    adoptKey(readStoredKey());
    startCamera();
}

init();
