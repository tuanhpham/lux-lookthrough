# The Professional — Ask ChatGPT (browser extension)

Makes the **Ask ChatGPT** button in the stock modal actually run the prompt inside
your own custom GPT, instead of leaving it for you to paste.

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

1. reads the prompt from the `q` query parameter,
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

## What it does not do

No network requests, no storage, no cookie or credential access, no reading of your
conversations. It asks for **no permissions** beyond running on those two
hostnames — see `manifest.json`, which is 14 lines. One paste, one click.

## If it stops working

The app **always copies the prompt to your clipboard**, including when the
extension is installed. So the worst case is the old behaviour: paste it yourself
with Ctrl/Cmd+V.

That fallback exists because this extension depends on ChatGPT's markup
(`#prompt-textarea`, `[data-testid="send-button"]`), which OpenAI can change without
notice. If a prompt stops arriving, the selectors in `autorun.js` are the first
place to look.
