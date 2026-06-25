const STORAGE_KEY = 'auth_unlocked';
const ENV_CODES = (
  (import.meta as unknown as { env?: Record<string, string> }).env?.VITE_ACCESS_CODES ?? ''
)
  .split(',')
  .map((s) => s.trim().toLowerCase())
  .filter(Boolean);

export function isUnlocked(): boolean {
  if (!ENV_CODES.length) return true; // no code configured → always open
  return localStorage.getItem(STORAGE_KEY) === '1';
}

/** Show the gate modal. Calls `onSuccess` if the correct code is entered. */
export function showGate(onSuccess: () => void): void {
  if (isUnlocked()) { onSuccess(); return; }

  const host = document.createElement('div');
  host.className = 'modal dialog-host';
  host.innerHTML = `
    <div class="modal-backdrop gate-backdrop"></div>
    <div class="gate-panel">
      <div class="gate-lock">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <rect x="3" y="11" width="18" height="11" rx="2" ry="2"/>
          <path d="M7 11V7a5 5 0 0 1 10 0v4"/>
        </svg>
      </div>
      <h2 class="gate-title">Private access</h2>
      <p class="gate-sub">Enter your invite code to access the screener tools.</p>
      <input id="gate-input" class="field gate-field" type="password" placeholder="Access code" autocomplete="off" />
      <p id="gate-error" class="gate-error hidden">Incorrect code — try again.</p>
      <button id="gate-submit" class="btn gate-btn">Unlock →</button>
    </div>`;
  document.body.appendChild(host);

  const input = host.querySelector<HTMLInputElement>('#gate-input')!;
  const errMsg = host.querySelector<HTMLElement>('#gate-error')!;

  const attempt = () => {
    const val = input.value.trim().toLowerCase();
    if (ENV_CODES.includes(val)) {
      localStorage.setItem(STORAGE_KEY, '1');
      host.remove();
      onSuccess();
    } else {
      errMsg.classList.remove('hidden');
      input.value = '';
      input.focus();
    }
  };

  host.querySelector('#gate-submit')!.addEventListener('click', attempt);
  input.addEventListener('keydown', (e) => { if (e.key === 'Enter') attempt(); });
  host.querySelector('.gate-backdrop')!.addEventListener('click', () => host.remove());
  host.querySelector('.gate-backdrop')!.addEventListener('touchend', () => host.remove());

  requestAnimationFrame(() => input.focus());
}
