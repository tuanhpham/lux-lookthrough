# The Professional — Ask ChatGPT (browser extension)

Makes every **Ask ChatGPT** button in the app — the stock modal's research prompts,
a Case Study, the Playbook's prompt library — actually run the prompt inside your own
custom GPT, instead of leaving it for you to paste.

## Why it is needed

ChatGPT's `?q=` URL parameter pre-fills and auto-submits on the plain chat page.
On a **custom GPT** (`chatgpt.com/g/g-…`) it does not — and OpenAI publishes no API
for custom GPTs, so there is no server-side way to invoke one. The only remaining
route is to do in the page what you would do by hand: put the text in the composer
and press send. That requires code running on the ChatGPT tab, which is what this
extension is.

## Install (Chrome / Edge / Brave)

1. Open `chrome://extensions` (Edge: `edge://extensions`).
2. Turn on **Developer mode**.
3. Click **Load unpacked** and select this `extension/` folder.

Firefox: `about:debugging` → **This Firefox** → **Load Temporary Add-on** → pick
`manifest.json`. Firefox drops temporary add-ons on restart; for a permanent
install the extension has to be signed by Mozilla.

There is nothing to configure. Set your GPT link in the app (**Set my GPT** in the
prompts section) and the button does the rest.

## What it does, precisely

It runs only on `chatgpt.com` and `chat.openai.com`, and only when the URL carries
the `#tp-autorun` fragment that the app adds when you click Ask ChatGPT. On such a
page it:

1. reads the prompt — from the `q` query parameter, or from the marker itself,
2. strips the marker from the URL,
3. waits for the composer to mount,
4. pastes the prompt and clicks send.

**The marker is required, and it is stripped before anything is typed.** That makes
the action single-shot: reloading, navigating back, or restoring the session gives
you an ordinary ChatGPT page, and nothing is re-sent. Without the marker the script
does nothing at all — it does not read the composer, and it does not click. Acting
on any page that merely has `?q=` would risk submitting a message you were still
editing.

The fragment is also why the marker never reaches OpenAI: fragments are not part of
the HTTP request, so it stays between the app and this extension.

### Two ways the prompt arrives

Normally it rides in `?q=`. Long prompts cannot: some proxies truncate request lines
around 8 KB, and the app refuses to ship a prompt that might lose its tail. For those
the app puts the prompt **inside the marker** — `#tp-autorun=<encoded>` — which no
proxy sees and no server length limit applies to. The case-study prompt in
Vietnamese, at ~8.5 KB encoded, is the one that needs this.

On the **plain** chat page the `?q=` form is deliberately left alone, because ChatGPT
submits that itself; filling the composer again would send the same prompt twice. The
script only types on a custom GPT (`/g/…`), or when the prompt came in the marker.

It runs at `document_start` rather than `document_idle`: ChatGPT rewrites its own URL
while booting, so by the time the page is idle the marker can already be gone.

## What it does not do

No network requests, no storage, no cookie or credential access, no reading of your
conversations. It asks for **no permissions** beyond running on those two
hostnames — see `manifest.json`, which is 13 lines. One paste, one click.

## If it stops working

The app **always copies the prompt to your clipboard**, including when the
extension is installed. So the worst case is the old behaviour: paste it yourself
with Ctrl/Cmd+V.

That fallback exists because this extension depends on ChatGPT's markup
(`#prompt-textarea`, `[data-testid="send-button"]`), which OpenAI can change without
notice. If a prompt stops arriving, the selectors in `autorun.js` are the first
place to look.
